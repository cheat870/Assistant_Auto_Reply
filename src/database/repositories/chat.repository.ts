import { prisma } from '../prisma.js';

export class ChatRepository {
  async upsertChat(params: {
    telegramChatId: bigint | number | string;
    type: string;
    title?: string;
    username?: string;
  }) {
    const chatId = BigInt(params.telegramChatId);
    return prisma.chat.upsert({
      where: { telegramChatId: chatId },
      create: {
        telegramChatId: chatId,
        type: params.type,
        title: params.title,
        username: params.username,
      },
      update: {
        type: params.type,
        title: params.title,
        username: params.username,
      },
    });
  }

  async getChatByTelegramId(telegramChatId: bigint | number | string) {
    return prisma.chat.findUnique({
      where: { telegramChatId: BigInt(telegramChatId) },
    });
  }

  async updateChatSettings(
    telegramChatId: bigint | number | string,
    settings: {
      autoReplyEnabled?: boolean;
      fileProtectionEnabled?: boolean;
      archiveScanningEnabled?: boolean;
      adminNotificationsEnabled?: boolean;
    }
  ) {
    return prisma.chat.update({
      where: { telegramChatId: BigInt(telegramChatId) },
      data: settings,
    });
  }

  async countChats(): Promise<number> {
    return prisma.chat.count();
  }
}

export const chatRepository = new ChatRepository();
