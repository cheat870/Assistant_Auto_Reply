import type { MatchType } from '@prisma/client';
import { autoReplyService } from '../../services/autoReply.service.js';
import type { BotContext } from '../../types/index.js';
import { auditLogRepository } from '../../database/repositories/auditLog.repository.js';

export async function handleKeywordsCommand(ctx: BotContext): Promise<void> {
  const keywords = await autoReplyService.listKeywords();

  if (keywords.length === 0) {
    await ctx.reply(
      `🔑 <b>Auto-Reply Keywords</b>\n\nNo keywords configured yet.\n\nUse:\n<code>/addkeyword &lt;keyword&gt; | &lt;reply&gt; | [matchType] | [priority]</code>\n\nExample:\n<code>/addkeyword hello | 👋 Hello! How can I help you? | CONTAINS | 10</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  let text = `🔑 <b>CONFIGURED AUTO-REPLY KEYWORDS (${keywords.length})</b>\n\n`;
  keywords.forEach((kw, index) => {
    text += `<b>${index + 1}.</b> <code>${kw.keyword}</code> [${kw.matchType}] (Priority: ${kw.priority})\n`;
    text += `   ↳ Reply: <i>${kw.reply.substring(0, 40)}${kw.reply.length > 40 ? '...' : ''}</i>\n`;
    text += `   ↳ ID: <code>${kw.id}</code>\n\n`;
  });

  text += `To delete: <code>/delkeyword &lt;id&gt;</code>`;

  await ctx.reply(text, { parse_mode: 'HTML' });
}

export async function handleAddKeywordCommand(ctx: BotContext): Promise<void> {
  const rawText = ctx.message?.text || '';
  // Extract arguments after /addkeyword or /addreply
  const args = rawText.replace(/^\/(?:addkeyword|addreply)(?:@\w+)?\s*/i, '').trim();

  if (!args || !args.includes('|')) {
    await ctx.reply(
      `ℹ️ <b>Usage:</b>\n<code>/addkeyword &lt;keyword&gt; | &lt;reply&gt; | [matchType] | [priority]</code>\n\n` +
        `<b>Match Types:</b> EXACT, CONTAINS (default), STARTS_WITH\n` +
        `<b>Priority:</b> integer (default 10)\n\n` +
        `<b>Examples:</b>\n` +
        `<code>/addkeyword hello | 👋 Hello! How can I help you?</code>\n` +
        `<code>/addkeyword price | 💰 Send product name to check price. | CONTAINS | 20</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const parts = args.split('|').map(p => p.trim());
  const keyword = parts[0] || '';
  const reply = parts[1] || '';
  let matchType: MatchType = 'CONTAINS';
  let priority = 10;

  if (parts[2]) {
    const mt = parts[2].toUpperCase();
    if (mt === 'EXACT' || mt === 'CONTAINS' || mt === 'STARTS_WITH') {
      matchType = mt;
    }
  }

  if (parts[3]) {
    const p = parseInt(parts[3], 10);
    if (!isNaN(p)) priority = p;
  }

  if (!keyword || !reply) {
    await ctx.reply('⚠️ Keyword and reply content cannot be empty.');
    return;
  }

  const created = await autoReplyService.addKeyword({
    keyword,
    reply,
    matchType,
    priority,
  });

  if (ctx.from) {
    await auditLogRepository.log({
      action: 'KEYWORD_CREATED',
      targetType: 'Keyword',
      targetId: created.id,
      adminTelegramId: ctx.from.id,
      metadata: { keyword, matchType, priority },
    });
  }

  await ctx.reply(
    `✅ <b>Keyword Added Successfully</b>\n\n` +
      `• <b>Keyword:</b> <code>${created.keyword}</code>\n` +
      `• <b>Match Type:</b> ${created.matchType}\n` +
      `• <b>Priority:</b> ${created.priority}\n` +
      `• <b>ID:</b> <code>${created.id}</code>`,
    { parse_mode: 'HTML' }
  );
}

export async function handleDelKeywordCommand(ctx: BotContext): Promise<void> {
  const rawText = ctx.message?.text || '';
  const id = rawText.replace(/^\/(?:delkeyword|delreply)(?:@\w+)?\s*/i, '').trim();

  if (!id) {
    await ctx.reply('ℹ️ <b>Usage:</b> <code>/delkeyword &lt;keyword_id&gt;</code>', {
      parse_mode: 'HTML',
    });
    return;
  }

  try {
    await autoReplyService.removeKeyword(id);

    if (ctx.from) {
      await auditLogRepository.log({
        action: 'KEYWORD_DELETED',
        targetType: 'Keyword',
        targetId: id,
        adminTelegramId: ctx.from.id,
      });
    }

    await ctx.reply(`✅ Keyword <code>${id}</code> deleted successfully.`, { parse_mode: 'HTML' });
  } catch {
    await ctx.reply(`⚠️ Could not find or delete keyword with ID <code>${id}</code>.`, {
      parse_mode: 'HTML',
    });
  }
}
