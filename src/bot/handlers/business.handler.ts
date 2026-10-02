import { getEnv } from '../../config/env.js';
import { autoReplyService } from '../../services/autoReply.service.js';
import type { BotContext } from '../../types/index.js';
import { auditLogger, logger } from '../../utils/logger.js';

/**
 * Handles Telegram Business connection events (connect / disconnect / permission change).
 */
export async function handleBusinessConnection(ctx: BotContext): Promise<void> {
  const conn = ctx.businessConnection;
  if (!conn) return;

  logger.info(
    {
      event: 'BUSINESS_CONNECTION',
      connectionId: conn.id,
      user: conn.user.id,
      username: conn.user.username,
      canReply: conn.rights?.can_reply ?? false,
      isEnabled: conn.is_enabled,
    },
    `💼 Telegram Business Secretary Mode ${conn.is_enabled ? 'ENABLED' : 'DISABLED'} for user ${conn.user.id} (${conn.user.first_name})`
  );
}

/**
 * Handles incoming business text messages when connected to a user's personal Telegram account.
 * Operates as a Secretary / Auto-Responder on behalf of the account owner.
 */
export async function handleBusinessTextMessage(ctx: BotContext): Promise<void> {
  const msg = ctx.businessMessage;
  if (!msg) return;

  const text = msg.text || msg.caption;
  if (!text) return;

  // Ignore bot commands
  if (text.startsWith('/')) return;

  const env = getEnv();
  if (!env.AUTO_REPLY_ENABLED) return;

  // Do not reply to bots
  if (msg.from?.is_bot) return;

  // Do not reply to the business account owner's own messages sent to others
  if (msg.from && env.ADMIN_IDS.includes(BigInt(msg.from.id))) {
    return;
  }

  const match = await autoReplyService.findReply(text, String(msg.chat.id));
  if (match) {
    try {
      await ctx.reply(match.reply, {
        business_connection_id: msg.business_connection_id,
        reply_to_message_id: msg.message_id,
      });

      auditLogger.autoReplySent(msg.chat.id, match.matchedKeyword, match.matchType);
    } catch (err) {
      logger.error({ err, chatId: msg.chat.id }, 'Failed to send business auto reply');
    }
  }
}
