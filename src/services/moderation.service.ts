import type { Api } from 'grammy';
import { auditLogRepository } from '../database/repositories/auditLog.repository.js';
import { fileEventRepository } from '../database/repositories/fileEvent.repository.js';
import { auditLogger, logger } from '../utils/logger.js';
import { adminService } from './admin.service.js';

export interface ModerationResult {
  success: boolean;
  message: string;
  alreadyReviewed?: boolean;
}

export class ModerationService {
  /**
   * Processes manual file deletion by authorized administrator.
   */
  async deleteFile(
    fileEventId: string,
    adminTelegramId: bigint,
    botApi: Api
  ): Promise<ModerationResult> {
    if (!adminService.isAdmin(adminTelegramId)) {
      return {
        success: false,
        message: '⛔ Unauthorized: You are not an authorized administrator.',
      };
    }

    const event = await fileEventRepository.getFileEventById(fileEventId);
    if (!event) {
      return { success: false, message: '⚠️ File event not found.' };
    }

    if (event.status !== 'PENDING') {
      return {
        success: false,
        alreadyReviewed: true,
        message: '⚠️ This file has already been reviewed.',
      };
    }

    // Atomically transition status to DELETED
    const updated = await fileEventRepository.updateStatusIfPending(
      fileEventId,
      'DELETED',
      adminTelegramId,
      'Deleted by admin review'
    );

    if (!updated) {
      return {
        success: false,
        alreadyReviewed: true,
        message: '⚠️ This file has already been reviewed.',
      };
    }

    auditLogger.fileDeleted(adminTelegramId, fileEventId);
    await auditLogRepository.log({
      action: 'FILE_DELETED',
      targetType: 'FileEvent',
      targetId: fileEventId,
      adminTelegramId,
      metadata: {
        chatId: event.chatId,
        messageId: event.messageId,
        filename: event.filename,
      },
    });

    // Attempt to delete original message via Telegram Bot API
    try {
      await botApi.deleteMessage(event.chatId, event.messageId);
      return { success: true, message: '🗑 Message deleted by administrator.' };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: errMsg, chatId: event.chatId, messageId: event.messageId },
        'Failed to delete Telegram message'
      );

      return {
        success: true,
        message: `⚠️ Status set to DELETED, but unable to delete the message on Telegram.\n\nReason: Bot does not have the required Telegram permission or message is too old.`,
      };
    }
  }

  /**
   * Processes manual file approval by authorized administrator.
   */
  async allowFile(fileEventId: string, adminTelegramId: bigint): Promise<ModerationResult> {
    if (!adminService.isAdmin(adminTelegramId)) {
      return {
        success: false,
        message: '⛔ Unauthorized: You are not an authorized administrator.',
      };
    }

    const event = await fileEventRepository.getFileEventById(fileEventId);
    if (!event) {
      return { success: false, message: '⚠️ File event not found.' };
    }

    if (event.status !== 'PENDING') {
      return {
        success: false,
        alreadyReviewed: true,
        message: '⚠️ This file has already been reviewed.',
      };
    }

    // Atomically transition status to APPROVED
    const updated = await fileEventRepository.updateStatusIfPending(
      fileEventId,
      'APPROVED',
      adminTelegramId,
      'Approved by admin review'
    );

    if (!updated) {
      return {
        success: false,
        alreadyReviewed: true,
        message: '⚠️ This file has already been reviewed.',
      };
    }

    auditLogger.fileApproved(adminTelegramId, fileEventId);
    await auditLogRepository.log({
      action: 'FILE_APPROVED',
      targetType: 'FileEvent',
      targetId: fileEventId,
      adminTelegramId,
      metadata: {
        chatId: event.chatId,
        messageId: event.messageId,
        filename: event.filename,
      },
    });

    return { success: true, message: '✅ File approved by administrator. Original message kept.' };
  }

  /**
   * Processes manual ignore action by authorized administrator.
   */
  async ignoreFile(fileEventId: string, adminTelegramId: bigint): Promise<ModerationResult> {
    if (!adminService.isAdmin(adminTelegramId)) {
      return {
        success: false,
        message: '⛔ Unauthorized: You are not an authorized administrator.',
      };
    }

    const event = await fileEventRepository.getFileEventById(fileEventId);
    if (!event) {
      return { success: false, message: '⚠️ File event not found.' };
    }

    if (event.status !== 'PENDING') {
      return {
        success: false,
        alreadyReviewed: true,
        message: '⚠️ This file has already been reviewed.',
      };
    }

    // Atomically transition status to IGNORED
    const updated = await fileEventRepository.updateStatusIfPending(
      fileEventId,
      'IGNORED',
      adminTelegramId,
      'Ignored by admin review'
    );

    if (!updated) {
      return {
        success: false,
        alreadyReviewed: true,
        message: '⚠️ This file has already been reviewed.',
      };
    }

    auditLogger.fileIgnored(adminTelegramId, fileEventId);
    await auditLogRepository.log({
      action: 'FILE_IGNORED',
      targetType: 'FileEvent',
      targetId: fileEventId,
      adminTelegramId,
      metadata: {
        chatId: event.chatId,
        messageId: event.messageId,
        filename: event.filename,
      },
    });

    return { success: true, message: '❌ Review ignored. No destructive action was taken.' };
  }
}

export const moderationService = new ModerationService();
