import type { NextFunction } from 'grammy';
import { chatRepository } from '../../database/repositories/chat.repository.js';
import { userRepository } from '../../database/repositories/user.repository.js';
import type { BotContext } from '../../types/index.js';
import { auditLogger, logger } from '../../utils/logger.js';

export async function loggerMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const from = ctx.from;
  const chat = ctx.chat;
  const message = ctx.message;

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

  if (message && chat && from) {
    auditLogger.messageReceived(chat.id, from.id, message.message_id);

    const messageType = message.document
      ? 'document'
      : message.photo
        ? 'photo'
        : message.video
          ? 'video'
          : message.audio
            ? 'audio'
            : message.text
              ? 'text'
              : 'other';

    userRepository
      .recordMessage({
        telegramMessageId: message.message_id,
        chatId: chat.id.toString(),
        userId: from.id.toString(),
        messageType,
        textPreview: message.text || message.caption,
      })
      .catch(err => logger.warn({ err }, 'Failed to record message event'));
  }

  await next();
}
