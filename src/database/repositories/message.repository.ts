import { prisma } from '../prisma.js';

export interface SaveMessageParams {
  telegramMessageId: number;
  chatId: string;
  userId: string;
  senderName?: string;
  senderUsername?: string;
  messageType: string;
  fullText?: string;
  mediaFileId?: string;
  autoReplied?: boolean;
}

export class MessageRepository {
  /**
   * Saves or updates an incoming message in the persistent archive.
   */
  async saveMessage(params: SaveMessageParams) {
    const textPreview = params.fullText ? params.fullText.substring(0, 200) : undefined;

    // Check if message already exists
    const existing = await prisma.messageEvent.findFirst({
      where: {
        chatId: params.chatId,
        telegramMessageId: params.telegramMessageId,
      },
    });

    if (existing) {
      return prisma.messageEvent.update({
        where: { id: existing.id },
        data: {
          fullText: params.fullText || existing.fullText,
          textPreview: textPreview || existing.textPreview,
          mediaFileId: params.mediaFileId || existing.mediaFileId,
          autoReplied: params.autoReplied ?? existing.autoReplied,
          senderName: params.senderName || existing.senderName,
          senderUsername: params.senderUsername || existing.senderUsername,
        },
      });
    }

    return prisma.messageEvent.create({
      data: {
        telegramMessageId: params.telegramMessageId,
        chatId: params.chatId,
        userId: params.userId,
        senderName: params.senderName,
        senderUsername: params.senderUsername,
        messageType: params.messageType,
        textPreview,
        fullText: params.fullText,
        mediaFileId: params.mediaFileId,
        autoReplied: params.autoReplied ?? false,
      },
    });
  }

  /**
   * Finds a message by chat ID and Telegram message ID.
   */
  async findMessage(chatId: string, telegramMessageId: number) {
    return prisma.messageEvent.findFirst({
      where: {
        chatId,
        telegramMessageId,
      },
    });
  }

  /**
   * Marks a message as deleted and logs the deletion timestamp.
   */
  async markDeleted(chatId: string, telegramMessageId: number) {
    const existing = await this.findMessage(chatId, telegramMessageId);
    if (!existing) {
      // If we didn't have the original text, still record the deletion stub
      return prisma.messageEvent.create({
        data: {
          chatId,
          telegramMessageId,
          userId: 'UNKNOWN',
          messageType: 'unknown',
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    }

    return prisma.messageEvent.update({
      where: { id: existing.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Marks a message as edited and logs the previous text.
   */
  async markEdited(chatId: string, telegramMessageId: number, newText: string) {
    const existing = await this.findMessage(chatId, telegramMessageId);
    if (!existing) {
      return null;
    }

    return prisma.messageEvent.update({
      where: { id: existing.id },
      data: {
        isEdited: true,
        editedAt: new Date(),
        originalText: existing.originalText || existing.fullText,
        fullText: newText,
        textPreview: newText.substring(0, 200),
      },
    });
  }

  /**
   * Retrieves recent deleted messages for admin audit.
   */
  async getRecentDeleted(limit: number = 10) {
    return prisma.messageEvent.findMany({
      where: {
        isDeleted: true,
      },
      orderBy: {
        deletedAt: 'desc',
      },
      take: limit,
    });
  }
}

export const messageRepository = new MessageRepository();
