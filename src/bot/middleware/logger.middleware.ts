import type { NextFunction } from 'grammy';
import { chatRepository } from '../../database/repositories/chat.repository.js';
import { messageRepository } from '../../database/repositories/message.repository.js';
import { userRepository } from '../../database/repositories/user.repository.js';
import type { BotContext } from '../../types/index.js';
import { auditLogger, logger } from '../../utils/logger.js';

export async function loggerMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const from = ctx.from;
  const chat = ctx.chat;

  if (from) {
    userRepository
      .upsertUser({
        telegramId: from.id,
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
        isBot: from.is_bot,
      })
      .catch(err => logger.warn({ err }, 'Failed to upsert user'));
  }

  if (chat) {
    chatRepository
      .upsertChat({
        telegramChatId: chat.id,
        type: chat.type,
        title: 'title' in chat ? chat.title : undefined,
        username: 'username' in chat ? chat.username : undefined,
      })
      .catch(err => logger.warn({ err }, 'Failed to upsert chat'));
  }

  const incomingMsg = ctx.message || ctx.businessMessage;

  if (incomingMsg && chat && from) {
    auditLogger.messageReceived(chat.id, from.id, incomingMsg.message_id);

    const messageType = incomingMsg.document
      ? 'document'
      : incomingMsg.photo
        ? 'photo'
        : incomingMsg.voice
          ? 'voice'
          : incomingMsg.video
            ? 'video'
            : incomingMsg.audio
              ? 'audio'
              : incomingMsg.text
                ? 'text'
                : 'other';

    const fullText = incomingMsg.text || incomingMsg.caption || undefined;
    const mediaFileId = incomingMsg.photo
      ? incomingMsg.photo[incomingMsg.photo.length - 1]?.file_id
      : incomingMsg.voice
        ? incomingMsg.voice.file_id
        : incomingMsg.document
          ? incomingMsg.document.file_id
          : incomingMsg.video
            ? incomingMsg.video.file_id
            : incomingMsg.audio
              ? incomingMsg.audio.file_id
              : undefined;

    const senderName =
      [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || undefined;

    messageRepository
      .saveMessage({
        telegramMessageId: incomingMsg.message_id,
        chatId: chat.id.toString(),
        userId: from.id.toString(),
        senderName,
        senderUsername: from.username,
        messageType,
        fullText,
        mediaFileId,
      })
      .catch(err => logger.warn({ err }, 'Failed to record message in messageRepository'));
  }

  await next();
}
