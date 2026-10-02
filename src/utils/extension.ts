import path from 'node:path';
import {
  DOCUMENT_MEDIA_EXTENSIONS,
  EXECUTABLE_EXTENSIONS,
  SCRIPT_EXTENSIONS,
} from '../config/constants.js';
import type { ExtensionAnalysisResult } from '../types/index.js';
import { sanitizeFilename } from './filename.js';

/**
 * Normalizes an extension to lowercase with leading dot.
 * Example: "EXE" -> ".exe", ".Bat" -> ".bat"
 */
export function normalizeExtension(ext: string): string {
  if (!ext) return '';
  const trimmed = ext.trim().toLowerCase();
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

/**
 * Parses all extensions from a filename.
 * Example: "invoice.pdf.exe" -> [".pdf", ".exe"]
 */
export function extractAllExtensions(filename: string): string[] {
  const clean = sanitizeFilename(filename);
  const parts = clean.split('.');
  if (parts.length <= 1) return [];

  // Exclude the first part (base filename)
  return parts.slice(1).map(p => `.${p.toLowerCase()}`);
}

/**
 * Comprehensive analysis of filename extensions, specifically detecting
 * double extension deception techniques (e.g., "invoice.pdf.exe").
 */
export function analyzeFilenameExtension(rawFilename: string): ExtensionAnalysisResult {
  const normalizedFilename = sanitizeFilename(rawFilename);
  const allExtensions = extractAllExtensions(normalizedFilename);

  const primaryExtension = normalizeExtension(path.extname(normalizedFilename));

  if (allExtensions.length < 2) {
    return {
      primaryExtension,
      allExtensions,
      isDoubleExtension: false,
      normalizedFilename,
    };
  }

  const lastExt = allExtensions[allExtensions.length - 1] ?? '';
  const secondLastExt = allExtensions[allExtensions.length - 2] ?? '';

  const isLastDangerous = EXECUTABLE_EXTENSIONS.has(lastExt) || SCRIPT_EXTENSIONS.has(lastExt);
  const isSecondLastDisguise =
    DOCUMENT_MEDIA_EXTENSIONS.has(secondLastExt) ||
    ['.zip', '.rar', '.pdf', '.docx', '.xlsx', '.jpg', '.png'].includes(secondLastExt);

  // Legitimate multi-part extensions like .tar.gz should not trigger false alarm
  const isLegitimateCompound = lastExt === '.gz' && secondLastExt === '.tar';

  const isDoubleExtension = isLastDangerous && isSecondLastDisguise && !isLegitimateCompound;

  let dangerReason: string | undefined;
  if (isDoubleExtension) {
    dangerReason = `The filename disguises an executable or script extension (${lastExt}) with an apparent document or media extension (${secondLastExt}).`;
  }

  return {
    primaryExtension,
    secondaryExtension: secondLastExt,
    allExtensions,
    isDoubleExtension,
    dangerReason,
    normalizedFilename,
  };
}
