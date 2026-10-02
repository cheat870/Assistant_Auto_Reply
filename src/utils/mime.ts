import { MAGIC_BYTES } from '../config/constants.js';

export interface FileSignatureInfo {
  detectedType: string;
  isExecutable: boolean;
  isArchive: boolean;
  magicHex: string;
}

/**
 * Checks if a buffer matches a specific magic byte sequence at a given offset.
 */
function matchesBytes(buffer: Buffer, sequence: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + sequence.length) return false;
  for (let i = 0; i < sequence.length; i++) {
    if (buffer[offset + i] !== sequence[i]) return false;
  }
  return true;
}

/**
 * Identifies the file type and signature by analyzing magic bytes.
 */
export function identifyFileSignature(headerBuffer: Buffer): FileSignatureInfo {
  const magicHex = headerBuffer.subarray(0, 8).toString('hex').toUpperCase();

  if (matchesBytes(headerBuffer, MAGIC_BYTES.PE)) {
    return {
      detectedType: 'Windows PE Executable (MZ)',
      isExecutable: true,
      isArchive: false,
      magicHex,
    };
  }

  if (matchesBytes(headerBuffer, MAGIC_BYTES.ELF)) {
    return {
      detectedType: 'Linux ELF Executable',
      isExecutable: true,
      isArchive: false,
      magicHex,
    };
  }

  if (
    matchesBytes(headerBuffer, MAGIC_BYTES.ZIP) ||
    matchesBytes(headerBuffer, MAGIC_BYTES.ZIP_EMPTY) ||
    matchesBytes(headerBuffer, MAGIC_BYTES.ZIP_SPANNED)
  ) {
    return {
      detectedType: 'ZIP Archive (PK)',
      isExecutable: false,
      isArchive: true,
      magicHex,
    };
  }

  if (
    matchesBytes(headerBuffer, MAGIC_BYTES.RAR_5) ||
    matchesBytes(headerBuffer, MAGIC_BYTES.RAR_4)
  ) {
    return {
      detectedType: 'RAR Archive',
      isExecutable: false,
      isArchive: true,
      magicHex,
    };
  }

  if (matchesBytes(headerBuffer, MAGIC_BYTES.SEVEN_ZIP)) {
    return {
      detectedType: '7-Zip Archive',
      isExecutable: false,
      isArchive: true,
      magicHex,
    };
  }

  if (matchesBytes(headerBuffer, MAGIC_BYTES.GZIP)) {
    return {
      detectedType: 'GZIP Compressed Archive',
      isExecutable: false,
      isArchive: true,
      magicHex,
    };
  }

  if (matchesBytes(headerBuffer, MAGIC_BYTES.UNIX_COMPRESS_Z)) {
    return {
      detectedType: 'Unix Compress (.Z) Archive',
      isExecutable: false,
      isArchive: true,
      magicHex,
    };
  }

  if (matchesBytes(headerBuffer, MAGIC_BYTES.PDF)) {
    return {
      detectedType: 'PDF Document',
      isExecutable: false,
      isArchive: false,
      magicHex,
    };
  }

  if (matchesBytes(headerBuffer, MAGIC_BYTES.PNG)) {
    return {
      detectedType: 'PNG Image',
      isExecutable: false,
      isArchive: false,
      magicHex,
    };
  }

  if (matchesBytes(headerBuffer, MAGIC_BYTES.JPEG)) {
    return {
      detectedType: 'JPEG Image',
      isExecutable: false,
      isArchive: false,
      magicHex,
    };
  }

  // Check if content appears to be ASCII or UTF-8 text (scripts)
  let isText = true;
  const sampleLength = Math.min(headerBuffer.length, 256);
  for (let i = 0; i < sampleLength; i++) {
    const byte = headerBuffer[i]!;
    // Allow standard printable ASCII, tab, newline, carriage return
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20 && byte !== 0x1b) || byte === 0x00) {
      isText = false;
      break;
    }
  }

  if (isText && sampleLength > 0) {
    return {
      detectedType: 'Plain Text / Script',
      isExecutable: false,
      isArchive: false,
      magicHex,
    };
  }

  return {
    detectedType: 'Unknown Binary',
    isExecutable: false,
    isArchive: false,
    magicHex,
  };
}

/**
 * Checks for discrepancy between reported extension, Telegram MIME, and binary magic bytes.
 */
export function checkMimeDiscrepancy(
  extension: string,
  telegramMime: string | undefined,
  signature: FileSignatureInfo
): string[] {
  const indicators: string[] = [];

  const lowerExt = extension.toLowerCase();

  // If extension claims document or image, but magic bytes indicate PE executable
  if (['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx', '.mp3', '.mp4'].includes(lowerExt)) {
    if (signature.isExecutable) {
      indicators.push(
        `Severe Mismatch: File has extension "${lowerExt}" but binary header is ${signature.detectedType}`
      );
    }
  }

  // If Telegram claims image/pdf, but file is executable
  if (telegramMime && (telegramMime.startsWith('image/') || telegramMime === 'application/pdf')) {
    if (signature.isExecutable) {
      indicators.push(
        `MIME Mismatch: Telegram reported MIME "${telegramMime}" but file is ${signature.detectedType}`
      );
    }
  }

  return indicators;
}
