import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeArchiveFile, isDangerousEntry } from '../src/services/archiveScanner.service.js';

/**
 * Helper to build an uncompressed, valid ZIP buffer in pure memory for tests.
 */
function createTestZipBuffer(files: { name: string; content: string }[]): Buffer {
  const localHeaders: Buffer[] = [];
  const cdHeaders: Buffer[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const contentBuf = Buffer.from(file.content, 'utf8');

    // Local Header
    const local = Buffer.alloc(30 + nameBuf.length + contentBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // bit flag
    local.writeUInt16LE(0, 8); // compression method (0 = stored)
    local.writeUInt32LE(0, 10); // mod time / date
    local.writeUInt32LE(0, 14); // crc-32 (0 for test)
    local.writeUInt32LE(contentBuf.length, 18); // compressed size
    local.writeUInt32LE(contentBuf.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26); // file name length
    local.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(local, 30);
    contentBuf.copy(local, 30 + nameBuf.length);

    localHeaders.push(local);

    // Central Directory Header
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // bit flag
    cd.writeUInt16LE(0, 10); // compression method
    cd.writeUInt32LE(0, 12); // mod time / date
    cd.writeUInt32LE(0, 16); // crc-32
    cd.writeUInt32LE(contentBuf.length, 20); // compressed size
    cd.writeUInt32LE(contentBuf.length, 24); // uncompressed size
    cd.writeUInt16LE(nameBuf.length, 28); // file name length
    cd.writeUInt16LE(0, 30); // extra field length
    cd.writeUInt16LE(0, 32); // comment length
    cd.writeUInt16LE(0, 34); // disk number start
    cd.writeUInt16LE(0, 36); // internal file attributes
    cd.writeUInt32LE(0, 38); // external file attributes
    cd.writeUInt32LE(currentOffset, 42); // relative offset of local header
    nameBuf.copy(cd, 46);

    cdHeaders.push(cd);
    currentOffset += local.length;
  }

  const allLocals = Buffer.concat(localHeaders);
  const allCds = Buffer.concat(cdHeaders);

  // End of Central Directory Record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with CD
  eocd.writeUInt16LE(files.length, 8); // entries on disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(allCds.length, 12); // size of CD
  eocd.writeUInt32LE(allLocals.length, 16); // offset of CD
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([allLocals, allCds, eocd]);
}

describe('Archive Inspection Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-archives-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('isDangerousEntry should correctly identify executables and scripts', () => {
    expect(isDangerousEntry('setup.exe').dangerous).toBe(true);
    expect(isDangerousEntry('script.bat').dangerous).toBe(true);
    expect(isDangerousEntry('run.ps1').dangerous).toBe(true);
    expect(isDangerousEntry('payload.vbs').dangerous).toBe(true);
    expect(isDangerousEntry('readme.txt').dangerous).toBe(false);
    expect(isDangerousEntry('photo.jpg').dangerous).toBe(false);
  });

  it('should inspect safe.zip and confirm no executable content', async () => {
    const zipPath = path.join(tempDir, 'safe.zip');
    const zipBuf = createTestZipBuffer([
      { name: 'readme.txt', content: 'Safe text content' },
      { name: 'photo.jpg', content: 'fake jpeg data' },
    ]);
    await fs.writeFile(zipPath, zipBuf);

    const result = await analyzeArchiveFile(zipPath);
    expect(result.isArchive).toBe(true);
    expect(result.archiveType).toBe('ZIP');
    expect(result.hasExecutableContent).toBe(false);
    expect(result.entryCount).toBe(2);
    expect(result.entries.every(e => !e.isSuspicious)).toBe(true);
  });

  it('should inspect archive-with-exe.zip and detect setup.exe', async () => {
    const zipPath = path.join(tempDir, 'archive-with-exe.zip');
    const zipBuf = createTestZipBuffer([
      { name: 'readme.txt', content: 'Safe text' },
      { name: 'setup.exe', content: 'binary payload' },
      { name: 'document.pdf', content: 'pdf data' },
    ]);
    await fs.writeFile(zipPath, zipBuf);

    const result = await analyzeArchiveFile(zipPath);
    expect(result.isArchive).toBe(true);
    expect(result.hasExecutableContent).toBe(true);
    expect(result.entries.some(e => e.path === 'setup.exe' && e.isSuspicious)).toBe(true);
    expect(result.indicators.some(i => i.includes('setup.exe'))).toBe(true);
  });

  it('should detect path traversal attempts inside archive entries', async () => {
    const zipPath = path.join(tempDir, 'traversal.zip');
    const zipBuf = createTestZipBuffer([{ name: '../../etc/passwd', content: 'traversal test' }]);
    await fs.writeFile(zipPath, zipBuf);

    const result = await analyzeArchiveFile(zipPath);
    expect(result.indicators.some(i => i.toLowerCase().includes('path traversal'))).toBe(true);
  });

  it('should recognize Unix Compress (.Z) header signature', async () => {
    const zPath = path.join(tempDir, 'file.z');
    const zBuf = Buffer.from([0x1f, 0x9d, 0x90, 0x00]);
    await fs.writeFile(zPath, zBuf);

    const result = await analyzeArchiveFile(zPath);
    expect(result.isArchive).toBe(true);
    expect(result.archiveType).toBe('COMPRESS_Z');
  });

  it('should recognize 7-Zip header signature', async () => {
    const sevenZipPath = path.join(tempDir, 'test.7z');
    const sevenZipBuf = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00, 0x04]);
    await fs.writeFile(sevenZipPath, sevenZipBuf);

    const result = await analyzeArchiveFile(sevenZipPath);
    expect(result.isArchive).toBe(true);
    expect(result.archiveType).toBe('7Z');
  });

  it('should recognize RAR header signature', async () => {
    const rarPath = path.join(tempDir, 'test.rar');
    const rarBuf = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]);
    await fs.writeFile(rarPath, rarBuf);

    const result = await analyzeArchiveFile(rarPath);
    expect(result.isArchive).toBe(true);
    expect(result.archiveType).toBe('RAR');
  });
});
