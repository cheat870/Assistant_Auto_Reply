import { getEnv } from '../../config/env.js';
import { autoReplyService } from '../../services/autoReply.service.js';
import type { BotContext } from '../../types/index.js';
import { auditLogger } from '../../utils/logger.js';

export async function handleTextMessage(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text || ctx.message?.caption;
  if (!text) return;

  // Ignore bot commands
  if (text.startsWith('/')) return;

  const env = getEnv();
  if (!env.AUTO_REPLY_ENABLED) return;

  const match = await autoReplyService.findReply(text, ctx.chat?.id ? String(ctx.chat.id) : null);
  if (match) {
    await ctx.reply(match.reply, {
      reply_to_message_id: ctx.message?.message_id,
    });

    if (ctx.chat) {
      auditLogger.autoReplySent(ctx.chat.id, match.matchedKeyword, match.matchType);
    }
  }
}
