import { InlineKeyboard } from 'grammy';
import { fileEventRepository } from '../../database/repositories/fileEvent.repository.js';
import { getChatLanguage, t, setChatLanguage, type Locale } from '../../i18n/index.js';
import { adminService } from '../../services/admin.service.js';
import { moderationService } from '../../services/moderation.service.js';
import type { BotContext } from '../../types/index.js';
import { getModerationKeyboard } from '../keyboards/moderation.keyboard.js';

export async function handleLanguageCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('lang:set:')) return;

  const locale = (data.replace('lang:set:', '') as Locale) || 'km';
  if (ctx.chat) {
    setChatLanguage(ctx.chat.id, locale);
  }

  const responseText = locale === 'km' ? t('lang_changed_km', 'km') : t('lang_changed_en', 'en');
  await ctx.answerCallbackQuery({ text: locale === 'km' ? 'ភាសាខ្មែរ' : 'English' });
  await ctx.editMessageText(responseText, { parse_mode: 'HTML' });
}

export async function handleModerationCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('mod:')) return;

  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);
  const adminId = ctx.from?.id;
  if (!adminId || !adminService.isAdmin(adminId)) {
    await ctx.answerCallbackQuery({
      text: t('mod_unauthorized', locale),
      show_alert: true,
    });
    return;
  }

  const parts = data.split(':');
  const action = parts[1];
  const fileEventId = parts[2];

  if (!fileEventId) {
    await ctx.answerCallbackQuery({ text: '⚠️ Invalid event ID', show_alert: true });
    return;
  }

  const adminHandle = ctx.from?.username ? `@${ctx.from.username}` : `Admin ${adminId}`;

  // View event details callback (from /pending list)
  if (action === 'view') {
    const event = await fileEventRepository.getFileEventById(fileEventId);
    if (!event) {
      await ctx.answerCallbackQuery({ text: '⚠️ Event not found', show_alert: true });
      return;
    }

    let text = `📄 <b>${t('alert_file_label', locale)} ${event.filename}</b>\n\n`;
    text += `👤 ${t('admin_user_label', locale)} <code>${event.userId}</code> | ${t('admin_chat_label', locale)} <code>${event.chatId}</code>\n`;
    text += `📦 ${t('admin_size_label', locale)} ${(Number(event.size) / (1024 * 1024)).toFixed(2)} MB\n`;
    text += `🧬 ${t('admin_filetype_label', locale)} ${event.fileType || 'Unknown'}\n`;
    text += `⚠️ ${t('alert_risk_label', locale)} <b>${event.riskLevel}</b>\n`;
    text += `🔐 SHA-256: <code>${event.sha256}</code>\n`;
    text += `⏳ <b>${t('admin_status_pending', locale)}</b>\n`;

    if (event.status === 'PENDING') {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: getModerationKeyboard(event.id, locale),
      });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML' });
    }
    await ctx.answerCallbackQuery();
    return;
  }

  if (action === 'del') {
    const res = await moderationService.deleteFile(fileEventId, BigInt(adminId), ctx.api);

    await ctx.answerCallbackQuery({
      text: res.alreadyReviewed ? t('mod_already_reviewed', locale) : res.message.substring(0, 150),
      show_alert: res.alreadyReviewed ?? false,
    });

    if (res.success && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
        await ctx.reply(`${t('mod_deleted_success', locale)} ${adminHandle}`, {
          reply_to_message_id: ctx.callbackQuery.message.message_id,
          parse_mode: 'HTML',
        });
      } catch {
        // ignore markup edit error
      }
    }
    return;
  }

  if (action === 'allow') {
    const res = await moderationService.allowFile(fileEventId, BigInt(adminId));

    await ctx.answerCallbackQuery({
      text: res.alreadyReviewed ? t('mod_already_reviewed', locale) : res.message.substring(0, 150),
      show_alert: res.alreadyReviewed ?? false,
    });

    if (res.success && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
        await ctx.reply(`${t('mod_allowed_success', locale)} ${adminHandle}`, {
          reply_to_message_id: ctx.callbackQuery.message.message_id,
          parse_mode: 'HTML',
        });
      } catch {
        // ignore markup edit error
      }
    }
    return;
  }

  if (action === 'ign') {
    const res = await moderationService.ignoreFile(fileEventId, BigInt(adminId));

    await ctx.answerCallbackQuery({
      text: res.alreadyReviewed ? t('mod_already_reviewed', locale) : res.message.substring(0, 150),
      show_alert: res.alreadyReviewed ?? false,
    });

    if (res.success && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
        await ctx.reply(`${t('mod_ignored_success', locale)} ${adminHandle}`, {
          reply_to_message_id: ctx.callbackQuery.message.message_id,
          parse_mode: 'HTML',
        });
      } catch {
        // ignore markup edit error
      }
    }
    return;
  }
}
