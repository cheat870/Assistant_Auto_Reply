import type { MatchType } from '@prisma/client';
import { getEnv } from '../config/env.js';
import { botSettingRepository } from '../database/repositories/botSetting.repository.js';
import { keywordRepository } from '../database/repositories/keyword.repository.js';

export const DEFAULT_BUSY_MESSAGE = 'សូមរង់ចាំការឆ្លើយតបពី SOCHEAT បន្តិច ពេលនេះគាត់កំពុងជាប់រវល់។';

export interface AutoReplyResult {
  reply: string;
  matchedKeyword: string;
  matchType: MatchType | 'BUSY_MODE' | 'FALLBACK';
}

export class AutoReplyService {
  /**
   * Checks whether automated replies in chats are enabled.
   * Defaults to false (Silent Mode) to avoid interrupting personal chats.
   */
  async isAutoReplyEnabled(): Promise<boolean> {
    try {
      const dbSetting = await botSettingRepository.getSetting('AUTO_REPLY_ENABLED');
      if (dbSetting !== null) {
        return dbSetting === 'true' || dbSetting === '1';
      }
    } catch {
      // In case DB call fails or uninitialized in unit test
    }
    try {
      const env = getEnv();
      return env.AUTO_REPLY_ENABLED;
    } catch {
      return false;
    }
  }

  async setAutoReplyEnabled(enabled: boolean): Promise<void> {
    await botSettingRepository.setSetting(
      'AUTO_REPLY_ENABLED',
      enabled ? 'true' : 'false',
      'Master switch for auto-replying in chats'
    );
  }

  /**
   * Matches an incoming user text against configured keywords or universal busy mode.
   * Priority:
   * 1. If AUTO_REPLY_ENABLED is false: returns null (Silent Mode).
   * 2. If BUSY_MODE is active: responds with busy reply for ALL incoming messages.
   * 3. Otherwise: matches configured keywords by priority (Highest first).
   * 4. Fallback: if no keyword matches, returns fallback reply if configured.
   */
  async findReply(text: string, chatDbId?: string | null): Promise<AutoReplyResult | null> {
    if (!text || typeof text !== 'string') return null;

    const isEnabled = await this.isAutoReplyEnabled();
    if (!isEnabled) return null;

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

