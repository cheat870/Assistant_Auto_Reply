import type { AuditAction } from '@prisma/client';
import { prisma } from '../prisma.js';

export class AuditLogRepository {
  async log(params: {
    action: AuditAction;
    targetType: string;
    targetId?: string;
    adminTelegramId?: bigint | number | string | null;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.auditLog.create({
      data: {
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        adminTelegramId: params.adminTelegramId ? BigInt(params.adminTelegramId) : null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  }

  async getRecentLogs(limit = 20) {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const auditLogRepository = new AuditLogRepository();
