import { InlineKeyboard } from 'grammy';
import { t, type Locale } from '../../i18n/index.js';

export function getAdminPanelKeyboard(locale: Locale = 'km'): InlineKeyboard {
  return new InlineKeyboard()
    .text(t('panel_btn_pending', locale), 'admin:pending')
    .text(t('panel_btn_autoreply', locale), 'admin:autoreply')
    .row()
    .text(t('panel_btn_keywords', locale), 'admin:keywords')
    .text(t('panel_btn_protection', locale), 'admin:fileprotection')
    .row()
    .text(t('panel_btn_extensions', locale), 'admin:extensions')
    .text(t('panel_btn_stats', locale), 'admin:stats')
    .row()
    .text(t('panel_btn_settings', locale), 'admin:settings')
    .text(t('panel_btn_logs', locale), 'admin:logs')
    .row()
    .text(locale === 'km' ? '🗑️ សារដែលគេលុប' : '🗑️ Deleted Messages', 'admin:deleted');
}

export function getBackToAdminKeyboard(locale: Locale = 'km'): InlineKeyboard {
  return new InlineKeyboard().text(t('btn_back_admin', locale), 'admin:menu');
}

export function getLanguageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🇰🇭 ភាសាខ្មែរ (Khmer)', 'lang:set:km')
    .text('🇬🇧 English', 'lang:set:en');
}
