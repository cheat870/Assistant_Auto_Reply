import { messageRepository } from '../../database/repositories/message.repository.js';
import { channelArchiveService } from '../../services/channelArchive.service.js';
import { notificationService } from '../../services/notification.service.js';
import type { BotContext } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Handles Telegram Business deleted messages events.
 * Triggers when someone deletes a message in a connected business chat.
 */
export async function handleDeletedBusinessMessages(ctx: BotContext): Promise<void> {
  const update = ctx.update.deleted_business_messages;
  if (!update) return;

  const chatId = update.chat.id.toString();
  const messageIds = update.message_ids;

  logger.info({ chatId, messageIds, count: messageIds.length }, 'Deleted business messages event received');

  for (const msgId of messageIds) {
    try {
      const deletedRecord = await messageRepository.markDeleted(chatId, msgId);

      await notificationService.notifyAdminsDeletedMessage(ctx.api, {
        chatId,
        messageId: msgId,
        senderName: deletedRecord.senderName,
        senderUsername: deletedRecord.senderUsername,
        senderId: deletedRecord.userId,
        sentAt: deletedRecord.createdAt,
        deletedAt: deletedRecord.deletedAt || new Date(),
        messageType: deletedRecord.messageType,
        fullText: deletedRecord.fullText,
        mediaFileId: deletedRecord.mediaFileId,
      });

      await channelArchiveService.archiveDeletedMessage(ctx.api, {
        chatId,
        messageId: msgId,
        senderName: deletedRecord.senderName,
        senderUsername: deletedRecord.senderUsername,
        senderId: deletedRecord.userId,
        sentAt: deletedRecord.createdAt,
        deletedAt: deletedRecord.deletedAt || new Date(),
        messageType: deletedRecord.messageType,
        fullText: deletedRecord.fullText,
        mediaFileId: deletedRecord.mediaFileId,
      });
    } catch (err) {
      logger.error({ err, chatId, msgId }, 'Error handling deleted business message');
    }
  }
}

/**
 * Handles edited messages (regular chats).
 */
export async function handleEditedMessage(ctx: BotContext): Promise<void> {
  const edited = ctx.update.edited_message;
  if (!edited || !edited.chat) return;

  const chatId = edited.chat.id.toString();
  const msgId = edited.message_id;
  const newText = edited.text || edited.caption;
  if (!newText) return;

  try {
    const updated = await messageRepository.markEdited(chatId, msgId, newText);
    if (updated && updated.originalText && updated.originalText !== newText) {
      await notificationService.notifyAdminsEditedMessage(ctx.api, {
        chatId,
        senderName: updated.senderName,
        senderUsername: updated.senderUsername,
        senderId: updated.userId,
        sentAt: updated.createdAt,
        editedAt: updated.editedAt || new Date(),
        originalText: updated.originalText,
        newText,
      });
    }
  } catch (err) {
    logger.error({ err, chatId, msgId }, 'Error handling edited message');
  }
}

/**
 * Handles edited business messages.
 */
export async function handleEditedBusinessMessage(ctx: BotContext): Promise<void> {
  const edited = ctx.update.edited_business_message;
  if (!edited || !edited.chat) return;

  const chatId = edited.chat.id.toString();
  const msgId = edited.message_id;
  const newText = edited.text || edited.caption;
  if (!newText) return;

  try {
    const updated = await messageRepository.markEdited(chatId, msgId, newText);
    if (updated && updated.originalText && updated.originalText !== newText) {
      await notificationService.notifyAdminsEditedMessage(ctx.api, {
        chatId,
        senderName: updated.senderName,
        senderUsername: updated.senderUsername,
        senderId: updated.userId,
        sentAt: updated.createdAt,
        editedAt: updated.editedAt || new Date(),
        originalText: updated.originalText,
        newText,
      });
    }
  } catch (err) {
    logger.error({ err, chatId, msgId }, 'Error handling edited business message');
  }
}

/**
 * Admin command: /deleted or /deleted_messages
 * Lists recently deleted messages preserved in the database.
 */
export async function handleDeletedCommand(ctx: BotContext): Promise<void> {
  const deletedMessages = await messageRepository.getRecentDeleted(10);

  if (deletedMessages.length === 0) {
    await ctx.reply(
      '📋 <b>ប្រវត្តិសារដែលត្រូវបានលុប (Deleted Messages):</b>\n\n<i>មិនទាន់មានសារដែលត្រូវបានលុបត្រូវបានរកឃើញនៅឡើយទេ។</i>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const lines = [
    `📋 <b>ប្រវត្តិសារដែលបានលុបចុងក្រោយ (${deletedMessages.length}):</b>`,
    `<i>សារទាំងអស់ត្រូវបានរក្សាទុកដោយស្វ័យប្រវត្តិ ទោះបីជាគេលុបក៏ដោយ។</i>`,
    ``,
  ];

  for (let i = 0; i < deletedMessages.length; i++) {
    const m = deletedMessages[i];
    if (!m) continue;
    const time = m.deletedAt
      ? m.deletedAt.toLocaleString('km-KH')
      : m.createdAt.toLocaleString('km-KH');
    const sender = m.senderName || 'Anonymous';
    const handle = m.senderUsername ? `@${m.senderUsername}` : `ID: ${m.userId}`;
    const preview = m.fullText ? m.fullText.substring(0, 100) : `[ឯកសារ/មេឌា ${m.messageType}]`;

    lines.push(`<b>${i + 1}. ${sender}</b> (${handle})`);
    lines.push(`⏰ <i>លុបនៅ: ${time}</i>`);
    lines.push(`💬 <i>សារ:</i> <blockquote>${escapeHtml(preview)}</blockquote>`);
    lines.push(``);
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
