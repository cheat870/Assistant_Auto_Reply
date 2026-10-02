import { getEnv } from '../config/env.js';
import { auditLogRepository } from '../database/repositories/auditLog.repository.js';
import { blockedExtensionRepository } from '../database/repositories/blockedExtension.repository.js';
import { chatRepository } from '../database/repositories/chat.repository.js';
import { fileEventRepository } from '../database/repositories/fileEvent.repository.js';
import { userRepository } from '../database/repositories/user.repository.js';
import type { UserStats } from '../types/index.js';

export class AdminService {
  /**
   * Verifies if a Telegram user ID is an authorized administrator.
   * Authorization MUST NEVER rely only on username.
   */
  isAdmin(telegramId: bigint | number | string | undefined): boolean {
    if (!telegramId) return false;
    const adminIds = getEnv().ADMIN_IDS;
    const targetBigInt = BigInt(telegramId);
    return adminIds.some(adminId => adminId === targetBigInt);
  }

  async getStatistics(): Promise<UserStats> {
    const [
      usersCount,
      messagesCount,
      filesAnalyzedCount,
      pendingReviewsCount,
      deletedByAdminCount,
      approvedCount,
      ignoredCount,
      autoRepliesCount,
      chatsCount,
    ] = await Promise.all([
      userRepository.countUsers(),
      userRepository.countMessages(),
      fileEventRepository.countTotalFiles(),
      fileEventRepository.countPendingEvents(),
      fileEventRepository.countByStatus('DELETED'),
      fileEventRepository.countByStatus('APPROVED'),
      fileEventRepository.countByStatus('IGNORED'),
      userRepository.countAutoReplies(),
      chatRepository.countChats(),
    ]);

    return {
      usersCount,
      messagesCount,
      filesAnalyzedCount,
      pendingReviewsCount,
      deletedByAdminCount,
      approvedCount,
      ignoredCount,
      autoRepliesCount,
      chatsCount,
    };
  }

  formatStatsMessage(stats: UserStats): string {
    return (
      `📊 <b>BOT STATISTICS</b>\n\n` +
      `👤 <b>Users:</b> ${stats.usersCount.toLocaleString()}\n` +
      `💬 <b>Messages:</b> ${stats.messagesCount.toLocaleString()}\n\n` +
      `🔍 <b>Files Analyzed:</b> ${stats.filesAnalyzedCount.toLocaleString()}\n` +
      `🚨 <b>Pending Reviews:</b> ${stats.pendingReviewsCount.toLocaleString()}\n\n` +
      `🗑 <b>Deleted by Admin:</b> ${stats.deletedByAdminCount.toLocaleString()}\n` +
      `✅ <b>Approved:</b> ${stats.approvedCount.toLocaleString()}\n` +
      `❌ <b>Ignored:</b> ${stats.ignoredCount.toLocaleString()}\n\n` +
      `🤖 <b>Auto Replies:</b> ${stats.autoRepliesCount.toLocaleString()}\n` +
      `👥 <b>Chats:</b> ${stats.chatsCount.toLocaleString()}`
    );
  }

  async getPendingReviews(limit = 20) {
    return fileEventRepository.getPendingEvents(limit);
  }

  async getBlockedExtensions() {
    return blockedExtensionRepository.getAllBlockedExtensions();
  }

  async addBlockedExtension(ext: string, description?: string) {
    return blockedExtensionRepository.addExtension(ext, description);
  }

  async removeBlockedExtension(ext: string) {
    return blockedExtensionRepository.removeExtension(ext);
  }

  async getRecentLogs(limit = 15) {
    return auditLogRepository.getRecentLogs(limit);
  }
}

export const adminService = new AdminService();
