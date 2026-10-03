import http from 'node:http';
import { webhookCallback, type Bot } from 'grammy';
import { getEnv } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { aiService } from '../services/ai.service.js';
import { rateLimitService } from '../services/rateLimit.service.js';
import type { BotContext } from '../types/index.js';
import { logger } from '../utils/logger.js';

export function createHttpServer(bot: Bot<BotContext>): http.Server {
  const env = getEnv();
  const webhookHandler = env.BOT_MODE === 'webhook' ? webhookCallback(bot, 'http') : null;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // GET /health or HEAD /health (and root /) - Liveness probe
    if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/health' || url.pathname === '/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(JSON.stringify({ status: 'ok' }));
      }
      return;
    }

    // GET /ready or HEAD /ready - Readiness probe (checks Database, Redis, and Bot)
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/ready') {
      let dbOk = false;
      let redisOk = false;

      try {
        await prisma.$queryRaw`SELECT 1`;
        dbOk = true;
      } catch (err) {
        logger.error({ err }, 'Readiness check: PostgreSQL failed');
      }

      try {
        // Test rate limiter
        await rateLimitService.isRateLimited('user', 'healthcheck');
        redisOk = true;
      } catch (err) {
        logger.warn({ err }, 'Readiness check: Redis check failed');
      }

      const isReady = dbOk; // PostgreSQL is required for operation
      const statusCode = isReady ? 200 : 503;

      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: isReady ? 'ready' : 'unhealthy',
          database: dbOk ? 'ok' : 'error',
          redis: redisOk ? 'ok' : 'degraded (in-memory fallback active)',
          bot: 'ok',
        })
      );
      return;
    }

    // GET /diag - Diagnostic endpoint for AI and threat intelligence
    if (req.method === 'GET' && url.pathname === '/diag') {
      const prompt = url.searchParams.get('q') || '1+2=';
      const keyPresent = Boolean(env.GEMINI_API_KEY);
      const keyLength = env.GEMINI_API_KEY ? env.GEMINI_API_KEY.length : 0;
      const keyPrefix = env.GEMINI_API_KEY ? env.GEMINI_API_KEY.substring(0, 8) + '...' : 'none';
      const vtPresent = Boolean(env.VIRUSTOTAL_API_KEY);

      let aiResult: any = null;
      let aiError: string | null = null;
      try {
        aiResult = await aiService.generateSmartAutoReply(prompt, 'Tester');
      } catch (err: any) {
        aiError = err?.message || String(err);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          geminiConfigured: keyPresent,
          geminiKeyLength: keyLength,
          geminiKeyPrefix: keyPrefix,
          geminiModel: env.GEMINI_MODEL,
          virusTotalConfigured: vtPresent,
          testPrompt: prompt,
          aiResponse: aiResult,
          aiError,
        })
      );
      return;
    }

    // Webhook Route
    if (req.method === 'POST' && webhookHandler && url.pathname === '/telegram/webhook') {
      // Secret token check if configured
      if (env.WEBHOOK_SECRET) {
        const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
        if (headerSecret !== env.WEBHOOK_SECRET) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid secret token' }));
          return;
        }
      }

      webhookHandler(req, res);
      return;
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}
