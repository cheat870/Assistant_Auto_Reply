import { InlineKeyboard } from 'grammy';
import { t, type Locale } from '../../i18n/index.js';

export function getModerationKeyboard(fileEventId: string, locale: Locale = 'km'): InlineKeyboard {
  return new InlineKeyboard()
    .text(t('btn_delete', locale), `mod:del:${fileEventId}`)
    .text(t('btn_allow', locale), `mod:allow:${fileEventId}`)
    .text(t('btn_ignore', locale), `mod:ign:${fileEventId}`);
}
