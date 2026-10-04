import { beforeEach, describe, expect, it, vi } from 'vitest';
import { botSettingRepository } from '../src/database/repositories/botSetting.repository.js';
import { keywordRepository } from '../src/database/repositories/keyword.repository.js';
import { AutoReplyService, DEFAULT_BUSY_MESSAGE } from '../src/services/autoReply.service.js';

describe('AutoReplyService Tests', () => {
  let service: AutoReplyService;

  beforeEach(() => {
    service = new AutoReplyService();
    vi.restoreAllMocks();
    vi.spyOn(botSettingRepository, 'getSetting').mockResolvedValue(null);
  });

  it('should match EXACT keywords case-insensitively', async () => {
    vi.spyOn(keywordRepository, 'getActiveKeywords').mockResolvedValue([
      {
        id: '1',
        keyword: 'hello',
        reply: '👋 Hello! How can I help you?',
        matchType: 'EXACT',
        priority: 10,
        chatId: null,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await service.findReply('HELLO');
    expect(result).not.toBeNull();
    expect(result?.reply).toBe('👋 Hello! How can I help you?');
    expect(result?.matchType).toBe('EXACT');

    const noMatch = await service.findReply('hello there');
    expect(noMatch).toBeNull();
  });

  it('should match CONTAINS keywords anywhere in text', async () => {
    vi.spyOn(keywordRepository, 'getActiveKeywords').mockResolvedValue([
      {
        id: '2',
        keyword: 'price',
        reply: '💰 Please send the product name and I will help you check the price.',
        matchType: 'CONTAINS',
        priority: 10,
        chatId: null,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await service.findReply('Can you tell me the price of this item?');
    expect(result).not.toBeNull();
    expect(result?.reply).toContain('check the price');
  });

  it('should match STARTS_WITH keywords', async () => {
    vi.spyOn(keywordRepository, 'getActiveKeywords').mockResolvedValue([
      {
        id: '3',
        keyword: 'order status',
        reply: '📦 Tracking your order...',
        matchType: 'STARTS_WITH',
        priority: 10,
        chatId: null,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const match = await service.findReply('order status 12345');
    expect(match).not.toBeNull();
    expect(match?.reply).toBe('📦 Tracking your order...');

    const noMatch = await service.findReply('check order status 12345');
    expect(noMatch).toBeNull();
  });

  it('should prioritize higher priority keywords first', async () => {
    vi.spyOn(keywordRepository, 'getActiveKeywords').mockResolvedValue([
      {
        id: '10',
        keyword: 'help',
        reply: 'High Priority Help Reply',
        matchType: 'CONTAINS',
        priority: 50,
        chatId: null,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '11',
        keyword: 'help',
        reply: 'Low Priority Help Reply',
        matchType: 'CONTAINS',
        priority: 5,
        chatId: null,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await service.findReply('I need help please');
    expect(result?.reply).toBe('High Priority Help Reply');
  });

  it('should return universal busy reply for any text when BUSY_MODE is active', async () => {
    vi.spyOn(botSettingRepository, 'getSetting').mockImplementation(async key => {
      if (key === 'BUSY_MODE') return 'true';
      if (key === 'BUSY_REPLY_TEXT')
        return 'សូមរង់ចាំការឆ្លើយតបពី SOCHEAT បន្តិច ពេលនេះគាត់កំពុងជាប់រវល់។';
      return null;
    });

    const anyText = await service.findReply('hi bro are you there?');
    expect(anyText).not.toBeNull();
    expect(anyText?.reply).toBe(
      'សូមរង់ចាំការឆ្លើយតបពី SOCHEAT បន្តិច ពេលនេះគាត់កំពុងជាប់រវល់។'
    );
    expect(anyText?.matchType).toBe('BUSY_MODE');

    const randomChars = await service.findReply('asdfghjkl12345');
    expect(randomChars?.reply).toBe(
      'សូមរង់ចាំការឆ្លើយតបពី SOCHEAT បន្តិច ពេលនេះគាត់កំពុងជាប់រវល់។'
    );
  });

  it('should return fallback reply when no keyword matches and fallback is configured', async () => {
    vi.spyOn(botSettingRepository, 'getSetting').mockImplementation(async key => {
      if (key === 'BUSY_MODE') return 'false';
      if (key === 'FALLBACK_REPLY_TEXT') return 'Custom fallback response';
      return null;
    });
    vi.spyOn(keywordRepository, 'getActiveKeywords').mockResolvedValue([]);

    const result = await service.findReply('unrecognized input');
    expect(result).not.toBeNull();
    expect(result?.reply).toBe('Custom fallback response');
    expect(result?.matchType).toBe('FALLBACK');
  });
});
