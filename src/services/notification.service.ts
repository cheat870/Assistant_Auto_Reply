import { InlineKeyboard, type Api } from 'grammy';
import { getEnv } from '../config/env.js';
import { fileEventRepository } from '../database/repositories/fileEvent.repository.js';
import { type Locale } from '../i18n/index.js';
import { auditLogger, logger } from '../utils/logger.js';
import { getModerationKeyboard } from '../bot/keyboards/moderation.keyboard.js';

export class NotificationService {
  /**
   * Notifies all configured administrators with the detailed analysis report
   * and interactive moderation inline keyboard.
   */
  async notifyAdmins(
    botApi: Api,
    fileEventId: string,
    adminAlertText: string,
    locale: Locale = 'km'
  ): Promise<void> {
    const env = getEnv();
    if (!env.ADMIN_NOTIFICATIONS_ENABLED) return;

    const keyboard = getModerationKeyboard(fileEventId, locale);

    for (const adminId of env.ADMIN_IDS) {
      try {
        const sent = await botApi.sendMessage(adminId.toString(), adminAlertText, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });

        await fileEventRepository.setAdminAlertMessageId(fileEventId, sent.message_id);
        auditLogger.adminNotified(adminId.toString(), fileEventId);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn(
          { err: errMsg, adminId: adminId.toString(), fileEventId },
          'Could not send notification to admin (may need to /start the bot in private chat)'
        );
      }
    }
  }

  /**
   * Updates an admin alert message after a decision has been taken,
   * removing the buttons and updating the status text.
   */
  async updateAdminAlertDecision(
    botApi: Api,
    chatId: string | number,
    messageId: number,
    decisionText: string
  ): Promise<void> {
    try {
      await botApi.editMessageReplyMarkup(chatId, messageId, {
        reply_markup: new InlineKeyboard(), // empty keyboard
      });
      await botApi.sendMessage(chatId, decisionText, {
        reply_to_message_id: messageId,
        parse_mode: 'HTML',
      });
    } catch (err) {
      logger.warn({ err, chatId, messageId }, 'Failed to update admin alert message');
    }
  }
}

export const notificationService = new NotificationService();
