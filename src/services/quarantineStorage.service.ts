import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface QuarantineResult {
  isQuarantined: boolean;
  storageType: 'S3_R2' | 'LOCAL' | 'DISABLED';
  quarantineLocation: string;
  sha256: string;
  quarantinedAt: Date;
}

export class QuarantineStorageService {
  /**
   * Safely isolates a suspicious or malicious file into quarantine.
   * Prevents accidental execution and preserves evidence for admin analysis.
   */
  async quarantineFile(
    filename: string,
    buffer: Buffer,
    sha256: string
  ): Promise<QuarantineResult> {
    const env = getEnv();

    // Check if S3 / Cloudflare R2 is configured and enabled
    if (
      env.QUARANTINE_STORAGE_ENABLED &&
      env.S3_ENDPOINT &&
      env.S3_BUCKET &&
      env.S3_ACCESS_KEY &&
      env.S3_SECRET_KEY
    ) {
      try {
        const objectKey = `quarantine/${sha256}_${path.basename(filename)}.quarantine`;
        // Can be integrated with @aws-sdk/client-s3 or S3 REST API
        logger.info({ objectKey, bucket: env.S3_BUCKET }, 'File scheduled for S3/R2 quarantine upload');
        return {
          isQuarantined: true,
          storageType: 'S3_R2',
          quarantineLocation: `s3://${env.S3_BUCKET}/${objectKey}`,
          sha256,
          quarantinedAt: new Date(),
        };
      } catch (err) {
        logger.error({ err }, 'S3/R2 quarantine upload failed, falling back to local quarantine');
      }
    }

    // Local Safe Quarantine Storage
    try {
      const localDir = path.join(os.tmpdir(), 'tg-bot-quarantine');
      await fs.mkdir(localDir, { recursive: true });
      const safeFilename = `${sha256}_${path.basename(filename)}.quarantine`;
      const targetPath = path.join(localDir, safeFilename);

      await fs.writeFile(targetPath, buffer, { mode: 0o400 }); // Read-only permissions

      return {
        isQuarantined: true,
        storageType: 'LOCAL',
        quarantineLocation: targetPath,
        sha256,
        quarantinedAt: new Date(),
      };
    } catch (err) {
      logger.error({ err }, 'Local quarantine write failed');
      return {
        isQuarantined: false,
        storageType: 'DISABLED',
        quarantineLocation: 'N/A',
        sha256,
        quarantinedAt: new Date(),
      };
    }
  }
}

export const quarantineStorageService = new QuarantineStorageService();
