import type { ScannerStatus } from '../types/index.js';

export interface ScanResult {
  scannerName: string;
  status: ScannerStatus;
  threatName?: string;
  details?: string;
  scanTime: Date;
}

export interface FileScanner {
  readonly name: string;
  scanFile(filePath: string, sha256: string): Promise<ScanResult>;
}

/**
 * Default static file scanner implementation.
 * Performs local metadata/heuristic evaluation without external virus engine.
 */
export class StaticFileScanner implements FileScanner {
  readonly name = 'Built-in Static Heuristics';

  async scanFile(_filePath: string, _sha256: string): Promise<ScanResult> {
    return {
      scannerName: this.name,
      status: 'NOT_CONFIGURED',
      details: 'No external antivirus or threat intelligence API configured',
      scanTime: new Date(),
    };
  }
}

/**
 * Interface for future integrations like VirusTotal, ClamAV, Hybrid Analysis, OPSWAT.
 */
export interface ExternalThreatScanner extends FileScanner {
  apiKey?: string;
  endpointUrl?: string;
  checkHash(sha256: string): Promise<ScanResult>;
}

/**
 * Null/No-op external scanner indicating to user/admin that external scanning is not configured.
 */
export class NullExternalScanner implements ExternalThreatScanner {
  readonly name = 'External Threat Scanner';

  async scanFile(_filePath: string, _sha256: string): Promise<ScanResult> {
    return {
      scannerName: this.name,
      status: 'NOT_CONFIGURED',
      details: 'NOT CONFIGURED',
      scanTime: new Date(),
    };
  }

  async checkHash(_sha256: string): Promise<ScanResult> {
    return {
      scannerName: this.name,
      status: 'NOT_CONFIGURED',
      details: 'NOT CONFIGURED',
      scanTime: new Date(),
    };
  }
}

export class VirusTotalScanner implements ExternalThreatScanner {
  readonly name = 'VirusTotal v3 Intelligence';

  async scanFile(_filePath: string, sha256: string): Promise<ScanResult> {
    return this.checkHash(sha256);
  }

  async checkHash(sha256: string): Promise<ScanResult> {
    const { virusTotalService } = await import('./virusTotal.service.js');
    const report = await virusTotalService.getFileReport(sha256);
    if (!report || !report.isConfigured) {
      return {
        scannerName: this.name,
        status: 'NOT_CONFIGURED',
        details: 'VirusTotal API key not configured',
        scanTime: new Date(),
      };
    }

    if (!report.isFound) {
      return {
        scannerName: this.name,
        status: 'UNKNOWN',
        details: 'Hash not seen in VirusTotal (new or unique sample)',
        scanTime: new Date(),
      };
    }

    if (report.threatVerdict === 'MALICIOUS') {
      return {
        scannerName: this.name,
        status: 'MALICIOUS',
        threatName: report.topDetections[0] || 'Malware detected',
        details: `${report.maliciousCount}/${report.totalEngines} AV engines flagged as malicious`,
        scanTime: new Date(),
      };
    }

    if (report.threatVerdict === 'SUSPICIOUS') {
      return {
        scannerName: this.name,
        status: 'SUSPICIOUS',
        threatName: report.topDetections[0] || 'Suspicious heuristics',
        details: `${report.suspiciousCount + report.maliciousCount}/${report.totalEngines} AV engines flagged as suspicious`,
        scanTime: new Date(),
      };
    }

    return {
      scannerName: this.name,
      status: 'CLEAN',
      details: `Clean (0/${report.totalEngines} AV engines flagged)`,
      scanTime: new Date(),
    };
  }
}
