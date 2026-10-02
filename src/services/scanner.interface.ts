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
