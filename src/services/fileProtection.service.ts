import fs from 'node:fs';
import path from 'node:path';
import type { Context } from 'grammy';
import { getEnv } from '../config/env.js';
import { blockedExtensionRepository } from '../database/repositories/blockedExtension.repository.js';
import { fileEventRepository } from '../database/repositories/fileEvent.repository.js';
import { analyzeFilenameExtension } from '../utils/extension.js';
import { generateSafeTempFilename, sanitizeFilename } from '../utils/filename.js';
import { auditLogger, logger } from '../utils/logger.js';
import { cleanupTempDir, createIsolatedTempDir, withTimeout } from '../utils/security.js';
import { FileAnalysisService } from './fileAnalysis.service.js';
import { notificationService } from './notification.service.js';
import { quarantineStorageService } from './quarantineStorage.service.js';
import { getChatLanguage } from '../i18n/index.js';

export class FileProtectionService {
  private analysisService = new FileAnalysisService();

  /**
   * Determines whether an incoming file requires static security analysis.
   */
  async shouldAnalyzeFile(filename: string): Promise<boolean> {
    const extDetails = analyzeFilenameExtension(filename);

    // Double extensions always require analysis
    if (extDetails.isDoubleExtension) {
      return true;
    }

    // Check against centralized blocked extensions database
    const isBlocked = await blockedExtensionRepository.isExtensionBlocked(
      extDetails.primaryExtension
    );
    if (isBlocked) {
      return true;
    }

    return false;
  }

  /**
   * Executes the full file detection, download, static analysis, reporting,
   * and admin notification workflow.
   *
   * STRICT SAFETY RULE:
   * NEVER deletes, bans, or mutes automatically.
   * Keeps original message and records event as PENDING.
   */
  async processIncomingFile(
    ctx: Context,
    fileInfo: {
      fileId: string;
      filename: string;
      mimeType?: string;
      sizeBytes: number;
    }
  ): Promise<void> {
    const env = getEnv();
    if (!env.FILE_PROTECTION_ENABLED) return;

    const { fileId, filename, mimeType, sizeBytes } = fileInfo;
    const sanitizedName = sanitizeFilename(filename);

    const requiresAnalysis = await this.shouldAnalyzeFile(sanitizedName);
    if (!requiresAnalysis) {
      return;
    }

    const chatId = ctx.chat?.id.toString();
    const messageId = ctx.message?.message_id;
    const userId = ctx.from?.id.toString() || 'unknown';

    if (!ctx.chat || !chatId || !messageId) return;

    auditLogger.fileDetected(sanitizedName, path.extname(sanitizedName), 'PENDING_ANALYSIS');

    // Check file size limit
    const maxBytes = env.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (sizeBytes > maxBytes) {
      await ctx.reply(
        `⚠️ <b>File Security Notice</b>\n\nThe file <code>${sanitizedName}</code> (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum analysis size limit of ${env.MAX_FILE_SIZE_MB} MB.\n\nStatus: Manual review required.`,
        { reply_to_message_id: messageId, parse_mode: 'HTML' }
      );
      return;
    }

    let tempDir = '';
    try {
      // 1. Create isolated temporary directory
      tempDir = await createIsolatedTempDir();
      const ext = path.extname(sanitizedName);
      const safeTempName = generateSafeTempFilename(ext);
      const tempFilePath = path.join(tempDir, safeTempName);

      // 2. Download file securely from Telegram
      const tgFile = await ctx.api.getFile(fileId);
      if (!tgFile.file_path) {
        throw new Error('Telegram did not return file_path');
      }

      const fileDownloadUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${tgFile.file_path}`;
      const response = await fetch(fileDownloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      await fs.promises.writeFile(tempFilePath, Buffer.from(arrayBuffer));

      // 3. Perform static analysis with timeout protection
      const analysisResult = await withTimeout(
        this.analysisService.analyzeFile(tempFilePath, sanitizedName, mimeType),
        env.FILE_SCAN_TIMEOUT_SECONDS,
        'File static analysis'
      );

      // 3.5 Safely quarantine suspicious file
      await quarantineStorageService.quarantineFile(
        sanitizedName,
        Buffer.from(arrayBuffer),
        analysisResult.sha256
      );

      // 4. Save FileEvent in database with status PENDING
      const fileEvent = await fileEventRepository.createFileEvent({
        chatId,
        userId,
        messageId,
        filename: sanitizedName,
        extension: analysisResult.extension,
        mimeType: analysisResult.mimeType,
        size: analysisResult.sizeBytes,
        sha256: analysisResult.sha256,
        fileType: analysisResult.fileType,
        architecture: analysisResult.architecture,
        digitalSignature: analysisResult.digitalSignature,
        riskLevel: analysisResult.riskLevel,
        scannerStatus: analysisResult.scannerStatus,
        scannerResult: analysisResult.scannerResult,
        indicators: analysisResult.indicators,
        impactSummary: analysisResult.impactSummary,
      });

      const locale = getChatLanguage(chatId, ctx.from?.language_code);

      // 5. Send concise user-facing explanation in the chat
      const userMessage = this.analysisService.formatUserAlert(analysisResult, locale);
      await ctx.reply(userMessage, {
        reply_to_message_id: messageId,
        parse_mode: 'HTML',
      });

      // 6. Send detailed report and interactive review keyboard to admins
      const chatTitle =
        ctx.chat.type === 'private'
          ? 'ការសន្ទនាផ្ទាល់ខ្លួន (Private)'
          : 'title' in ctx.chat
            ? (ctx.chat.title ?? 'Group')
            : 'Group';

      const adminAlertText = this.analysisService.formatAdminAlert(
        analysisResult,
        {
          username: ctx.from?.username,
          firstName: ctx.from?.first_name,
          userId,
        },
        chatTitle,
        'km'
      );

      await notificationService.notifyAdmins(ctx.api, fileEvent.id, adminAlertText, 'km');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      auditLogger.error(`Error processing file ${sanitizedName}`, err, { chatId, messageId });
      logger.error({ err: errMsg, filename: sanitizedName }, 'File analysis error');
    } finally {
      // 7. Always safely remove temporary files
      if (tempDir) {
        await cleanupTempDir(tempDir);
      }
    }
  }
}

export const fileProtectionService = new FileProtectionService();
