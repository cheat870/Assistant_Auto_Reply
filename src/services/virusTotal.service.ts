import { getEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface VirusTotalReport {
  isConfigured: boolean;
  isFound: boolean;
  sha256: string;
  maliciousCount: number;
  suspiciousCount: number;
  harmlessCount: number;
  undetectedCount: number;
  totalEngines: number;
  threatVerdict: 'CLEAN' | 'SUSPICIOUS' | 'MALICIOUS' | 'UNKNOWN';
  permalink?: string;
  topDetections: string[];
}

export class VirusTotalService {
  isConfigured(): boolean {
    return Boolean(getEnv().VIRUSTOTAL_API_KEY);
  }

  /**
   * Queries VirusTotal v3 REST API using SHA-256 hash.
   * Completely safe - zero binary execution, purely threat intelligence querying.
   */
  async getFileReport(sha256: string): Promise<VirusTotalReport | null> {
    const env = getEnv();
    if (!env.VIRUSTOTAL_API_KEY) {
      return {
        isConfigured: false,
        isFound: false,
        sha256,
        maliciousCount: 0,
        suspiciousCount: 0,
        harmlessCount: 0,
        undetectedCount: 0,
        totalEngines: 0,
        threatVerdict: 'UNKNOWN',
        topDetections: [],
      };
    }

    try {
      const url = `https://www.virustotal.com/api/v3/files/${sha256}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-apikey': env.VIRUSTOTAL_API_KEY,
          Accept: 'application/json',
        },
      });

      if (response.status === 404) {
        return {
          isConfigured: true,
          isFound: false,
          sha256,
          maliciousCount: 0,
          suspiciousCount: 0,
          harmlessCount: 0,
          undetectedCount: 0,
          totalEngines: 0,
          threatVerdict: 'UNKNOWN',
          topDetections: [],
        };
      }

      if (!response.ok) {
        logger.warn({ status: response.status }, 'VirusTotal API response error');
        return null;
      }

      const json = (await response.json()) as Record<string, any>;
      const data = json.data;
      const attributes = data?.attributes;
      const stats = attributes?.last_analysis_stats || {};
      const results = attributes?.last_analysis_results || {};

      const maliciousCount = stats.malicious || 0;
      const suspiciousCount = stats.suspicious || 0;
      const harmlessCount = stats.harmless || 0;
      const undetectedCount = stats.undetected || 0;
      const totalEngines = maliciousCount + suspiciousCount + harmlessCount + undetectedCount;

      const topDetections: string[] = [];
      for (const [engine, res] of Object.entries<any>(results)) {
        if (res.category === 'malicious' && topDetections.length < 5) {
          topDetections.push(`${engine}: ${res.result || 'Malicious'}`);
        }
      }

      let threatVerdict: 'CLEAN' | 'SUSPICIOUS' | 'MALICIOUS' | 'UNKNOWN' = 'CLEAN';
      if (maliciousCount >= 3) {
        threatVerdict = 'MALICIOUS';
      } else if (maliciousCount > 0 || suspiciousCount > 0) {
        threatVerdict = 'SUSPICIOUS';
      }

      return {
        isConfigured: true,
        isFound: true,
        sha256,
        maliciousCount,
        suspiciousCount,
        harmlessCount,
        undetectedCount,
        totalEngines,
        threatVerdict,
        permalink: `https://www.virustotal.com/gui/file/${sha256}`,
        topDetections,
      };
    } catch (err) {
      logger.error({ err, sha256 }, 'VirusTotal API query failed');
      return null;
    }
  }
}

export const virusTotalService = new VirusTotalService();
