import crypto from 'node:crypto';
import path from 'node:path';

/**
 * Sanitizes a filename to prevent path traversal, control character injection,
 * and dangerous directory characters.
 */
export function sanitizeFilename(rawFilename: string): string {
  if (!rawFilename || typeof rawFilename !== 'string') {
    return 'unnamed_file';
  }

  // Remove null bytes and control characters
  let clean = rawFilename.replace(/[\x00-\x1f\x7f-\x9f]/g, '');

  // Strip path traversal attempts and directory separators
  clean = clean.replace(/[/\\?%*:|"<>]/g, '_');
  clean = clean.replace(/\.{2,}/g, '.'); // Replace multiple dots that might be traversal

  // Trim whitespace and leading/trailing dots/underscores
  clean = clean.trim();
  clean = clean.replace(/^_+|_+$/g, '');

  if (clean.length === 0) {
    clean = 'unnamed_file';
  }

  // Enforce reasonable maximum filename length
  if (clean.length > 255) {
    const ext = path.extname(clean);
    clean = clean.substring(0, 255 - ext.length) + ext;
  }

  return clean;
}

/**
 * Generates an isolated, safe temporary filename using a random UUID
 * to avoid any filesystem path collisions or malicious names.
 */
export function generateSafeTempFilename(originalExtension: string): string {
  const uuid = crypto.randomUUID();
  const safeExt = originalExtension.startsWith('.') ? originalExtension : `.${originalExtension}`;
  const sanitizedExt = safeExt.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
  return `${uuid}${sanitizedExt}`;
}

/**
 * Detects whether a filename contains suspicious path traversal attempts.
 */
export function hasPathTraversal(filename: string): boolean {
  if (!filename) return false;
  return (
    filename.includes('../') ||
    filename.includes('..\\') ||
    filename.startsWith('/') ||
    filename.startsWith('\\') ||
    /^[a-zA-Z]:[/\\]/.test(filename)
  );
}
