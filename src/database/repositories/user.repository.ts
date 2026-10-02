import { prisma } from '../prisma.js';

export class UserRepository {
  async upsertUser(params: {
    telegramId: bigint | number | string;
    username?: string;
    firstName?: string;
    lastName?: string;
    isBot?: boolean;
  }) {
    const id = BigInt(params.telegramId);
    return prisma.user.upsert({
      where: { telegramId: id },
      create: {
        telegramId: id,
        username: params.username,
        firstName: params.firstName,
        lastName: params.lastName,
        isBot: params.isBot ?? false,
      },
      update: {
        username: params.username,
        firstName: params.firstName,
        lastName: params.lastName,
      },
    });
  }

  async countUsers(): Promise<number> {
    return prisma.user.count();
  }

  async recordMessage(params: {
    telegramMessageId: number;
    chatId: string;
    userId: string;
    messageType: string;
    textPreview?: string;
    autoReplied?: boolean;
  }) {
    return prisma.messageEvent.create({
      data: {
        telegramMessageId: params.telegramMessageId,
        chatId: params.chatId,
        userId: params.userId,
        messageType: params.messageType,
        textPreview: params.textPreview?.substring(0, 200),
        autoReplied: params.autoReplied ?? false,
      },
    });
  }

  async countMessages(): Promise<number> {
    return prisma.messageEvent.count();
  }

  async countAutoReplies(): Promise<number> {
    return prisma.messageEvent.count({
      where: { autoReplied: true },
    });
  }
}

export const userRepository = new UserRepository();
