import fs from 'node:fs/promises';
import type { PEAnalysisResult, PESection } from '../types/index.js';

/**
 * Calculates the Shannon entropy of a buffer, returning a value between 0.0 and 8.0.
 * High entropy (> 7.2) typically indicates encrypted, packed, or compressed data.
 */
export function calculateShannonEntropy(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  const frequencies = new Array<number>(256).fill(0);
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte !== undefined) {
      frequencies[byte] = (frequencies[byte] ?? 0) + 1;
    }
  }

  let entropy = 0;
  const len = buffer.length;
  for (let i = 0; i < 256; i++) {
    const count = frequencies[i] ?? 0;
    if (count > 0) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
  }

  return Math.round(entropy * 100) / 100;
}

/**
 * Performs safe, purely static analysis on a Portable Executable (PE) file.
 * NEVER executes code. Safely parses headers from disk.
 */
export async function analyzePEFile(filePath: string): Promise<PEAnalysisResult> {
  const fileBuffer = await fs.readFile(filePath);

  if (fileBuffer.length < 64) {
    return {
      isPE: false,
      digitalSignaturePresent: false,
      indicators: ['File is too small to be a valid PE file'],
    };
  }

  // Check DOS Header: 'MZ' = 0x4D, 0x5A
  if (fileBuffer[0] !== 0x4d || fileBuffer[1] !== 0x5a) {
    return {
      isPE: false,
      digitalSignaturePresent: false,
      indicators: ['Missing MZ DOS signature'],
    };
  }

  // Offset to PE Header (e_lfanew is at offset 0x3C, 4 bytes Little Endian)
  const peHeaderOffset = fileBuffer.readUInt32LE(0x3c);
  if (peHeaderOffset + 4 >= fileBuffer.length) {
    return {
      isPE: false,
      digitalSignaturePresent: false,
      indicators: ['Invalid e_lfanew pointer in DOS header'],
    };
  }

  // Verify PE Signature: 'PE\0\0' = 0x50, 0x45, 0x00, 0x00
  if (
    fileBuffer[peHeaderOffset] !== 0x50 ||
    fileBuffer[peHeaderOffset + 1] !== 0x45 ||
    fileBuffer[peHeaderOffset + 2] !== 0x00 ||
    fileBuffer[peHeaderOffset + 3] !== 0x00
  ) {
    return {
      isPE: false,
      digitalSignaturePresent: false,
      indicators: ['Missing PE NT signature'],
    };
  }

  const indicators: string[] = ['PE executable detected'];

  // COFF File Header starts at peHeaderOffset + 4
  const coffOffset = peHeaderOffset + 4;
  const machine = fileBuffer.readUInt16LE(coffOffset);
  const numberOfSections = fileBuffer.readUInt16LE(coffOffset + 2);
  const sizeOfOptionalHeader = fileBuffer.readUInt16LE(coffOffset + 16);
  const characteristics = fileBuffer.readUInt16LE(coffOffset + 18);

  let architecture: 'x86' | 'x64' | 'ARM' | 'ARM64' | 'Unknown' = 'Unknown';
  switch (machine) {
    case 0x014c:
      architecture = 'x86';
      break;
    case 0x8664:
      architecture = 'x64';
      break;
    case 0x01c0:
      architecture = 'ARM';
      break;
    case 0xaa64:
      architecture = 'ARM64';
      break;
    default:
      architecture = 'Unknown';
  }

  const isDLL = (characteristics & 0x2000) !== 0;
  if (isDLL) {
    indicators.push('Dynamic Link Library (DLL) characteristics');
  }

  // Optional Header starts at coffOffset + 20
  const optOffset = coffOffset + 20;
  let peType: 'PE32' | 'PE32+' | 'Unknown' = 'Unknown';
  let digitalSignaturePresent = false;
  let digitalSignatureDetails = 'Not detected';
  let subsystem: 'Windows GUI' | 'Windows CUI (Console)' | 'Native' | 'Unknown' = 'Unknown';
  let entryPointRVA: string | undefined;
  let imageBase: string | undefined;

  if (sizeOfOptionalHeader >= 2) {
    const magic = fileBuffer.readUInt16LE(optOffset);
    if (magic === 0x10b) {
      peType = 'PE32';
    } else if (magic === 0x20b) {
      peType = 'PE32+';
    }

    if (peType !== 'Unknown' && fileBuffer.length >= optOffset + 68) {
      entryPointRVA = `0x${fileBuffer.readUInt32LE(optOffset + 16).toString(16)}`;

      if (peType === 'PE32') {
        imageBase = `0x${fileBuffer.readUInt32LE(optOffset + 28).toString(16)}`;
      } else {
        const high = fileBuffer.readUInt32LE(optOffset + 28 + 4);
        const low = fileBuffer.readUInt32LE(optOffset + 28);
        imageBase = `0x${((BigInt(high) << 32n) | BigInt(low)).toString(16)}`;
      }

      const subsystemVal = fileBuffer.readUInt16LE(optOffset + 68);
      if (subsystemVal === 2) subsystem = 'Windows GUI';
      else if (subsystemVal === 3) subsystem = 'Windows CUI (Console)';
      else if (subsystemVal === 1) subsystem = 'Native';

      // Security Directory (Index 4 in Data Directories)
      // PE32 data directories start at optOffset + 96
      // PE32+ data directories start at optOffset + 112
      const dataDirStart = peType === 'PE32' ? optOffset + 96 : optOffset + 112;
      const securityDirOffset = dataDirStart + 4 * 8;

      if (fileBuffer.length >= securityDirOffset + 8) {
        const secDirAddress = fileBuffer.readUInt32LE(securityDirOffset);
        const secDirSize = fileBuffer.readUInt32LE(securityDirOffset + 4);

        if (secDirAddress > 0 && secDirSize > 0) {
          digitalSignaturePresent = true;
          digitalSignatureDetails = `Present (Authenticode certificate table: ${secDirSize} bytes)`;
          indicators.push('Digital signature table present');
        } else {
          indicators.push('No digital signature detected (unsigned executable)');
        }
      }
    }
  }

  // Parse Section Headers
  const sectionsOffset = optOffset + sizeOfOptionalHeader;
  const sections: PESection[] = [];
  const highEntropySections: string[] = [];

  for (let i = 0; i < numberOfSections; i++) {
    const curSectionOffset = sectionsOffset + i * 40;
    if (fileBuffer.length < curSectionOffset + 40) break;

    // Section Name (8 bytes ASCII, null-padded)
    let sectionName = '';
    for (let c = 0; c < 8; c++) {
      const charCode = fileBuffer[curSectionOffset + c]!;
      if (charCode === 0) break;
      sectionName += String.fromCharCode(charCode);
    }

    const virtualSize = fileBuffer.readUInt32LE(curSectionOffset + 8);
    const rawDataOffset = fileBuffer.readUInt32LE(curSectionOffset + 20);
    const rawDataSize = fileBuffer.readUInt32LE(curSectionOffset + 16);
    const secCharacteristics = fileBuffer.readUInt32LE(curSectionOffset + 36);

    const isExecutable = (secCharacteristics & 0x20000000) !== 0;
    const isWritable = (secCharacteristics & 0x80000000) !== 0;

    let entropy = 0;
    if (rawDataOffset > 0 && rawDataSize > 0 && rawDataOffset + rawDataSize <= fileBuffer.length) {
      const sectionBuffer = fileBuffer.subarray(rawDataOffset, rawDataOffset + rawDataSize);
      entropy = calculateShannonEntropy(sectionBuffer);
      if (entropy > 7.2) {
        highEntropySections.push(`${sectionName || 'Unnamed'} (Entropy: ${entropy})`);
      }
    }

    sections.push({
      name: sectionName || `sec_${i}`,
      virtualSize,
      rawSize: rawDataSize,
      entropy,
      isExecutable,
      isWritable,
    });
  }

  if (highEntropySections.length > 0) {
    indicators.push(`High entropy detected in sections: ${highEntropySections.join(', ')}`);
  }

  return {
    isPE: true,
    peType,
    architecture,
    subsystem,
    entryPointRVA,
    imageBase,
    sectionCount: numberOfSections,
    sections,
    digitalSignaturePresent,
    digitalSignatureDetails,
    highEntropySections: highEntropySections.length > 0 ? highEntropySections : undefined,
    indicators,
  };
}
