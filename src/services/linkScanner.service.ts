import { logger } from '../utils/logger.js';
import { virusTotalService } from './virusTotal.service.js';

export interface UrlScanResult {
  url: string;
  isMaliciousOrPhishing: boolean;
  threatType?: 'TELEGRAM_PHISHING' | 'SCAM_AIRDROP' | 'VIRUSTOTAL_MALICIOUS' | 'SUSPICIOUS_IP' | 'PUNYCODE';
  riskLevel: 'CRITICAL' | 'HIGH' | 'LOW' | 'UNKNOWN';
  detectionReason?: string;
  vtMaliciousCount?: number;
  vtTotalEngines?: number;
  vtPermalink?: string;
}

export class LinkScannerService {
  private urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;

  /**
   * Extracts all HTTP/HTTPS URLs found in a text string.
   */
  extractUrls(text: string): string[] {
    if (!text || typeof text !== 'string') return [];
    const matches = text.match(this.urlRegex);
    if (!matches) return [];
    // Deduplicate and trim trailing punctuation (. , ! ?)
    const cleaned = matches.map(u => u.replace(/[.,!?]+$/, ''));
    return Array.from(new Set(cleaned));
  }

  /**
   * Scans a single URL for phishing, scams, and malicious reputation.
   */
  async scanUrl(targetUrl: string): Promise<UrlScanResult> {
    try {
      const parsed = new URL(targetUrl);
      const hostname = parsed.hostname.toLowerCase();

      // 1. Heuristic Phishing Check: Telegram Account Takeover Phishing
      const legitimateTelegramHosts = [
        't.me',
        'telegram.org',
        'telegram.me',
        'web.telegram.org',
        'desktop.telegram.org',
      ];

      const isSpoofingTelegram =
        !legitimateTelegramHosts.includes(hostname) &&
        (hostname.includes('telegra') ||
          hostname.includes('t.me') ||
          hostname.includes('tg-') ||
          hostname.includes('-tg') ||
          hostname.includes('telegram-'));

      if (isSpoofingTelegram) {
        return {
          url: targetUrl,
          isMaliciousOrPhishing: true,
          threatType: 'TELEGRAM_PHISHING',
          riskLevel: 'CRITICAL',
          detectionReason: `តំណភ្ជាប់ក្លែងបន្លំឈ្មោះ Telegram (${hostname}) ដើម្បីលួចយកគណនី (Telegram Account Phishing)!`,
        };
      }

      // 2. Heuristic Scam & Fake Airdrop Check
      const scamKeywords = [
        'airdrop',
        'free-stars',
        'telegram-gift',
        'claim-reward',
        'ton-airdrop',
        'connect-wallet',
        'login-verify',
      ];

      const isScamMatch = scamKeywords.some(kw => hostname.includes(kw) || parsed.pathname.includes(kw));
      if (isScamMatch && !legitimateTelegramHosts.includes(hostname)) {
        return {
          url: targetUrl,
          isMaliciousOrPhishing: true,
          threatType: 'SCAM_AIRDROP',
          riskLevel: 'HIGH',
          detectionReason: `តំណភ្ជាប់សង្ស័យជាការបោកបញ្ឆោត (Scam / Fake Gift / Airdrop Phishing)!`,
        };
      }

      // 3. Raw IP Address URL Detection
      const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
      if (ipRegex.test(hostname)) {
        return {
          url: targetUrl,
          isMaliciousOrPhishing: true,
          threatType: 'SUSPICIOUS_IP',
          riskLevel: 'HIGH',
          detectionReason: `តំណភ្ជាប់ប្រើប្រាស់ IP Address ដោយផ្ទាល់ (${hostname}) ដោយគ្មាន Domain Name ត្រឹមត្រូវ។`,
        };
      }

      // 4. VirusTotal Threat Intelligence Lookup
      const vtReport = await virusTotalService.getUrlReport(targetUrl);
      if (vtReport && vtReport.isFound && vtReport.maliciousCount > 0) {
        return {
          url: targetUrl,
          isMaliciousOrPhishing: true,
          threatType: 'VIRUSTOTAL_MALICIOUS',
          riskLevel: vtReport.maliciousCount >= 2 ? 'CRITICAL' : 'HIGH',
          detectionReason: `រកឃើញដោយម៉ាស៊ីនប្រឆាំងមេរោគ VirusTotal ចំនួន ${vtReport.maliciousCount}/${vtReport.totalEngines} ថាជាវេបសាយគ្រោះថ្នាក់/Phishing!`,
          vtMaliciousCount: vtReport.maliciousCount,
          vtTotalEngines: vtReport.totalEngines,
          vtPermalink: vtReport.permalink,
        };
      }

      return {
        url: targetUrl,
        isMaliciousOrPhishing: false,
        riskLevel: 'LOW',
        vtMaliciousCount: vtReport?.maliciousCount,
        vtTotalEngines: vtReport?.totalEngines,
        vtPermalink: vtReport?.permalink,
      };
    } catch (err) {
      logger.warn({ err, targetUrl }, 'Failed to parse or scan URL');
      return {
        url: targetUrl,
        isMaliciousOrPhishing: false,
        riskLevel: 'UNKNOWN',
      };
    }
  }

  /**
   * Scans a text message for any phishing or malicious URLs.
   * Returns array of detected malicious results.
   */
  async scanMessageText(text: string): Promise<UrlScanResult[]> {
    const urls = this.extractUrls(text);
    if (urls.length === 0) return [];

    const results: UrlScanResult[] = [];
    for (const u of urls.slice(0, 5)) {
      const scan = await this.scanUrl(u);
      if (scan.isMaliciousOrPhishing) {
        results.push(scan);
      }
    }
    return results;
  }
}

export const linkScannerService = new LinkScannerService();
