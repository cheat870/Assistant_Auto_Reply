import { auditLogRepository } from '../../database/repositories/auditLog.repository.js';
import { adminService } from '../../services/admin.service.js';
import type { BotContext } from '../../types/index.js';
import { normalizeExtension } from '../../utils/extension.js';

export async function handleBlockedCommand(ctx: BotContext): Promise<void> {
  const extensions = await adminService.getBlockedExtensions();

  let text = `🛡️ <b>CENTRALIZED BLOCKED / REVIEW EXTENSIONS (${extensions.length})</b>\n\n`;
  text += `These file types trigger automatic static analysis and admin review when uploaded:\n\n`;

  const enabledList = extensions.filter(e => e.enabled);
  const extNames = enabledList.map(e => `<code>${e.extension}</code>`).join(', ');

  text += extNames || 'No extensions currently configured.';
  text += `\n\nCommands:\n• <code>/addblocked &lt;.ext&gt; [description]</code>\n• <code>/delblocked &lt;.ext&gt;</code>`;

  await ctx.reply(text, { parse_mode: 'HTML' });
}

export async function handleAddBlockedCommand(ctx: BotContext): Promise<void> {
  const rawText = ctx.message?.text || '';
  const args = rawText.replace(/^\/addblocked(?:@\w+)?\s*/i, '').trim();

  if (!args) {
    await ctx.reply('ℹ️ <b>Usage:</b> <code>/addblocked &lt;.extension&gt; [description]</code>', {
      parse_mode: 'HTML',
    });
    return;
  }

  const [rawExt, ...descParts] = args.split(/\s+/);
  const normalized = normalizeExtension(rawExt || '');
  const description = descParts.join(' ') || undefined;

  const added = await adminService.addBlockedExtension(normalized, description);

  if (ctx.from) {
    await auditLogRepository.log({
      action: 'EXTENSION_ADDED',
      targetType: 'BlockedExtension',
      targetId: added.id,
      adminTelegramId: ctx.from.id,
      metadata: { extension: normalized, description },
    });
  }

  await ctx.reply(`✅ Extension <code>${normalized}</code> added to security review policy.`, {
    parse_mode: 'HTML',
  });
}

export async function handleDelBlockedCommand(ctx: BotContext): Promise<void> {
  const rawText = ctx.message?.text || '';
  const args = rawText.replace(/^\/delblocked(?:@\w+)?\s*/i, '').trim();

  if (!args) {
    await ctx.reply('ℹ️ <b>Usage:</b> <code>/delblocked &lt;.extension&gt;</code>', {
      parse_mode: 'HTML',
    });
    return;
  }

  const normalized = normalizeExtension(args.split(/\s+/)[0] || '');

  try {
    await adminService.removeBlockedExtension(normalized);

    if (ctx.from) {
      await auditLogRepository.log({
        action: 'EXTENSION_REMOVED',
        targetType: 'BlockedExtension',
        targetId: normalized,
        adminTelegramId: ctx.from.id,
      });
    }

    await ctx.reply(`✅ Extension <code>${normalized}</code> removed from blocked list.`, {
      parse_mode: 'HTML',
    });
  } catch {
    await ctx.reply(`⚠️ Could not find or remove extension <code>${normalized}</code>.`, {
      parse_mode: 'HTML',
    });
  }
}
