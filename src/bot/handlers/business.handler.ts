import { getEnv } from '../../config/env.js';
import { aiService } from '../../services/ai.service.js';
import { autoReplyService } from '../../services/autoReply.service.js';
import { channelArchiveService } from '../../services/channelArchive.service.js';
import { linkScannerService } from '../../services/linkScanner.service.js';
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

  // 0. Phishing & Malicious Link Detection in Business Chat
  const linkThreats = await linkScannerService.scanMessageText(text);
  if (linkThreats.length > 0) {
    const t = linkThreats[0]!;
    const sender = msg.from?.first_name || 'ភ្ញៀវ';
    const senderHandle = msg.from?.username ? `@${msg.from.username}` : `ID: ${msg.from?.id || 'unknown'}`;

    logger.warn({ url: t.url, risk: t.riskLevel, from: msg.from?.id }, 'Phishing link detected in business chat');

    // Alert Admin (SOCHEAT) directly in Telegram PM so they do not open it!
    for (const adminId of env.ADMIN_IDS) {
      try {
        await ctx.api.sendMessage(
          adminId.toString(),
          `🚨 <b>ការព្រមាន PHISHING LINK ក្នុង BUSINESS CHAT!</b>\n\n` +
          `👤 <b>ភ្ញៀវផ្ញើ៖</b> ${sender} (${senderHandle})\n` +
          `🔗 <b>តំណភ្ជាប់គ្រោះថ្នាក់៖</b> <code>${t.url}</code>\n` +
          `🔴 <b>កម្រិតហានិភ័យ៖</b> <b>${t.riskLevel}</b>\n` +
          `🔍 <b>មូលហេតុ៖</b> ${t.detectionReason}\n\n` +
          `❌ <i>សូមកុំចុចបើកតំណភ្ជាប់នេះក្នុង Telegram របស់អ្នកឱ្យសោះ!</i>`,
          { parse_mode: 'HTML' }
        );
      } catch (adminErr) {
        logger.warn({ adminErr }, 'Failed to alert admin about business phishing link');
      }
    }

    // Archive to private channel
    await channelArchiveService.archiveSecurityThreat(ctx.api, {
      type: 'PHISHING_LINK',
      title: 'Business Chat Phishing Link',
      item: t.url,
      riskLevel: t.riskLevel,
      detectionReason: t.detectionReason || 'Phishing scam link sent via business chat',
      senderId: String(msg.from?.id || 'unknown'),
      chatId: String(msg.chat.id),
    });

    // Send safety reply to sender if replying is enabled
    try {
      await ctx.reply(
        `⚠️ <b>ប្រព័ន្ធសុវត្ថិភាពបានរកឃើញថា តំណភ្ជាប់ (Link) ដែលអ្នកបានផ្ញើមកអាចមានហានិភ័យ Phishing / Scam។</b>\nសូមកុំផ្ញើតំណភ្ជាប់មិនច្បាស់លាស់។`,
        {
          business_connection_id: msg.business_connection_id,
          reply_to_message_id: msg.message_id,
          parse_mode: 'HTML',
        }
      );
    } catch {
      // ignore reply error
    }
    return;
  }

  if (!env.AUTO_REPLY_ENABLED) return;

  // Do not reply to bots
  if (msg.from?.is_bot) return;

  // Do not reply to the business account owner's own messages sent to others
  if (msg.from && env.ADMIN_IDS.includes(BigInt(msg.from.id))) {
    return;
  }

  // 1. Try Gemini AI smart reply on behalf of SOCHEAT
  if (aiService.isAvailable() && env.AI_AUTO_REPLY_ENABLED) {
    try {
      const senderName = msg.from?.first_name || 'ភ្ញៀវ';
      const aiReply = await aiService.generateSmartAutoReply(text, senderName);
      if (aiReply) {
        await ctx.reply(aiReply, {
          business_connection_id: msg.business_connection_id,
          reply_to_message_id: msg.message_id,
          parse_mode: 'HTML',
        });
        auditLogger.autoReplySent(msg.chat.id, 'GEMINI_AI', 'BUSINESS_AI_GENERATED');
        return;
      }
    } catch (err) {
      logger.warn({ err }, 'Gemini AI business reply failed, falling back to standard auto-reply');
    }
  }

  // 2. Fallback to standard busy auto-reply
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
