import type { Api } from 'grammy';
import { getEnv } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { channelArchiveService } from './channelArchive.service.js';
import { logger } from '../utils/logger.js';

export interface DailyReportStats {
  dateString: string;
  messagesToday: number;
  activeUsersCount: number;
  newUsersCount: number;
  deletedToday: number;
  threatsToday: number;
  autoRepliesToday: number;
  activeUserNames: string[];
}

export class DailyReportService {
  private lastReportDateKey: string = '';
  private schedulerTimer: NodeJS.Timeout | null = null;
  private intervalCheck: NodeJS.Timeout | null = null;

  /**
   * Returns the start of today (00:00:00) in Cambodia Time (UTC+7) converted to UTC Date.
   */
  getStartOfTodayInUtc(): { startOfTodayUtc: Date; dateFormatted: string; dateKey: string } {
    const now = new Date();
    // UTC milliseconds
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    // Current ICT date (UTC+7)
    const ictDate = new Date(utcMs + 7 * 3600000);
    
    const year = ictDate.getFullYear();
    const month = String(ictDate.getMonth() + 1).padStart(2, '0');
    const day = String(ictDate.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    const dateFormatted = `${day}/${month}/${year}`;

    // 00:00:00 ICT converted back to UTC
    const startOfTodayIctMs = new Date(year, ictDate.getMonth(), ictDate.getDate(), 0, 0, 0, 0).getTime();
    const startOfTodayUtc = new Date(startOfTodayIctMs - 7 * 3600000);

    return { startOfTodayUtc, dateFormatted, dateKey };
  }

  /**
   * Aggregates statistics for the current day in Cambodia time.
   */
  async getDailyStatistics(): Promise<DailyReportStats> {
    const { startOfTodayUtc, dateFormatted } = this.getStartOfTodayInUtc();

    try {
      // 1. Messages today
      const messagesToday = await prisma.messageEvent.count({
        where: { createdAt: { gte: startOfTodayUtc } },
      });

      // 2. Active users who sent messages today
      const activeGroups = await prisma.messageEvent.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: startOfTodayUtc } },
      });
      const activeUsersCount = activeGroups.length;

      // 3. New users registered today
      const newUsersCount = await prisma.user.count({
        where: { createdAt: { gte: startOfTodayUtc } },
      });

      // 4. Deleted messages today
      const deletedToday = await prisma.messageEvent.count({
        where: {
          isDeleted: true,
          deletedAt: { gte: startOfTodayUtc },
        },
      });

      // 5. Security events / threats today
      const threatsToday = await prisma.fileEvent.count({
        where: { createdAt: { gte: startOfTodayUtc } },
      });

      // 6. Auto-replies sent today
      const autoRepliesToday = await prisma.messageEvent.count({
        where: {
          autoReplied: true,
          createdAt: { gte: startOfTodayUtc },
        },
      });

      // 7. Get names of active users today (up to 5)
      const userIds = activeGroups.map(g => g.userId);
      const activeUsers = await prisma.user.findMany({
        where: {
          telegramId: { in: userIds.map(id => BigInt(id)) },
        },
        take: 5,
      });

      const activeUserNames = activeUsers.map(u => {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Anonymous';
        return u.username ? `${name} (@${u.username})` : name;
      });

      return {
        dateString: dateFormatted,
        messagesToday,
        activeUsersCount,
        newUsersCount,
        deletedToday,
        threatsToday,
        autoRepliesToday,
        activeUserNames,
      };
    } catch (err) {
      logger.error({ err }, 'Error collecting daily report statistics');
      return {
        dateString: dateFormatted,
        messagesToday: 0,
        activeUsersCount: 0,
        newUsersCount: 0,
        deletedToday: 0,
        threatsToday: 0,
        autoRepliesToday: 0,
        activeUserNames: [],
      };
    }
  }

  /**
   * Formats the daily digest report in polite, clean Cambodian Khmer.
   */
  formatDailyReportMessage(stats: DailyReportStats): string {
    const userNamesPreview =
      stats.activeUserNames.length > 0
        ? `\n   <i>(រួមមាន៖ ${stats.activeUserNames.join(', ')})</i>`
        : '';

    return [
      `📊 <b>[របាយការណ៍សង្ខេបប្រចាំថ្ងៃ - DAILY DIGEST]</b>`,
      `📅 <b>កាលបរិច្ឆេទ៖</b> <code>${stats.dateString}</code> (ម៉ោង 8:00 យប់)`,
      ``,
      `👤 <b>មនុស្សដែលបានឆាតមកថ្ងៃនេះ៖</b> <b>${stats.activeUsersCount}</b> នាក់ (ថ្មី: ${stats.newUsersCount} នាក់)${userNamesPreview}`,
      `💬 <b>សារដែលទទួលបានសរុប៖</b> <b>${stats.messagesToday}</b> សារ`,
      `🤖 <b>ឆ្លើយតបស្វ័យប្រវត្តិ៖</b> <b>${stats.autoRepliesToday}</b> ដង`,
      ``,
      `🗑️ <b>សារដែលគេបានលុប (រក្សាទុកបាន)៖</b> <b>${stats.deletedToday}</b> សារ`,
      `🚨 <b>ការព្រមានសុវត្ថិភាព (មេរោគ/Links)៖</b> <b>${stats.threatsToday}</b> ករណី`,
      ``,
      `🌐 <i>លោកអ្នកអាចចូលមើលព័ត៌មានលម្អិត ឬ Export ជា CSV តាមរយៈ Web Dashboard៖</i>`,
      `👉 <a href="https://assistant-auto-reply.onrender.com/dashboard">បើកមើល Dashboard</a>`,
    ].join('\n');
  }

  /**
   * Sends the daily report to Telegram Admins and to the Private Archive Channel.
   */
  async sendDailyReport(botApi: Api): Promise<void> {
    const stats = await this.getDailyStatistics();
    const reportText = this.formatDailyReportMessage(stats);
    const env = getEnv();

    // 1. Send to Admins directly
    for (const adminId of env.ADMIN_IDS) {
      try {
        await botApi.sendMessage(adminId.toString(), reportText, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        logger.warn({ err, adminId }, 'Failed to deliver daily report to admin');
      }
    }

    // 2. Also forward to the Private Archive Channel if configured
    const channelId = await channelArchiveService.getChannelId();
    if (channelId) {
      try {
        await botApi.sendMessage(channelId, reportText, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        logger.warn({ err, channelId }, 'Failed to deliver daily report to archive channel');
      }
    }

    const { dateKey } = this.getStartOfTodayInUtc();
    this.lastReportDateKey = dateKey;
    logger.info({ dateKey, messagesToday: stats.messagesToday }, 'Daily report dispatched successfully');
  }

  /**
   * Initializes the 8:00 PM (20:00 ICT) scheduler.
   */
  startDailyScheduler(botApi: Api): void {
    if (this.schedulerTimer) clearTimeout(this.schedulerTimer);
    if (this.intervalCheck) clearInterval(this.intervalCheck);

    // Heartbeat check every 30 seconds to catch 20:00:00 ICT precisely
    this.intervalCheck = setInterval(async () => {
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
      const ict = new Date(utcMs + 7 * 3600000);
      const hour = ict.getHours();
      const minute = ict.getMinutes();

      const { dateKey } = this.getStartOfTodayInUtc();

      // Trigger at 20:00 (8:00 PM ICT) if not yet sent today
      if (hour === 20 && minute === 0 && this.lastReportDateKey !== dateKey) {
        this.lastReportDateKey = dateKey;
        await this.sendDailyReport(botApi);
      }
    }, 30000);

    logger.info('⏰ Daily Report Scheduler started (Target: 8:00 PM ICT / UTC+7)');
  }
}

export const dailyReportService = new DailyReportService();
