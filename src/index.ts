import { run } from '@grammyjs/runner';
import { createBot } from './bot/bot.js';
import { getEnv } from './config/env.js';
import { prisma } from './database/prisma.js';
import { blockedExtensionRepository } from './database/repositories/blockedExtension.repository.js';
import { createHttpServer } from './server/health.js';
import { dailyReportService } from './services/dailyReport.service.js';
import { rateLimitService } from './services/rateLimit.service.js';
import { auditLogger, logger } from './utils/logger.js';

async function bootstrap() {
  const env = getEnv();
  logger.info(
    { mode: env.BOT_MODE, nodeEnv: env.NODE_ENV },
    '🚀 Initializing Telegram Security Bot...'
  );

  // 1. Seed default blocked extensions & settings in database (Silent Mode / No Auto-Reply by default)
  try {
    await blockedExtensionRepository.seedDefaultsIfEmpty();
    const busyMsg = 'សូមរង់ចាំការឆ្លើយតបពី SOCHEAT បន្តិច ពេលនេះគាត់កំពុងជាប់រវល់។';
    await prisma.botSetting.upsert({
      where: { key: 'AUTO_REPLY_ENABLED' },
      update: { value: 'false' },
      create: { key: 'AUTO_REPLY_ENABLED', value: 'false', description: 'Master switch for auto-replying in chats' },
    });
    await prisma.botSetting.upsert({
      where: { key: 'BUSY_MODE' },
      update: { value: 'false' },
      create: { key: 'BUSY_MODE', value: 'false', description: 'Enable universal busy auto-reply' },
    });
    const fallback = await prisma.botSetting.findUnique({ where: { key: 'FALLBACK_REPLY_TEXT' } });
    if (!fallback) {
      await prisma.botSetting.create({
        data: { key: 'FALLBACK_REPLY_TEXT', value: busyMsg, description: 'Fallback reply message' },
      });
    }
    logger.info('Default database records verified. Silent Mode active (Auto-Reply disabled).');
  } catch (err) {
    logger.warn({ err }, 'Could not seed defaults (database may not be connected yet)');
  }

  // 2. Initialize Bot instance
  const bot = createBot();

  // 3. Start Health & Webhook HTTP Server
  const server = createHttpServer(bot);
  server.listen(env.PORT, () => {
    logger.info(`🌐 Health server listening on port ${env.PORT} (/health, /ready)`);
  });

  // 3.5. Start Daily 8:00 PM Summary Digest Scheduler
  dailyReportService.startDailyScheduler(bot.api);

  // 4. Start Telegram Bot according to BOT_MODE
  let runner: { stop: () => Promise<void> } | null = null;

  const allowedUpdates = [
    'message',
    'edited_message',
    'callback_query',
    'business_connection',
    'business_message',
    'edited_business_message',
    'deleted_business_messages',
  ] as const;

  if (env.BOT_MODE === 'webhook') {
    if (!env.WEBHOOK_URL) {
      throw new Error('WEBHOOK_URL is required when BOT_MODE=webhook');
    }
    await bot.api.setWebhook(env.WEBHOOK_URL, {
      secret_token: env.WEBHOOK_SECRET,
      allowed_updates: [...allowedUpdates],
    });
    auditLogger.botStarted('webhook', env.PORT);
    logger.info(`Webhook registered at: ${env.WEBHOOK_URL}`);
  } else {
    // Delete webhook if previously set to enable polling cleanly
    await bot.api.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    runner = run(bot, {
      runner: {
        fetch: {
          allowed_updates: [...allowedUpdates],
        },
      },
    });
    auditLogger.botStarted('polling', env.PORT);
    logger.info('🤖 Bot is running via long-polling with concurrent runner (Secretary/Business enabled)');
  }

  // 5. Graceful Shutdown Handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated...');

    try {
      if (runner) {
        await runner.stop();
        logger.info('Bot polling runner stopped.');
      }

      await new Promise<void>(resolve => {
        server.close(() => {
          logger.info('HTTP server closed.');
          resolve();
        });
      });

      await rateLimitService.close();
      logger.info('Redis connection closed.');

      await prisma.$disconnect();
      logger.info('PostgreSQL database disconnected.');

      logger.info('✅ Shutdown completed successfully.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error occurred during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch(err => {
  logger.fatal({ err }, 'Fatal error during bootstrap');
  process.exit(1);
});
