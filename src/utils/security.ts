import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { logger } from './logger.js';

const BASE_TEMP_DIR = path.join(os.tmpdir(), 'tg-bot-security-scans');

/**
 * Creates an isolated temporary directory for scanning a specific file.
 */
export async function createIsolatedTempDir(): Promise<string> {
  const dirName = `scan_${Date.now()}_${crypto.randomUUID()}`;
  const targetDir = path.join(BASE_TEMP_DIR, dirName);
  await fs.mkdir(targetDir, { recursive: true });
  return targetDir;
}

/**
 * Safely removes an isolated temporary directory and all its contents.
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  if (!dirPath) return;
  try {
    // Ensure we are only deleting within BASE_TEMP_DIR to prevent dangerous deletions
    const normalized = path.resolve(dirPath);
    if (!normalized.startsWith(path.resolve(BASE_TEMP_DIR))) {
      logger.warn({ dirPath }, 'Attempted to cleanup directory outside BASE_TEMP_DIR');
      return;
    }
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    logger.warn({ err, dirPath }, 'Failed to cleanup temporary directory');
  }
}

/**
 * Ensures that a target path is strictly contained within a parent directory,
 * preventing directory traversal attacks.
 */
export function isPathContained(parentDir: string, targetPath: string): boolean {
  const rel = path.relative(path.resolve(parentDir), path.resolve(targetPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Wraps a promise in a timeout to prevent scanning hangs or DoS.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutSeconds: number,
  operationName = 'Operation'
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutSeconds} seconds`));
    }, timeoutSeconds * 1000);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    // @ts-expect-error timer is assigned synchronously
    if (timer) clearTimeout(timer);
  }
}
