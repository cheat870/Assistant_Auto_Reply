import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import yauzl from 'yauzl';
import tar from 'tar-stream';
import {
  ARCHIVE_EXTENSIONS,
  EXECUTABLE_EXTENSIONS,
  MAGIC_BYTES,
  SCRIPT_EXTENSIONS,
} from '../config/constants.js';
import type { ArchiveAnalysisResult, ArchiveEntry } from '../types/index.js';
import { logger } from '../utils/logger.js';

interface ArchiveLimits {
  maxEntries: number;
  maxTotalSizeMB: number;
}

const DEFAULT_LIMITS: ArchiveLimits = {
  maxEntries: 1000,
  maxTotalSizeMB: 200,
};

/**
 * Checks if a filename inside an archive is an executable or script.
 */
export function isDangerousEntry(entryPath: string): { dangerous: boolean; reason?: string } {
  const ext = path.extname(entryPath).toLowerCase();
  if (EXECUTABLE_EXTENSIONS.has(ext)) {
    return { dangerous: true, reason: `Executable file detected: ${ext}` };
  }
  if (SCRIPT_EXTENSIONS.has(ext)) {
    return { dangerous: true, reason: `Script file detected: ${ext}` };
  }
  if (ARCHIVE_EXTENSIONS.has(ext)) {
    return { dangerous: true, reason: `Nested archive detected: ${ext}` };
  }
  return { dangerous: false };
}

/**
 * Inspects a ZIP file safely using yauzl by reading only the central directory.
 */
function inspectZipArchive(
  filePath: string,
  limits: ArchiveLimits
): Promise<ArchiveAnalysisResult> {
  return new Promise(resolve => {
    const entries: ArchiveEntry[] = [];
    const indicators: string[] = [];
    let totalUncompressedSize = 0;
    let hasExecutableContent = false;
    let hasNestedArchives = false;
    let isSuspectedZipBomb = false;

    yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err || !zipfile) {
        indicators.push(`Failed to parse ZIP archive: ${err ? err.message : 'Unknown error'}`);
        return resolve({
          isArchive: true,
          archiveType: 'ZIP',
          entryCount: 0,
          totalUncompressedSize: 0,
          entries: [],
          hasExecutableContent: false,
          hasNestedArchives: false,
          isSuspectedZipBomb: false,
          indicators,
        });
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry: yauzl.Entry) => {
        // Enforce maximum entries limit
        if (entries.length >= limits.maxEntries) {
          isSuspectedZipBomb = true;
          indicators.push(`Archive exceeded maximum allowed entries limit (${limits.maxEntries})`);
          zipfile.close();
          return;
        }

        // Prevent path traversal
        const fileName = entry.fileName;
        if (
          fileName.includes('../') ||
          fileName.includes('..\\') ||
          path.isAbsolute(fileName) ||
          /^[a-zA-Z]:/.test(fileName)
        ) {
          indicators.push(`Malicious path traversal detected in archive entry: "${fileName}"`);
        }

        const uncompressed = entry.uncompressedSize;
        const compressed = entry.compressedSize;
        totalUncompressedSize += uncompressed;

        // Check total uncompressed size limit
        if (totalUncompressedSize > limits.maxTotalSizeMB * 1024 * 1024) {
          isSuspectedZipBomb = true;
          indicators.push(
            `Archive uncompressed size exceeds limit of ${limits.maxTotalSizeMB} MB (possible zip bomb)`
          );
          zipfile.close();
          return;
        }

        // Check compression ratio bomb indicator
        if (compressed > 0 && uncompressed > 10 * 1024 * 1024) {
          const ratio = uncompressed / compressed;
          if (ratio > 100) {
            isSuspectedZipBomb = true;
            indicators.push(
              `Abnormally high compression ratio (${Math.round(ratio)}:1) for entry: ${fileName}`
            );
          }
        }

        // Check if entry is suspicious
        const danger = isDangerousEntry(fileName);
        const isEncrypted = (entry.generalPurposeBitFlag & 0x1) !== 0;

        if (danger.dangerous) {
          if (danger.reason?.includes('Executable')) hasExecutableContent = true;
          if (danger.reason?.includes('Nested')) hasNestedArchives = true;
          indicators.push(`Contains suspicious entry: ${fileName} (${danger.reason})`);
        }

        if (isEncrypted) {
          indicators.push(`Archive entry is password-protected/encrypted: ${fileName}`);
        }

        // Only add non-directory entries
        if (!fileName.endsWith('/') && !fileName.endsWith('\\')) {
          entries.push({
            path: fileName,
            size: uncompressed,
            compressedSize: compressed,
            isEncrypted,
            isSuspicious: danger.dangerous,
            suspiciousReason: danger.reason,
          });
        }

        zipfile.readEntry();
      });

      zipfile.on('end', () => {
        resolve({
          isArchive: true,
          archiveType: 'ZIP',
          entryCount: entries.length,
          totalUncompressedSize,
          entries,
          hasExecutableContent,
          hasNestedArchives,
          isSuspectedZipBomb,
          indicators,
        });
      });

      zipfile.on('error', parseErr => {
        const msg = parseErr.message;
        if (msg.includes('relative path') || msg.includes('fileName') || msg.includes('..')) {
          indicators.push(`Path traversal detected in archive entry: ${msg}`);
        } else {
          indicators.push(`Error during ZIP processing: ${msg}`);
        }
        resolve({
          isArchive: true,
          archiveType: 'ZIP',
          entryCount: entries.length,
          totalUncompressedSize,
          entries,
          hasExecutableContent,
          hasNestedArchives,
          isSuspectedZipBomb,
          indicators,
        });
      });
    });
  });
}

/**
 * Inspects a TAR or TAR.GZ archive safely using tar-stream.
 */
function inspectTarArchive(
  filePath: string,
  isGzip: boolean,
  limits: ArchiveLimits
): Promise<ArchiveAnalysisResult> {
  return new Promise(resolve => {
    const entries: ArchiveEntry[] = [];
    const indicators: string[] = [];
    let totalUncompressedSize = 0;
    let hasExecutableContent = false;
    let hasNestedArchives = false;
    let isSuspectedZipBomb = false;

    const extract = tar.extract();

    extract.on('entry', (header, stream, next) => {
      if (entries.length >= limits.maxEntries) {
        isSuspectedZipBomb = true;
        indicators.push(`Archive exceeded maximum allowed entries (${limits.maxEntries})`);
        stream.resume();
        extract.destroy();
        return;
      }

      const fileName = header.name;
      if (fileName.includes('../') || fileName.includes('..\\') || path.isAbsolute(fileName)) {
        indicators.push(`Path traversal detected in TAR entry: "${fileName}"`);
      }

      const size = header.size || 0;
      totalUncompressedSize += size;

      if (totalUncompressedSize > limits.maxTotalSizeMB * 1024 * 1024) {
        isSuspectedZipBomb = true;
        indicators.push(`TAR uncompressed size exceeds limit of ${limits.maxTotalSizeMB} MB`);
        stream.resume();
        extract.destroy();
        return;
      }

      const danger = isDangerousEntry(fileName);
      if (danger.dangerous) {
        if (danger.reason?.includes('Executable')) hasExecutableContent = true;
        if (danger.reason?.includes('Nested')) hasNestedArchives = true;
        indicators.push(`Contains suspicious entry: ${fileName} (${danger.reason})`);
      }

      if (header.type === 'file') {
        entries.push({
          path: fileName,
          size,
          compressedSize: size,
          isEncrypted: false,
          isSuspicious: danger.dangerous,
          suspiciousReason: danger.reason,
        });
      }

      // Resume without storing file contents in memory
      stream.on('end', () => next());
      stream.resume();
    });

    extract.on('finish', () => {
      resolve({
        isArchive: true,
        archiveType: isGzip ? 'GZ' : 'TAR',
        entryCount: entries.length,
        totalUncompressedSize,
        entries,
        hasExecutableContent,
        hasNestedArchives,
        isSuspectedZipBomb,
        indicators,
      });
    });

    extract.on('error', err => {
      indicators.push(`TAR stream error: ${err.message}`);
      resolve({
        isArchive: true,
        archiveType: isGzip ? 'GZ' : 'TAR',
        entryCount: entries.length,
        totalUncompressedSize,
        entries,
        hasExecutableContent,
        hasNestedArchives,
        isSuspectedZipBomb,
        indicators,
      });
    });

    const fileStream = fs.createReadStream(filePath);
    if (isGzip) {
      const gunzip = zlib.createGunzip();
      gunzip.on('error', err => {
        indicators.push(`GZIP decompression error: ${err.message}`);
        resolve({
          isArchive: true,
          archiveType: 'GZ',
          entryCount: 0,
          totalUncompressedSize: 0,
          entries: [],
          hasExecutableContent: false,
          hasNestedArchives: false,
          isSuspectedZipBomb: false,
          indicators,
        });
      });
      fileStream.pipe(gunzip).pipe(extract);
    } else {
      fileStream.pipe(extract);
    }
  });
}

/**
 * Safely inspects archive contents across supported formats.
 * NEVER extracts or executes files on disk.
 */
export async function analyzeArchiveFile(
  filePath: string,
  limits: ArchiveLimits = DEFAULT_LIMITS
): Promise<ArchiveAnalysisResult> {
  const ext = path.extname(filePath).toLowerCase();

  // Read the first 16 bytes for magic byte verification
  let headerBuffer: Buffer;
  try {
    const fd = await fs.promises.open(filePath, 'r');
    headerBuffer = Buffer.alloc(16);
    await fd.read(headerBuffer, 0, 16, 0);
    await fd.close();
  } catch (err) {
    logger.error({ err, filePath }, 'Failed to read archive header');
    return {
      isArchive: false,
      entryCount: 0,
      totalUncompressedSize: 0,
      entries: [],
      hasExecutableContent: false,
      hasNestedArchives: false,
      isSuspectedZipBomb: false,
      indicators: ['Could not read file header'],
    };
  }

  // Check Unix Compress .Z
  if (
    headerBuffer[0] === MAGIC_BYTES.UNIX_COMPRESS_Z[0] &&
    headerBuffer[1] === MAGIC_BYTES.UNIX_COMPRESS_Z[1]
  ) {
    return {
      isArchive: true,
      archiveType: 'COMPRESS_Z',
      entryCount: 1,
      totalUncompressedSize: 0,
      entries: [],
      hasExecutableContent: false,
      hasNestedArchives: false,
      isSuspectedZipBomb: false,
      indicators: [
        'Recognized Unix Compress (.Z) LZW compressed archive format',
        'Compressed archive contents should be reviewed before opening',
      ],
    };
  }

  // Check RAR
  if (
    headerBuffer[0] === 0x52 &&
    headerBuffer[1] === 0x61 &&
    headerBuffer[2] === 0x72 &&
    headerBuffer[3] === 0x21
  ) {
    return {
      isArchive: true,
      archiveType: 'RAR',
      entryCount: 0,
      totalUncompressedSize: 0,
      entries: [],
      hasExecutableContent: false,
      hasNestedArchives: false,
      isSuspectedZipBomb: false,
      indicators: [
        'RAR Archive signature detected',
        'Archive requires administrator review before extracting or opening',
      ],
    };
  }

  // Check 7-Zip
  if (
    headerBuffer[0] === 0x37 &&
    headerBuffer[1] === 0x7a &&
    headerBuffer[2] === 0xbc &&
    headerBuffer[3] === 0xaf
  ) {
    return {
      isArchive: true,
      archiveType: '7Z',
      entryCount: 0,
      totalUncompressedSize: 0,
      entries: [],
      hasExecutableContent: false,
      hasNestedArchives: false,
      isSuspectedZipBomb: false,
      indicators: [
        '7-Zip Archive signature detected',
        'Archive requires administrator review before extracting or opening',
      ],
    };
  }

  // Check ZIP
  if (headerBuffer[0] === 0x50 && headerBuffer[1] === 0x4b) {
    return inspectZipArchive(filePath, limits);
  }

  // Check GZIP or TAR
  if (headerBuffer[0] === 0x1f && headerBuffer[1] === 0x8b) {
    return inspectTarArchive(filePath, true, limits);
  }

  if (ext === '.tar') {
    return inspectTarArchive(filePath, false, limits);
  }

  if (ext === '.z') {
    return {
      isArchive: true,
      archiveType: 'UNKNOWN',
      entryCount: 0,
      totalUncompressedSize: 0,
      entries: [],
      hasExecutableContent: false,
      hasNestedArchives: false,
      isSuspectedZipBomb: false,
      indicators: [
        'Unknown compressed file format (.z)',
        'May contain executable files, scripts, or nested archives',
      ],
    };
  }

  return {
    isArchive: false,
    entryCount: 0,
    totalUncompressedSize: 0,
    entries: [],
    hasExecutableContent: false,
    hasNestedArchives: false,
    isSuspectedZipBomb: false,
    indicators: ['Not a recognized archive format'],
  };
}
