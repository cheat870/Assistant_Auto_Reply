import { Bot } from 'grammy';
import { getEnv } from '../config/env.js';
import type { BotContext } from '../types/index.js';
import { auditLogger, logger } from '../utils/logger.js';
import {
  handleAdminPanelCallback,
} from './callbacks/adminPanel.callback.js';
import {
  handleLanguageCallback,
  handleModerationCallback,
} from './callbacks/moderation.callback.js';
import {
  handleAdminCommand,
  handleBusyCommand,
  handleLogsCommand,
  handlePendingCommand,
  handleSettingsCommand,
  handleStatsCommand,
} from './commands/admin.command.js';
import {
  handleAddBlockedCommand,
  handleBlockedCommand,
  handleDelBlockedCommand,
} from './commands/blocked.command.js';
import {
  handleAddKeywordCommand,
  handleDelKeywordCommand,
  handleKeywordsCommand,
} from './commands/keyword.command.js';
import {
  handleHelpCommand,
  handleLangCommand,
  handleMenuCommand,
  handleStartCommand,
} from './commands/user.command.js';
import { handleAudioOrVideoMessage, handleDocumentMessage } from './handlers/file.handler.js';
import { handleBusinessConnection, handleBusinessTextMessage } from './handlers/business.handler.js';
import { handleTextMessage } from './handlers/message.handler.js';
import { authMiddleware, requireAdmin } from './middleware/auth.middleware.js';
import { loggerMiddleware } from './middleware/logger.middleware.js';
import { rateLimitMiddleware } from './middleware/rateLimit.middleware.js';

export function createBot(): Bot<BotContext> {
  const env = getEnv();
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  // Centralized Error Handling - NEVER leak secrets or internal stack traces to users
  bot.catch(err => {
    const ctx = err.ctx;
    logger.error(
      {
        err: err.error instanceof Error ? err.error.message : String(err.error),
        updateId: ctx.update.update_id,
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
      },
      'Unhandled error in Telegram bot update'
    );

    auditLogger.error('Unhandled Telegram bot error', err.error, {
      updateId: ctx.update.update_id,
    });

    try {
      ctx
        .reply(
          '⚠️ An unexpected error occurred while processing your request. Please try again later.'
        )
        .catch(() => {});
    } catch {
      // ignore send error
    }
  });

  // Global Middlewares
  bot.use(authMiddleware);
  bot.use(rateLimitMiddleware);
  bot.use(loggerMiddleware);

  // Public User Commands
  bot.command('start', handleStartCommand);
  bot.command('help', handleHelpCommand);
  bot.command('menu', handleMenuCommand);
  bot.command('lang', handleLangCommand);
  bot.command('language', handleLangCommand);

  // Administrator Commands (Guarded by requireAdmin)
  bot.command('admin', requireAdmin, handleAdminCommand);
  bot.command('stats', requireAdmin, handleStatsCommand);
  bot.command('pending', requireAdmin, handlePendingCommand);
  bot.command('settings', requireAdmin, handleSettingsCommand);
  bot.command('logs', requireAdmin, handleLogsCommand);
  bot.command('busy', requireAdmin, handleBusyCommand);

  // Keyword Management Commands
  bot.command('keywords', requireAdmin, handleKeywordsCommand);
  bot.command('replies', requireAdmin, handleKeywordsCommand);
  bot.command('addkeyword', requireAdmin, handleAddKeywordCommand);
  bot.command('addreply', requireAdmin, handleAddKeywordCommand);
  bot.command('delkeyword', requireAdmin, handleDelKeywordCommand);
  bot.command('delreply', requireAdmin, handleDelKeywordCommand);

  // Blocked Extension Management Commands
  bot.command('blocked', requireAdmin, handleBlockedCommand);
  bot.command('addblocked', requireAdmin, handleAddBlockedCommand);
  bot.command('delblocked', requireAdmin, handleDelBlockedCommand);

  // Callback Query Handlers
  bot.callbackQuery(/^mod:/, handleModerationCallback);
  bot.callbackQuery(/^admin:/, handleAdminPanelCallback);
  bot.callbackQuery(/^lang:/, handleLanguageCallback);

  // Message Handlers
  bot.on('business_connection', handleBusinessConnection);
  bot.on('business_message:text', handleBusinessTextMessage);
  bot.on('message:document', handleDocumentMessage);
  bot.on(
    ['message:video', 'message:audio', 'message:voice', 'message:video_note'],
    handleAudioOrVideoMessage
  );
  bot.on('message:text', handleTextMessage);

  return bot;
}
