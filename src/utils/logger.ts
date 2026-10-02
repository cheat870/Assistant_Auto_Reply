import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
  redact: {
    paths: [
      'token',
      'botToken',
      'password',
      'DATABASE_URL',
      'REDIS_URL',
      'WEBHOOK_SECRET',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'telegram-security-bot',
  },
});

export const auditLogger = {
  botStarted(mode: string, port?: number) {
    logger.info({ event: 'BOT_STARTED', mode, port }, `🤖 Bot started in ${mode} mode`);
  },
  messageReceived(chatId: string | number, userId: string | number, messageId: number) {
    logger.info({ event: 'MESSAGE_RECEIVED', chatId, userId, messageId }, '📩 Message received');
  },
  autoReplySent(chatId: string | number, keyword: string, matchType: string) {
    logger.info(
      { event: 'AUTO_REPLY_SENT', chatId, keyword, matchType },
      `💬 Auto reply sent for keyword "${keyword}"`
    );
  },
  fileReceived(
    chatId: string | number,
    userId: string | number,
    filename: string,
    sizeBytes: number
  ) {
    logger.info(
      { event: 'FILE_RECEIVED', chatId, userId, filename, sizeBytes },
      `📁 File received: ${filename} (${sizeBytes} bytes)`
    );
  },
  fileAnalysisStarted(filename: string, sizeBytes: number) {
    logger.info(
      { event: 'FILE_ANALYSIS_STARTED', filename, sizeBytes },
      `🔍 File analysis started for ${filename}`
    );
  },
  fileAnalysisCompleted(filename: string, sha256: string, riskLevel: string) {
    logger.info(
      { event: 'FILE_ANALYSIS_COMPLETED', filename, sha256, riskLevel },
      `📊 File analysis completed: ${filename} -> Risk: ${riskLevel}`
    );
  },
  fileDetected(filename: string, extension: string, riskLevel: string) {
    logger.warn(
      { event: 'FILE_DETECTED', filename, extension, riskLevel },
      `🚨 Suspicious file detected: ${filename}`
    );
  },
  adminNotified(chatId: string | number, fileEventId: string) {
    logger.info(
      { event: 'ADMIN_NOTIFIED', chatId, fileEventId },
      `📢 Admin notified for file event ${fileEventId}`
    );
  },
  fileApproved(adminTelegramId: string | bigint, fileEventId: string) {
    logger.info(
      { event: 'FILE_APPROVED', adminTelegramId: adminTelegramId.toString(), fileEventId },
      `✅ File approved by admin ${adminTelegramId}`
    );
  },
  fileDeleted(adminTelegramId: string | bigint, fileEventId: string) {
    logger.warn(
      { event: 'FILE_DELETED', adminTelegramId: adminTelegramId.toString(), fileEventId },
      `🗑️ File deleted by admin ${adminTelegramId}`
    );
  },
  fileIgnored(adminTelegramId: string | bigint, fileEventId: string) {
    logger.info(
      { event: 'FILE_IGNORED', adminTelegramId: adminTelegramId.toString(), fileEventId },
      `❌ File review ignored by admin ${adminTelegramId}`
    );
  },
  adminAction(
    adminTelegramId: string | bigint,
    action: string,
    metadata?: Record<string, unknown>
  ) {
    logger.info(
      { event: 'ADMIN_ACTION', adminTelegramId: adminTelegramId.toString(), action, metadata },
      `👨‍💼 Admin action: ${action}`
    );
  },
  rateLimited(targetType: 'user' | 'chat', targetId: string | number) {
    logger.warn(
      { event: 'RATE_LIMITED', targetType, targetId },
      `⚡ Rate limit exceeded for ${targetType}: ${targetId}`
    );
  },
  error(message: string, error: unknown, context?: Record<string, unknown>) {
    logger.error(
      {
        event: 'ERROR',
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        ...context,
      },
      message
    );
  },
};
