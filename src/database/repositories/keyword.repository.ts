import type { MatchType } from '@prisma/client';
import { prisma } from '../prisma.js';

export class KeywordRepository {
  async createKeyword(params: {
    keyword: string;
    reply: string;
    matchType?: MatchType;
    priority?: number;
    chatId?: string | null;
  }) {
    return prisma.keyword.create({
      data: {
        keyword: params.keyword.trim().toLowerCase(),
        reply: params.reply,
        matchType: params.matchType || 'CONTAINS',
        priority: params.priority ?? 10,
        chatId: params.chatId || null,
        enabled: true,
      },
    });
  }

  async deleteKeyword(id: string) {
    return prisma.keyword.delete({
      where: { id },
    });
  }

  async listKeywords(params?: { chatId?: string | null; limit?: number }) {
    return prisma.keyword.findMany({
      where: params?.chatId !== undefined ? { chatId: params.chatId } : undefined,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: params?.limit || 50,
    });
  }

  async getActiveKeywords(chatDbId?: string | null) {
    return prisma.keyword.findMany({
      where: {
        enabled: true,
        OR: [{ chatId: null }, chatDbId ? { chatId: chatDbId } : { chatId: null }],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async countKeywords(): Promise<number> {
    return prisma.keyword.count();
  }
}

export const keywordRepository = new KeywordRepository();
