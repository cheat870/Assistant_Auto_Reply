import { getChatLanguage, t } from '../../i18n/index.js';
import type { BotContext } from '../../types/index.js';
import { getLanguageKeyboard } from '../keyboards/admin.keyboard.js';

export async function handleStartCommand(ctx: BotContext): Promise<void> {
  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);
  const isPrivileged = ctx.isAdmin;

  let text = `${t('welcome_title', locale)}\n\n`;
  text += `${t('welcome_features', locale)}\n\n`;
  text += `${t('welcome_help_hint', locale)}`;

  if (isPrivileged) {
    text += `\n\n${t('admin_detected', locale)}`;
  }

  await ctx.reply(text, { parse_mode: 'HTML' });
}

export async function handleHelpCommand(ctx: BotContext): Promise<void> {
  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);
  let text = `${t('help_title', locale)}\n\n`;
  text += `${t('help_user_commands', locale)}`;

  if (ctx.isAdmin) {
    text += `${t('help_admin_commands', locale)}`;
  }

  await ctx.reply(text, { parse_mode: 'HTML' });
}

export async function handleMenuCommand(ctx: BotContext): Promise<void> {
  await handleHelpCommand(ctx);
}

export async function handleLangCommand(ctx: BotContext): Promise<void> {
  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);
  await ctx.reply(t('lang_choose', locale), {
    parse_mode: 'HTML',
    reply_markup: getLanguageKeyboard(),
  });
}
