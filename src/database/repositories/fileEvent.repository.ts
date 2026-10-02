import type { ReviewStatus, RiskLevel, ScannerStatus } from '@prisma/client';
import { prisma } from '../prisma.js';

export interface CreateFileEventParams {
  chatId: string;
  chatDbId?: string;
  userId: string;
  userDbId?: string;
  messageId: number;
  filename: string;
  extension: string;
  mimeType?: string;
  size: number | bigint;
  sha256: string;
  fileType?: string;
  architecture?: string;
  digitalSignature?: string;
  riskLevel: RiskLevel;
  scannerStatus?: ScannerStatus;
  scannerResult?: string;
  indicators: string[];
  impactSummary: string[];
}

export class FileEventRepository {
  async createFileEvent(params: CreateFileEventParams) {
    return prisma.fileEvent.create({
      data: {
        chatId: params.chatId,
        chatDbId: params.chatDbId,
        userId: params.userId,
        userDbId: params.userDbId,
        messageId: params.messageId,
        filename: params.filename,
        extension: params.extension,
        mimeType: params.mimeType,
        size: BigInt(params.size),
        sha256: params.sha256,
        fileType: params.fileType,
        architecture: params.architecture,
        digitalSignature: params.digitalSignature,
        riskLevel: params.riskLevel,
        scannerStatus: params.scannerStatus || 'NOT_CONFIGURED',
        scannerResult: params.scannerResult,
        indicators: JSON.stringify(params.indicators),
        impactSummary: JSON.stringify(params.impactSummary),
        status: 'PENDING',
      },
    });
  }

  async getFileEventById(id: string) {
    return prisma.fileEvent.findUnique({
      where: { id },
    });
  }

  async setAdminAlertMessageId(id: string, adminAlertMessageId: number) {
    return prisma.fileEvent.update({
      where: { id },
      data: { adminAlertMessageId },
    });
  }

  /**
   * Atomically transitions a FileEvent from PENDING to a new status.
   * Returns true if status was updated, or false if already reviewed (prevents race condition).
   */
  async updateStatusIfPending(
    id: string,
    newStatus: ReviewStatus,
    reviewedBy: bigint,
    reviewNotes?: string
  ): Promise<boolean> {
    const result = await prisma.fileEvent.updateMany({
      where: {
        id,
        status: 'PENDING',
      },
      data: {
        status: newStatus,
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes,
      },
    });

    return result.count > 0;
  }

  async getPendingEvents(limit = 20) {
    return prisma.fileEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async countPendingEvents(): Promise<number> {
    return prisma.fileEvent.count({
      where: { status: 'PENDING' },
    });
  }

  async countTotalFiles(): Promise<number> {
    return prisma.fileEvent.count();
  }

  async countByStatus(status: ReviewStatus): Promise<number> {
    return prisma.fileEvent.count({
      where: { status },
    });
  }
}

export const fileEventRepository = new FileEventRepository();
