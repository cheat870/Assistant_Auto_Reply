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

  /**
   * Immediately alerts administrators when a message is deleted.
   */
  async notifyAdminsDeletedMessage(
    botApi: Api,
    details: {
      senderName?: string | null;
      senderUsername?: string | null;
      senderId?: string;
      chatId: string;
      messageId: number;
      sentAt?: Date;
      deletedAt: Date;
      messageType: string;
      fullText?: string | null;
      mediaFileId?: string | null;
    }
  ): Promise<void> {
    const env = getEnv();
    if (!env.ADMIN_NOTIFICATIONS_ENABLED) return;

    const sender = details.senderName || 'Unknown User';
    const userHandle = details.senderUsername ? `@${details.senderUsername}` : `ID: ${details.senderId || 'N/A'}`;
    const sentTime = details.sentAt
      ? details.sentAt.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : 'N/A';
    const deleteTime = details.deletedAt.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const escape = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const alertText = [
      `🗑️ <b>[សារត្រូវបានលុប (Deleted Message)]</b>`,
      ``,
      `👤 <b>អ្នកផ្ញើ:</b> ${escape(sender)} (${userHandle})`,
      `💬 <b>ប្រភេទ:</b> <code>${details.messageType.toUpperCase()}</code>`,
      `🕒 <b>ផ្ញើនៅ:</b> ${sentTime} | <b>លុបនៅ:</b> ${deleteTime}`,
      `🆔 <b>Chat ID:</b> <code>${details.chatId}</code>`,
      ``,
      `📝 <b>ខ្លឹមសារសារដែលគេបានលុប:</b>`,
      `<blockquote>${escape(details.fullText || '[គ្មានអត្ថបទ / Media File]')}</blockquote>`,
    ].join('\n');

    for (const adminId of env.ADMIN_IDS) {
      try {
        await botApi.sendMessage(adminId.toString(), alertText, {
          parse_mode: 'HTML',
        });

        // If it was a photo, voice, or document and we have the fileId, send the media file directly to admin!
        if (details.mediaFileId) {
          try {
            if (details.messageType === 'photo') {
              await botApi.sendPhoto(adminId.toString(), details.mediaFileId, {
                caption: `📸 <i>រូបភាពដែលគេបានលុប</i>`,
                parse_mode: 'HTML',
              });
            } else if (details.messageType === 'voice') {
              await botApi.sendVoice(adminId.toString(), details.mediaFileId, {
                caption: `🎙️ <i>សារសំឡេងដែលគេបានលុប</i>`,
                parse_mode: 'HTML',
              });
            } else if (details.messageType === 'document') {
              await botApi.sendDocument(adminId.toString(), details.mediaFileId, {
                caption: `📎 <i>ឯកសារដែលគេបានលុប</i>`,
                parse_mode: 'HTML',
              });
            }
          } catch (mediaErr) {
            logger.warn({ mediaErr }, 'Could not resend deleted media file');
          }
        }
      } catch (err) {
        logger.warn({ err, adminId: adminId.toString() }, 'Failed to notify admin of deleted message');
      }
    }
  }

  /**
   * Immediately alerts administrators when a message is edited.
   */
  async notifyAdminsEditedMessage(
    botApi: Api,
    details: {
      senderName?: string | null;
      senderUsername?: string | null;
      senderId?: string;
      chatId: string;
      sentAt?: Date;
      editedAt?: Date;
      originalText: string;
      newText: string;
    }
  ): Promise<void> {
    const env = getEnv();
    if (!env.ADMIN_NOTIFICATIONS_ENABLED) return;

    const sender = details.senderName || 'Unknown User';
    const userHandle = details.senderUsername ? `@${details.senderUsername}` : `ID: ${details.senderId || 'N/A'}`;
    const escape = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const alertText = [
      `✏️ <b>[សារត្រូវបានកែប្រែ (Edited Message)]</b>`,
      ``,
      `👤 <b>អ្នកផ្ញើ:</b> ${escape(sender)} (${userHandle})`,
      `🆔 <b>Chat ID:</b> <code>${details.chatId}</code>`,
      ``,
      `❌ <b>សារដើម (មុនកែ):</b>`,
      `<blockquote>${escape(details.originalText)}</blockquote>`,
      ``,
      `✅ <b>សារថ្មី (ក្រោយកែ):</b>`,
      `<blockquote>${escape(details.newText)}</blockquote>`,
    ].join('\n');

    for (const adminId of env.ADMIN_IDS) {
      try {
        await botApi.sendMessage(adminId.toString(), alertText, {
          parse_mode: 'HTML',
        });
      } catch (err) {
        logger.warn({ err, adminId: adminId.toString() }, 'Failed to notify admin of edited message');
      }
    }
  }
}

export const notificationService = new NotificationService();
