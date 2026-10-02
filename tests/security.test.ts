import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getEnv } from '../src/config/env.js';
import { RateLimitService } from '../src/services/rateLimit.service.js';
import {
  generateSafeTempFilename,
  hasPathTraversal,
  sanitizeFilename,
} from '../src/utils/filename.js';
import {
  cleanupTempDir,
  createIsolatedTempDir,
  isPathContained,
  withTimeout,
} from '../src/utils/security.js';

describe('Security & Moderation Policy Tests', () => {
  it('default configuration MUST enforce NO AUTOMATIC ACTIONS', () => {
    const env = getEnv();
    expect(env.AUTO_DELETE).toBe(false);
    expect(env.AUTO_BAN).toBe(false);
    expect(env.AUTO_KICK).toBe(false);
    expect(env.AUTO_MUTE).toBe(false);
    expect(env.AUTO_RESTRICT).toBe(false);
    expect(env.ADMIN_APPROVAL_REQUIRED).toBe(true);
  });

  describe('Path Traversal & Filename Sanitization', () => {
    it('should detect path traversal attempts', () => {
      expect(hasPathTraversal('../secret.txt')).toBe(true);
      expect(hasPathTraversal('..\\secret.txt')).toBe(true);
      expect(hasPathTraversal('/etc/shadow')).toBe(true);
      expect(hasPathTraversal('C:\\Windows\\System32')).toBe(true);
      expect(hasPathTraversal('normal_document.pdf')).toBe(false);
    });

    it('should sanitize dangerous characters and directory separators from filenames', () => {
      expect(sanitizeFilename('../../../evil.exe')).not.toContain('..');
      expect(sanitizeFilename('../../evil.exe')).not.toContain('/');
      expect(sanitizeFilename('evil\x00file.exe')).not.toContain('\x00');
      expect(sanitizeFilename('test:file*name?.exe')).not.toMatch(/[:*?]/);
    });

    it('should generate isolated safe temporary filenames with random UUIDs', () => {
      const name1 = generateSafeTempFilename('.exe');
      const name2 = generateSafeTempFilename('.exe');
      expect(name1).not.toBe(name2);
      expect(name1).toMatch(/^[0-9a-f-]{36}\.exe$/);
    });

    it('isPathContained should prevent escaping directory boundaries', () => {
      const baseDir = path.resolve('C:\\safe\\temp');
      const inside = path.resolve('C:\\safe\\temp\\scan1\\file.exe');
      const outside = path.resolve('C:\\safe\\other\\file.exe');
      expect(isPathContained(baseDir, inside)).toBe(true);
      expect(isPathContained(baseDir, outside)).toBe(false);
    });
  });

  describe('Isolated Temp Directory & Safe Cleanup', () => {
    it('should create and clean up isolated temporary directories', async () => {
      const tempDir = await createIsolatedTempDir();
      const stats = await fs.stat(tempDir);
      expect(stats.isDirectory()).toBe(true);

      const testFile = path.join(tempDir, 'dummy.txt');
      await fs.writeFile(testFile, 'temporary test data');

      await cleanupTempDir(tempDir);

      await expect(fs.stat(tempDir)).rejects.toThrow();
    });
  });

  describe('Timeout Wrapper', () => {
    it('should throw an error when an operation exceeds allowed timeout', async () => {
      const slowPromise = new Promise(resolve => setTimeout(resolve, 500));
      await expect(withTimeout(slowPromise, 0.1, 'Test operation')).rejects.toThrow(
        /timed out after 0.1 seconds/
      );
    });

    it('should succeed when operation finishes within timeout', async () => {
      const fastPromise = Promise.resolve('ok');
      const result = await withTimeout(fastPromise, 2, 'Test fast operation');
      expect(result).toBe('ok');
    });
  });

  describe('Rate Limiting Service', () => {
    it('should rate limit requests when limit is exceeded within window', async () => {
      const rateLimiter = new RateLimitService();
      const testUserId = `user_${Date.now()}`;
      const limit = 3;
      const windowSec = 2;

      // 3 calls should pass
      expect(await rateLimiter.isRateLimited('user', testUserId, limit, windowSec)).toBe(false);
      expect(await rateLimiter.isRateLimited('user', testUserId, limit, windowSec)).toBe(false);
      expect(await rateLimiter.isRateLimited('user', testUserId, limit, windowSec)).toBe(false);

      // 4th call should be rate limited
      expect(await rateLimiter.isRateLimited('user', testUserId, limit, windowSec)).toBe(true);

      await rateLimiter.close();
    });
  });
});
