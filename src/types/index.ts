import type { Context } from 'grammy';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'DELETED' | 'IGNORED' | 'ERROR';

export type ScannerStatus =
  | 'NOT_SCANNED'
  | 'NOT_CONFIGURED'
  | 'PENDING_SCAN'
  | 'CLEAN'
  | 'SUSPICIOUS'
  | 'MALICIOUS'
  | 'UNKNOWN';

export type MatchType = 'EXACT' | 'CONTAINS' | 'STARTS_WITH';

export type AuditAction =
  | 'FILE_DETECTED'
  | 'FILE_ANALYZED'
  | 'FILE_APPROVED'
  | 'FILE_DELETED'
  | 'FILE_IGNORED'
  | 'KEYWORD_CREATED'
  | 'KEYWORD_UPDATED'
  | 'KEYWORD_DELETED'
  | 'EXTENSION_ADDED'
  | 'EXTENSION_REMOVED'
  | 'SETTINGS_CHANGED';

export interface ExtensionAnalysisResult {
  primaryExtension: string; // e.g. ".exe"
  secondaryExtension?: string; // e.g. ".pdf" in "invoice.pdf.exe"
  allExtensions: string[]; // e.g. [".pdf", ".exe"]
  isDoubleExtension: boolean;
  dangerReason?: string;
  normalizedFilename: string;
}

export interface PESection {
  name: string;
  virtualSize: number;
  rawSize: number;
  entropy: number;
  isExecutable: boolean;
  isWritable: boolean;
}

export interface PEAnalysisResult {
  isPE: boolean;
  peType?: 'PE32' | 'PE32+' | 'Unknown';
  architecture?: 'x86' | 'x64' | 'ARM' | 'ARM64' | 'Unknown';
  subsystem?: 'Windows GUI' | 'Windows CUI (Console)' | 'Native' | 'Unknown';
  entryPointRVA?: string;
  imageBase?: string;
  sectionCount?: number;
  sections?: PESection[];
  digitalSignaturePresent: boolean;
  digitalSignatureDetails?: string;
  highEntropySections?: string[];
  indicators: string[];
}

export interface ScriptAnalysisResult {
  isScript: boolean;
  scriptType?: 'BATCH' | 'POWERSHELL' | 'VBSCRIPT' | 'JAVASCRIPT' | 'SHELL' | 'UNKNOWN';
  lineCount: number;
  indicators: string[];
  detectedCommands: string[];
  hasObfuscation: boolean;
  hasNetworkActivity: boolean;
  hasPersistence: boolean;
  hasFileDeletion: boolean;
  hasRegistryModification: boolean;
}

export interface ArchiveEntry {
  path: string;
  size: number;
  compressedSize: number;
  isEncrypted: boolean;
  isSuspicious: boolean;
  suspiciousReason?: string;
}

export interface ArchiveAnalysisResult {
  isArchive: boolean;
  archiveType?: 'ZIP' | 'TAR' | 'GZ' | 'RAR' | '7Z' | 'COMPRESS_Z' | 'UNKNOWN';
  entryCount: number;
  totalUncompressedSize: number;
  entries: ArchiveEntry[];
  hasExecutableContent: boolean;
  hasNestedArchives: boolean;
  isSuspectedZipBomb: boolean;
  indicators: string[];
}

export interface FileAnalysisResult {
  filename: string;
  normalizedFilename: string;
  extension: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  fileType: string;
  architecture?: string;
  digitalSignature: string;
  riskLevel: RiskLevel;
  scannerStatus: ScannerStatus;
  scannerResult?: string;
  indicators: string[];
  impactSummary: string[];
  peDetails?: PEAnalysisResult;
  scriptDetails?: ScriptAnalysisResult;
  archiveDetails?: ArchiveAnalysisResult;
  extensionDetails: ExtensionAnalysisResult;
}

export interface BotContext extends Context {
  isAdmin?: boolean;
  rateLimitExceeded?: boolean;
}

export interface UserStats {
  usersCount: number;
  messagesCount: number;
  filesAnalyzedCount: number;
  pendingReviewsCount: number;
  deletedByAdminCount: number;
  approvedCount: number;
  ignoredCount: number;
  autoRepliesCount: number;
  chatsCount: number;
}
