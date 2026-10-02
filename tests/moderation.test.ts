import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from 'grammy';
import { auditLogRepository } from '../src/database/repositories/auditLog.repository.js';
import { fileEventRepository } from '../src/database/repositories/fileEvent.repository.js';
import { adminService } from '../src/services/admin.service.js';
import { ModerationService } from '../src/services/moderation.service.js';

describe('Moderation Service Tests', () => {
  let moderation: ModerationService;
  let mockApi: Partial<Api>;
  const adminId = 123456789n;
  const unauthorizedUserId = 999999999n;

  beforeEach(() => {
    moderation = new ModerationService();
    vi.restoreAllMocks();

    mockApi = {
      deleteMessage: vi.fn().mockResolvedValue(true),
    };

    // Mock admin authorization
    vi.spyOn(adminService, 'isAdmin').mockImplementation(
      id => BigInt(id?.toString() || 0) === adminId
    );

    // Mock audit log repository
    vi.spyOn(auditLogRepository, 'log').mockResolvedValue({
      id: 'mock-audit-id',
      adminTelegramId: adminId,
      action: 'FILE_DELETED',
      targetType: 'FileEvent',
      targetId: 'evt-1',
      metadata: null,
      createdAt: new Date(),
    });
  });

  it('should reject unauthorized user attempting to delete, allow, or ignore', async () => {
    const delRes = await moderation.deleteFile('evt-1', unauthorizedUserId, mockApi as Api);
    expect(delRes.success).toBe(false);
    expect(delRes.message).toContain('Unauthorized');

    const allowRes = await moderation.allowFile('evt-1', unauthorizedUserId);
    expect(allowRes.success).toBe(false);
    expect(allowRes.message).toContain('Unauthorized');

    const ignRes = await moderation.ignoreFile('evt-1', unauthorizedUserId);
    expect(ignRes.success).toBe(false);
    expect(ignRes.message).toContain('Unauthorized');
  });

  it('should successfully DELETE a pending file event and call Telegram deleteMessage', async () => {
    vi.spyOn(fileEventRepository, 'getFileEventById').mockResolvedValue({
      id: 'evt-1',
      chatId: '-100123456789',
      userId: '456',
      messageId: 42,
      filename: 'setup.exe',
      extension: '.exe',
      mimeType: null,
      size: 1000n,
      sha256: 'abc123hash',
      fileType: 'PE',
      architecture: 'x64',
      digitalSignature: null,
      riskLevel: 'HIGH',
      scannerStatus: 'NOT_CONFIGURED',
      scannerResult: null,
      indicators: '[]',
      impactSummary: '[]',
      status: 'PENDING',
      adminAlertMessageId: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      chatDbId: null,
      userDbId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.spyOn(fileEventRepository, 'updateStatusIfPending').mockResolvedValue(true);

    const result = await moderation.deleteFile('evt-1', adminId, mockApi as Api);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Message deleted by administrator');
    expect(mockApi.deleteMessage).toHaveBeenCalledWith('-100123456789', 42);
  });

  it('should gracefully handle missing Telegram deleteMessage permissions', async () => {
    vi.spyOn(fileEventRepository, 'getFileEventById').mockResolvedValue({
      id: 'evt-1',
      chatId: '-100123456789',
      userId: '456',
      messageId: 42,
      filename: 'setup.exe',
      extension: '.exe',
      mimeType: null,
      size: 1000n,
      sha256: 'abc123hash',
      fileType: 'PE',
      architecture: 'x64',
      digitalSignature: null,
      riskLevel: 'HIGH',
      scannerStatus: 'NOT_CONFIGURED',
      scannerResult: null,
      indicators: '[]',
      impactSummary: '[]',
      status: 'PENDING',
      adminAlertMessageId: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      chatDbId: null,
      userDbId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.spyOn(fileEventRepository, 'updateStatusIfPending').mockResolvedValue(true);

    mockApi.deleteMessage = vi
      .fn()
      .mockRejectedValue(new Error("Bad Request: message can't be deleted"));

    const result = await moderation.deleteFile('evt-1', adminId, mockApi as Api);
    expect(result.success).toBe(true);
    expect(result.message).toContain('unable to delete the message on Telegram');
    expect(result.message).toContain('Bot does not have the required Telegram permission');
  });

  it('should prevent double action when file has already been reviewed', async () => {
    vi.spyOn(fileEventRepository, 'getFileEventById').mockResolvedValue({
      id: 'evt-1',
      chatId: '-100123456789',
      userId: '456',
      messageId: 42,
      filename: 'setup.exe',
      extension: '.exe',
      mimeType: null,
      size: 1000n,
      sha256: 'abc123hash',
      fileType: 'PE',
      architecture: 'x64',
      digitalSignature: null,
      riskLevel: 'HIGH',
      scannerStatus: 'NOT_CONFIGURED',
      scannerResult: null,
      indicators: '[]',
      impactSummary: '[]',
      status: 'APPROVED', // Already approved!
      adminAlertMessageId: null,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      reviewNotes: null,
      chatDbId: null,
      userDbId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await moderation.deleteFile('evt-1', adminId, mockApi as Api);
    expect(result.success).toBe(false);
    expect(result.alreadyReviewed).toBe(true);
    expect(result.message).toBe('⚠️ This file has already been reviewed.');
    expect(mockApi.deleteMessage).not.toHaveBeenCalled();
  });

  it('should successfully ALLOW a file and keep original message', async () => {
    vi.spyOn(fileEventRepository, 'getFileEventById').mockResolvedValue({
      id: 'evt-1',
      chatId: '-100123456789',
      userId: '456',
      messageId: 42,
      filename: 'setup.exe',
      extension: '.exe',
      mimeType: null,
      size: 1000n,
      sha256: 'abc123hash',
      fileType: 'PE',
      architecture: 'x64',
      digitalSignature: null,
      riskLevel: 'HIGH',
      scannerStatus: 'NOT_CONFIGURED',
      scannerResult: null,
      indicators: '[]',
      impactSummary: '[]',
      status: 'PENDING',
      adminAlertMessageId: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      chatDbId: null,
      userDbId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.spyOn(fileEventRepository, 'updateStatusIfPending').mockResolvedValue(true);

    const result = await moderation.allowFile('evt-1', adminId);
    expect(result.success).toBe(true);
    expect(result.message).toContain('File approved by administrator');
  });

  it('should successfully IGNORE a review without destructive action', async () => {
    vi.spyOn(fileEventRepository, 'getFileEventById').mockResolvedValue({
      id: 'evt-1',
      chatId: '-100123456789',
      userId: '456',
      messageId: 42,
      filename: 'setup.exe',
      extension: '.exe',
      mimeType: null,
      size: 1000n,
      sha256: 'abc123hash',
      fileType: 'PE',
      architecture: 'x64',
      digitalSignature: null,
      riskLevel: 'HIGH',
      scannerStatus: 'NOT_CONFIGURED',
      scannerResult: null,
      indicators: '[]',
      impactSummary: '[]',
      status: 'PENDING',
      adminAlertMessageId: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      chatDbId: null,
      userDbId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.spyOn(fileEventRepository, 'updateStatusIfPending').mockResolvedValue(true);

    const result = await moderation.ignoreFile('evt-1', adminId);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Review ignored. No destructive action was taken.');
  });
});
