import { getEnv } from '../../config/env.js';
import { aiService } from '../../services/ai.service.js';
import { autoReplyService } from '../../services/autoReply.service.js';
import { channelArchiveService } from '../../services/channelArchive.service.js';
import { linkScannerService } from '../../services/linkScanner.service.js';
import type { BotContext } from '../../types/index.js';
import { auditLogger, logger } from '../../utils/logger.js';

export async function handleTextMessage(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text || ctx.message?.caption;
  if (!text) return;

  // Ignore bot commands
  if (text.startsWith('/')) return;

  // 0. Phishing & Malicious Link Detection
  const linkThreats = await linkScannerService.scanMessageText(text);
  if (linkThreats.length > 0) {
    const t = linkThreats[0]!;
    const warning = [
      `🚨 <b>ការព្រមានសុវត្ថិភាពតំណភ្ជាប់ (PHISHING / MALICIOUS LINK ALERT)</b>`,
      ``,
      `⚠️ <b>រកឃើញតំណភ្ជាប់គ្រោះថ្នាក់៖</b> <code>${t.url}</code>`,
      `🔴 <b>កម្រិតហានិភ័យ៖</b> <b>${t.riskLevel}</b>`,
      `🔍 <b>មូលហេតុ៖</b> ${t.detectionReason}`,
      ``,
      `❌ <b>សូមកុំចុចបើក (Don't Click) ឬបញ្ចូលលេខសម្ងាត់/Login Token របស់អ្នកជាដាច់ខាត!</b>`,
    ].join('\n');

    await ctx.reply(warning, {
      reply_to_message_id: ctx.message?.message_id,
      parse_mode: 'HTML',
    });

    if (ctx.chat) {
      await channelArchiveService.archiveSecurityThreat(ctx.api, {
        type: 'PHISHING_LINK',
        title: 'Phishing Link Detected',
        item: t.url,
        riskLevel: t.riskLevel,
        detectionReason: t.detectionReason || 'Phishing scam',
        senderId: String(ctx.from?.id || 'unknown'),
        chatId: String(ctx.chat.id),
      });
    }
    return;
  }

  const env = getEnv();
  if (!env.AUTO_REPLY_ENABLED) return;

  // 1. Try Smart AI Auto-Reply with Google Gemini if configured
  if (aiService.isAvailable() && env.AI_AUTO_REPLY_ENABLED) {
    try {
      const senderName = ctx.from?.first_name || 'ភ្ញៀវ';
      const aiReply = await aiService.generateSmartAutoReply(text, senderName);
      if (aiReply) {
        await ctx.reply(aiReply, {
          reply_to_message_id: ctx.message?.message_id,
          parse_mode: 'HTML',
        });
        if (ctx.chat) {
          auditLogger.autoReplySent(ctx.chat.id, 'GEMINI_AI', 'AI_GENERATED');
        }
        return;
      }
    } catch (err) {
      logger.warn({ err }, 'Gemini AI reply failed, falling back to standard auto-reply');
    }
  }

  // 2. Standard Busy Mode or Keyword matching
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
