import type { MatchType } from '@prisma/client';
import { botSettingRepository } from '../database/repositories/botSetting.repository.js';
import { keywordRepository } from '../database/repositories/keyword.repository.js';

export const DEFAULT_BUSY_MESSAGE = 'BOT_Reply: សូមរងចាំការឆ្លើយ ពី SOCHEAT ពេលនេះគាត់កំពុងជាប់រវល់។';

export interface AutoReplyResult {
  reply: string;
  matchedKeyword: string;
  matchType: MatchType | 'BUSY_MODE' | 'FALLBACK';
}

export class AutoReplyService {
  /**
   * Matches an incoming user text against configured keywords or universal busy mode.
   * Priority:
   * 1. If BUSY_MODE is active: responds with busy reply for ALL incoming messages.
   * 2. Otherwise: matches configured keywords by priority (Highest first).
   * 3. Fallback: if no keyword matches, returns fallback reply if configured.
   */
  async findReply(text: string, chatDbId?: string | null): Promise<AutoReplyResult | null> {
    if (!text || typeof text !== 'string') return null;

    try {
      const busySetting = await botSettingRepository.getSetting('BUSY_MODE');
      if (busySetting === 'true' || busySetting === '1') {
        const busyText = await botSettingRepository.getSetting('BUSY_REPLY_TEXT');
        return {
          reply: busyText || DEFAULT_BUSY_MESSAGE,
          matchedKeyword: '*',
          matchType: 'BUSY_MODE',
        };
      }
    } catch {
      // In case DB call fails or uninitialized in unit test
    }

    const normalizedText = text.trim().toLowerCase();
    const keywords = await keywordRepository.getActiveKeywords(chatDbId);

    for (const item of keywords) {
      const kw = item.keyword.toLowerCase();
      let isMatch = false;

      switch (item.matchType) {
        case 'EXACT':
          isMatch = normalizedText === kw;
          break;
        case 'STARTS_WITH':
          isMatch = normalizedText.startsWith(kw);
          break;
        case 'CONTAINS':
        default:
          isMatch = normalizedText.includes(kw);
          break;
      }

      if (isMatch) {
        return {
          reply: item.reply,
          matchedKeyword: item.keyword,
          matchType: item.matchType,
        };
      }
    }

    try {
      const fallback = await botSettingRepository.getSetting('FALLBACK_REPLY_TEXT');
      if (fallback) {
        return {
          reply: fallback,
          matchedKeyword: '*',
          matchType: 'FALLBACK',
        };
      }
    } catch {
      // Ignore
    }

    return null;
  }

  async getBusyMode(): Promise<{ enabled: boolean; text: string }> {
    const enabledVal = await botSettingRepository.getSetting('BUSY_MODE');
    const textVal = await botSettingRepository.getSetting('BUSY_REPLY_TEXT');
    return {
      enabled: enabledVal === 'true' || enabledVal === '1',
      text: textVal || DEFAULT_BUSY_MESSAGE,
    };
  }

  async setBusyMode(enabled: boolean, text?: string): Promise<void> {
    await botSettingRepository.setSetting('BUSY_MODE', enabled ? 'true' : 'false', 'Enable universal busy auto-reply');
    if (text) {
      await botSettingRepository.setSetting('BUSY_REPLY_TEXT', text, 'Custom busy reply text');
    }
  }

  async setFallbackReply(text: string | null): Promise<void> {
    if (text) {
      await botSettingRepository.setSetting('FALLBACK_REPLY_TEXT', text, 'Fallback reply for unmatched text');
    } else {
      await botSettingRepository.setSetting('FALLBACK_REPLY_TEXT', '', 'Fallback reply');
    }
  }

  async addKeyword(params: {
    keyword: string;
    reply: string;
    matchType?: MatchType;
    priority?: number;
    chatId?: string | null;
  }) {
    return keywordRepository.createKeyword(params);
  }

  async removeKeyword(id: string) {
    return keywordRepository.deleteKeyword(id);
  }

  async listKeywords(chatId?: string | null) {
    return keywordRepository.listKeywords({ chatId });
  }
}

export const autoReplyService = new AutoReplyService();

