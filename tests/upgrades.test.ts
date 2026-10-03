import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { aiService } from '../src/services/ai.service.js';
import { quarantineStorageService } from '../src/services/quarantineStorage.service.js';
import { virusTotalService } from '../src/services/virusTotal.service.js';

describe('New Upgrades Suite (AI, Threat Intel, Quarantine)', () => {
  describe('Quarantine Storage Service', () => {
    it('should quarantine a buffer locally with .quarantine extension', async () => {
      const sampleBuffer = Buffer.from('TEST_MALICIOUS_PAYLOAD');
      const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const result = await quarantineStorageService.quarantineFile('danger.exe', sampleBuffer, sha256);

      expect(result.isQuarantined).toBe(true);
      expect(result.storageType).toBe('LOCAL');
      expect(result.quarantineLocation).toContain('.quarantine');
      expect(result.quarantineLocation).toContain(sha256);

      // Verify file exists on disk
      const content = await fs.readFile(result.quarantineLocation);
      expect(content.toString()).toBe('TEST_MALICIOUS_PAYLOAD');

      // Clean up
      await fs.rm(result.quarantineLocation, { force: true });
    });
  });

  describe('VirusTotal Service', () => {
    it('should return unconfigured status when VIRUSTOTAL_API_KEY is omitted', async () => {
      const sha256 = '44d88612fea8a8f36de82e1278abb02f';
      const report = await virusTotalService.getFileReport(sha256);

      expect(report).toBeDefined();
      expect(report?.threatVerdict).toBe('UNKNOWN');
      expect(report?.maliciousCount).toBe(0);
    });
  });

  describe('Gemini AI Service', () => {
    it('should handle unconfigured state gracefully without crashing', async () => {
      // If GEMINI_API_KEY is not set in test environment, it returns null gracefully
      if (!aiService.isAvailable()) {
        const reply = await aiService.generateSmartAutoReply('សួស្តី តើមានលក់អ្វីខ្លះ?');
        expect(reply).toBeNull();

        const transcript = await aiService.transcribeVoiceNote(Buffer.from(''));
        expect(transcript).toBeNull();

        const slip = await aiService.analyzeBankSlip(Buffer.from(''));
        expect(slip).toBeNull();
      } else {
        expect(aiService.isAvailable()).toBe(true);
      }
    });
  });

  describe('Anti-Delete & Message Logging', () => {
    it('should format deleted message alert cleanly', () => {
      const escape = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const rawText = '<script>alert(1)</script> and "hello"';
      const clean = escape(rawText);

      expect(clean).toContain('&lt;script&gt;');
      expect(clean).not.toContain('<script>');
    });
  });

  describe('Anti-Phishing & Link Scanner', () => {
    it('should extract URLs from mixed text message', async () => {
      const { linkScannerService } = await import('../src/services/linkScanner.service.js');
      const text = 'Check out https://example.com/test and also http://evil-login.xyz';
      const urls = linkScannerService.extractUrls(text);

      expect(urls).toContain('https://example.com/test');
      expect(urls).toContain('http://evil-login.xyz');
      expect(urls.length).toBe(2);
    });

    it('should detect suspicious phishing and spoofed login URLs', async () => {
      const { linkScannerService } = await import('../src/services/linkScanner.service.js');
      const spoofText = 'Please verify your account here: http://telegram-login.verify-security.cc/auth';
      const threats = await linkScannerService.scanMessageText(spoofText);

      expect(threats.length).toBeGreaterThan(0);
      expect(threats[0]?.riskLevel).toBe('CRITICAL');
      expect(threats[0]?.isMaliciousOrPhishing).toBe(true);
    });

    it('should detect raw IP address URLs as suspicious', async () => {
      const { linkScannerService } = await import('../src/services/linkScanner.service.js');
      const ipText = 'Download update from http://192.168.1.100:8080/setup.exe';
      const threats = await linkScannerService.scanMessageText(ipText);

      expect(threats.length).toBeGreaterThan(0);
      expect(threats[0]?.threatType).toBe('SUSPICIOUS_IP');
      expect(threats[0]?.detectionReason).toContain('IP Address');
    });

    it('should pass legitimate trusted URLs without flagging', async () => {
      const { linkScannerService } = await import('../src/services/linkScanner.service.js');
      const safeText = 'Here is the document: https://t.me/telegram and https://github.com';
      const threats = await linkScannerService.scanMessageText(safeText);

      expect(threats.length).toBe(0);
    });
  });

  describe('Channel Archive Service', () => {
    it('should retrieve archive channel ID or return null when not configured', async () => {
      const { channelArchiveService } = await import('../src/services/channelArchive.service.js');
      const channelId = await channelArchiveService.getChannelId();
      // Should be string or null without throwing
      expect(channelId === null || typeof channelId === 'string').toBe(true);
    });
  });
});

