import fs from 'node:fs';
import {
  ARCHIVE_EXTENSIONS,
  DEFAULT_BLOCKED_EXTENSIONS,
  EXECUTABLE_EXTENSIONS,
  SCRIPT_EXTENSIONS,
} from '../config/constants.js';
import type {
  ArchiveAnalysisResult,
  FileAnalysisResult,
  PEAnalysisResult,
  RiskLevel,
  ScriptAnalysisResult,
} from '../types/index.js';
import { analyzeFilenameExtension } from '../utils/extension.js';
import { sanitizeFilename } from '../utils/filename.js';
import { computeFileSha256 } from '../utils/hash.js';
import { auditLogger } from '../utils/logger.js';
import { checkMimeDiscrepancy, identifyFileSignature } from '../utils/mime.js';
import { analyzeArchiveFile } from './archiveScanner.service.js';
import { analyzePEFile } from './peAnalyzer.service.js';
import { VirusTotalScanner, type ExternalThreatScanner } from './scanner.interface.js';
import { analyzeScriptFile } from './scriptAnalyzer.service.js';
import { t, getLocalizedRiskLabel, type Locale } from '../i18n/index.js';

export class FileAnalysisService {
  private scanner: ExternalThreatScanner = new VirusTotalScanner();

  /**
   * Executes complete, safe static analysis on an uploaded file.
   * NEVER executes the file under any circumstances.
   */
  async analyzeFile(
    filePath: string,
    originalFilename: string,
    telegramMime?: string
  ): Promise<FileAnalysisResult> {
    auditLogger.fileAnalysisStarted(originalFilename, 0);

    const stats = await fs.promises.stat(filePath);
    const sizeBytes = stats.size;

    // 1. Extension and double-extension detection
    const extensionDetails = analyzeFilenameExtension(originalFilename);
    const ext = extensionDetails.primaryExtension;
    const normalizedFilename = sanitizeFilename(originalFilename);

    // 2. SHA-256 calculation
    const sha256 = await computeFileSha256(filePath);

    // 3. Magic bytes / file signature detection
    const headerFd = await fs.promises.open(filePath, 'r');
    const headerBuffer = Buffer.alloc(Math.min(512, sizeBytes));
    await headerFd.read(headerBuffer, 0, headerBuffer.length, 0);
    await headerFd.close();

    const signature = identifyFileSignature(headerBuffer);
    const mimeDiscrepancy = checkMimeDiscrepancy(ext, telegramMime, signature);

    const indicators: string[] = [];
    const impactSummary: string[] = [];

    // Check double extension
    if (extensionDetails.isDoubleExtension) {
      indicators.push(`Double Extension Deception: ${extensionDetails.dangerReason}`);
      impactSummary.push(
        'A user could mistake the file for a normal document/media file and unintentionally run it.'
      );
    }

    if (mimeDiscrepancy.length > 0) {
      indicators.push(...mimeDiscrepancy);
      impactSummary.push(
        'The reported file extension contradicts the actual internal file format (deceptive naming).'
      );
    }

    let peDetails: PEAnalysisResult | undefined;
    let scriptDetails: ScriptAnalysisResult | undefined;
    let archiveDetails: ArchiveAnalysisResult | undefined;

    let fileType = signature.detectedType;
    let architecture: string | undefined;
    let digitalSignature = 'N/A';

    // 4. Executable / PE Analysis
    if (
      ext === '.exe' ||
      ext === '.dll' ||
      ext === '.sys' ||
      ext === '.scr' ||
      signature.detectedType.includes('PE')
    ) {
      peDetails = await analyzePEFile(filePath);
      fileType = peDetails.peType ? `${peDetails.peType} executable` : 'Windows Executable';
      architecture = peDetails.architecture;
      digitalSignature = peDetails.digitalSignaturePresent ? 'Present' : 'Not detected';

      indicators.push(...peDetails.indicators);

      impactSummary.push('Can execute native binary machine code on Windows');
      impactSummary.push('Can launch additional processes');
      impactSummary.push('Can create, modify, or delete files');
      impactSummary.push('Can communicate with external services if network code is included');
      impactSummary.push(
        'If malicious, could potentially compromise user data or system integrity'
      );
    }
    // 5. Script Analysis
    else if (SCRIPT_EXTENSIONS.has(ext)) {
      scriptDetails = await analyzeScriptFile(filePath);
      fileType = `${scriptDetails.scriptType} Script`;

      indicators.push(...scriptDetails.indicators);

      impactSummary.push(
        `Can execute ${scriptDetails.scriptType} commands directly on the operating system`
      );
      if (scriptDetails.hasNetworkActivity) {
        impactSummary.push('Contains network or remote download commands');
      }
      if (scriptDetails.hasFileDeletion) {
        impactSummary.push('Contains commands that can delete files or data');
      }
      if (scriptDetails.hasRegistryModification || scriptDetails.hasPersistence) {
        impactSummary.push(
          'Contains commands that can alter system registry or configure persistence'
        );
      }
      if (scriptDetails.hasObfuscation) {
        impactSummary.push('Contains obfuscated or encoded commands that obscure intent');
      }
    }
    // 6. Archive Analysis
    else if (ARCHIVE_EXTENSIONS.has(ext) || signature.isArchive) {
      archiveDetails = await analyzeArchiveFile(filePath);
      fileType = archiveDetails.archiveType
        ? `${archiveDetails.archiveType} Archive`
        : 'Compressed Archive';

      indicators.push(...archiveDetails.indicators);

      if (archiveDetails.hasExecutableContent) {
        impactSummary.push('Contains one or more executable or script files inside the archive');
        impactSummary.push('Extracting and running contents could execute code on the host system');
      }
      if (archiveDetails.isSuspectedZipBomb) {
        impactSummary.push(
          'Exhibits characteristics of an archive bomb (abnormal decompression ratio/size)'
        );
      }
      if (archiveDetails.hasNestedArchives) {
        impactSummary.push('Contains nested archives which may conceal nested files');
      }
      if (archiveDetails.archiveType === 'UNKNOWN') {
        impactSummary.push(
          'Unknown compressed archive format; contents should be verified before opening'
        );
      }
    }

    // Deduplicate indicators and impacts
    const uniqueIndicators = Array.from(new Set(indicators));
    const uniqueImpact = Array.from(new Set(impactSummary));

    // Calculate Risk Level
    const riskLevel = this.calculateRiskLevel({
      ext,
      isDoubleExtension: extensionDetails.isDoubleExtension,
      peDetails,
      scriptDetails,
      archiveDetails,
      uniqueIndicators,
      fileType,
    });

    // Scanner check
    const scanResult = await this.scanner.scanFile(filePath, sha256);

    auditLogger.fileAnalysisCompleted(originalFilename, sha256, riskLevel);

    return {
      filename: originalFilename,
      normalizedFilename,
      extension: ext,
      sizeBytes,
      mimeType: telegramMime || signature.detectedType,
      sha256,
      fileType,
      architecture,
      digitalSignature,
      riskLevel,
      scannerStatus: scanResult.status,
      scannerResult: scanResult.details,
      indicators: uniqueIndicators,
      impactSummary: uniqueImpact,
      peDetails,
      scriptDetails,
      archiveDetails,
      extensionDetails,
    };
  }

  /**
   * Evaluates technical indicators to calculate an objective risk level.
   * Never labels files as "virus" or "malware".
   */
  calculateRiskLevel(params: {
    ext: string;
    isDoubleExtension: boolean;
    peDetails?: PEAnalysisResult;
    scriptDetails?: ScriptAnalysisResult;
    archiveDetails?: ArchiveAnalysisResult;
    uniqueIndicators: string[];
    fileType: string;
  }): RiskLevel {
    const { ext, isDoubleExtension, peDetails, scriptDetails, archiveDetails, uniqueIndicators } =
      params;

    // Critical conditions:
    // - Suspected zip bomb
    // - Path traversal in archive
    // - Shadow copy deletion in script
    // - Double extension with executable
    if (archiveDetails?.isSuspectedZipBomb) return 'CRITICAL';
    if (uniqueIndicators.some(i => i.toLowerCase().includes('path traversal'))) return 'CRITICAL';
    if (uniqueIndicators.some(i => i.toLowerCase().includes('shadow copy'))) return 'CRITICAL';
    if (isDoubleExtension) return 'HIGH';

    // High risk conditions:
    // - Executable files (.exe, .dll, .scr, etc.)
    // - Scripts (.bat, .cmd, .ps1, .vbs)
    // - Archive containing executables
    if (EXECUTABLE_EXTENSIONS.has(ext)) return 'HIGH';
    if (SCRIPT_EXTENSIONS.has(ext)) return 'HIGH';
    if (archiveDetails?.hasExecutableContent) return 'HIGH';
    if (peDetails?.isPE) return 'HIGH';
    if (scriptDetails?.hasNetworkActivity || scriptDetails?.hasFileDeletion) return 'HIGH';

    // Medium risk conditions:
    // - Archive with unknown or safe contents
    // - Unknown compressed format (.z)
    // - Blocked extension list item without executable indicators
    if (ARCHIVE_EXTENSIONS.has(ext)) return 'MEDIUM';
    if (ext === '.z') return 'MEDIUM';
    if (DEFAULT_BLOCKED_EXTENSIONS.includes(ext as (typeof DEFAULT_BLOCKED_EXTENSIONS)[number])) {
      return 'MEDIUM';
    }

    // Low risk:
    // Regular media, images, text documents without suspicious indicators
    if (uniqueIndicators.length === 0) return 'LOW';

    return 'UNKNOWN';
  }

  /**
   * Translates impact statements into natural Khmer if requested.
   */
  localizeImpact(imp: string, locale: Locale): string {
    if (locale !== 'km') return imp;

    const lower = imp.toLowerCase();
    if (lower.includes('execute native binary') || lower.includes('execute machine code')) {
      return t('impact_windows_exec', 'km');
    }
    if (lower.includes('launch') && lower.includes('process')) {
      return t('impact_launch_process', 'km');
    }
    if (lower.includes('create, modify, or delete files') || lower.includes('modify files')) {
      return t('impact_file_mod', 'km');
    }
    if (lower.includes('external services') || lower.includes('network')) {
      return t('impact_network', 'km');
    }
    if (lower.includes('compromise') || lower.includes('steal')) {
      return t('impact_compromise', 'km');
    }
    if (lower.includes('mistake') || lower.includes('double extension')) {
      return t('impact_double_ext', 'km');
    }
    if (lower.includes('script commands')) {
      return t('impact_script_cmd', 'km');
    }
    if (lower.includes('registry') || lower.includes('persistence')) {
      return t('impact_registry', 'km');
    }
    if (lower.includes('archive') && lower.includes('executable')) {
      return t('impact_archive_exec', 'km');
    }
    if (lower.includes('archive bomb') || lower.includes('zip bomb')) {
      return t('impact_zip_bomb', 'km');
    }

    return imp;
  }

  /**
   * Formats the concise user-facing alert message.
   */
  formatUserAlert(result: FileAnalysisResult, locale: Locale = 'km'): string {
    const riskLabel = getLocalizedRiskLabel(result.riskLevel, locale);

    let message = `${t('alert_user_title', locale)}\n\n`;
    message += `${t('alert_file_label', locale)}\n<code>${this.escapeHtml(result.normalizedFilename)}</code>\n\n`;
    message += `${t('alert_type_label', locale)}\n${this.escapeHtml(result.fileType)}\n\n`;
    message += `${t('alert_risk_label', locale)}\n${riskLabel}\n\n`;

    if (result.impactSummary.length > 0) {
      message += `${t('alert_impact_label', locale)}\n\n`;
      message +=
        result.impactSummary
          .map(imp => `• ${this.escapeHtml(this.localizeImpact(imp, locale))}`)
          .join('\n') + '\n\n';
    }

    if (result.indicators.length > 0) {
      message += `${t('alert_analysis_label', locale)}\n\n`;
      message +=
        result.indicators
          .slice(0, 5)
          .map(ind => `• ${this.escapeHtml(ind)}`)
          .join('\n') + '\n\n';
    }

    message += `${t('alert_sha256_label', locale)}\n<code>${result.sha256}</code>\n\n`;
    message += `${t('alert_disclaimer', locale)}\n\n`;
    message += `${t('alert_status_waiting', locale)}`;

    return message;
  }

  /**
   * Formats the detailed security analysis message for administrators.
   */
  formatAdminAlert(
    result: FileAnalysisResult,
    userMeta: { username?: string; firstName?: string; userId: string | number },
    chatTitle: string,
    locale: Locale = 'km'
  ): string {
    const riskLabel = getLocalizedRiskLabel(result.riskLevel, locale);

    const userHandle = userMeta.username
      ? `@${userMeta.username}`
      : userMeta.firstName
        ? this.escapeHtml(userMeta.firstName)
        : 'Unknown User';

    const sizeFormatted = (result.sizeBytes / (1024 * 1024)).toFixed(2) + ' MB';

    let message = `${t('alert_admin_title', locale)}\n\n`;
    message += `${t('admin_user_label', locale)} ${userHandle}\n`;
    message += `${t('admin_userid_label', locale)} <code>${userMeta.userId}</code>\n`;
    message += `${t('admin_chat_label', locale)} ${this.escapeHtml(chatTitle)}\n\n`;

    message += `${t('admin_filename_label', locale)} <code>${this.escapeHtml(result.normalizedFilename)}</code>\n`;
    message += `${t('admin_ext_label', locale)} <code>${this.escapeHtml(result.extension || 'None')}</code>\n`;
    message += `${t('admin_size_label', locale)} ${sizeFormatted}\n`;
    message += `${t('admin_filetype_label', locale)} ${this.escapeHtml(result.fileType)}\n`;

    if (result.architecture) {
      message += `${t('admin_arch_label', locale)} ${this.escapeHtml(result.architecture)}\n`;
    }
    if (result.digitalSignature !== 'N/A') {
      const sigVal =
        locale === 'km' && result.digitalSignature === 'Present'
          ? 'មានហត្ថលេខា (Present)'
          : locale === 'km' && result.digitalSignature === 'Not detected'
            ? 'រកមិនឃើញហត្ថលេខា (Not detected)'
            : result.digitalSignature;
      message += `${t('admin_sig_label', locale)} ${this.escapeHtml(sigVal)}\n`;
    }

    message += `${t('alert_sha256_label', locale)}\n<code>${result.sha256}</code>\n\n`;
    message += `${t('alert_risk_label', locale)} ${riskLabel}\n\n`;

    // Archive contents listing if applicable
    if (result.archiveDetails && result.archiveDetails.entries.length > 0) {
      message += `📦 <b>Archive Contents (${result.archiveDetails.entries.length} items):</b>\n`;
      const sample = result.archiveDetails.entries.slice(0, 10);
      sample.forEach(entry => {
        const icon = entry.isSuspicious ? '🔴' : '🟢';
        message += `${icon} <code>${this.escapeHtml(entry.path)}</code>\n`;
      });
      if (result.archiveDetails.entries.length > 10) {
        message += `<i>...and ${result.archiveDetails.entries.length - 10} more items</i>\n`;
      }
      message += '\n';
    }

    if (result.indicators.length > 0) {
      message += `${t('admin_indicators_label', locale)}\n`;
      message +=
        result.indicators
          .slice(0, 8)
          .map(ind => `• ${this.escapeHtml(ind)}`)
          .join('\n') + '\n\n';
    }

    if (result.impactSummary.length > 0) {
      message += `${t('admin_impact_label', locale)}\n`;
      message +=
        result.impactSummary
          .map(imp => `• ${this.escapeHtml(this.localizeImpact(imp, locale))}`)
          .join('\n') + '\n\n';
    }

    const scannerText =
      result.scannerStatus === 'NOT_CONFIGURED'
        ? t('admin_scanner_unconfigured', locale)
        : result.scannerStatus;

    message += `${t('admin_scanner_label', locale)} ${scannerText}\n\n`;
    message += `${t('admin_status_pending', locale)}`;

    return message;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
