import type { RiskLevel } from '../types/index.js';
import { en } from './locales/en.js';
import { km } from './locales/km.js';

export type Locale = 'km' | 'en';
export type TranslationKey = keyof typeof km;

const translations: Record<Locale, Record<string, string>> = {
  km,
  en,
};

// In-memory chat language cache (persists during runtime, default is 'km')
const chatLanguages = new Map<string, Locale>();

export function setChatLanguage(chatId: string | number, locale: Locale): void {
  chatLanguages.set(chatId.toString(), locale);
}

export function getChatLanguage(chatId?: string | number, userLangCode?: string): Locale {
  if (chatId && chatLanguages.has(chatId.toString())) {
    return chatLanguages.get(chatId.toString())!;
  }
  // If user Telegram client is English, or if explicit
  if (userLangCode && userLangCode.startsWith('en')) {
    return 'en';
  }
  // Default to Khmer as requested
  return 'km';
}

export function t(key: TranslationKey, locale: Locale = 'km'): string {
  const dict = translations[locale] || translations.km;
  return dict[key] || translations.km[key] || key;
}

export function getLocalizedRiskLabel(risk: RiskLevel, locale: Locale = 'km'): string {
  const dict = translations[locale] || translations.km;
  switch (risk) {
    case 'CRITICAL':
      return dict.risk_critical || '🔴 CRITICAL';
    case 'HIGH':
      return dict.risk_high || '🔴 HIGH';
    case 'MEDIUM':
      return dict.risk_medium || '🟡 MEDIUM';
    case 'LOW':
      return dict.risk_low || '🟢 LOW';
    case 'UNKNOWN':
    default:
      return dict.risk_unknown || '⚪ UNKNOWN';
  }
}
