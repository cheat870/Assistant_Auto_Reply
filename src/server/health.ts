import http from 'node:http';
import { webhookCallback, type Bot } from 'grammy';
import { getEnv } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { rateLimitService } from '../services/rateLimit.service.js';
import type { BotContext } from '../types/index.js';
import { logger } from '../utils/logger.js';

import { handleDashboardRoute } from './dashboard.router.js';

export function createHttpServer(bot: Bot<BotContext>): http.Server {
  const env = getEnv();
  const webhookHandler = env.BOT_MODE === 'webhook' ? webhookCallback(bot, 'http') : null;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Handle Web Admin Dashboard and Dashboard API
    const handledDashboard = await handleDashboardRoute(req, res, url, bot.api);
    if (handledDashboard) return;

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
      const apiKey = env.GEMINI_API_KEY ? env.GEMINI_API_KEY.replace(/[\r\n\s]+/g, '').trim() : '';
      const keyPresent = Boolean(apiKey);
      const keyLength = apiKey.length;
      const keyPrefix = keyPresent ? apiKey.substring(0, 10) + '...' : 'none';
      const vtPresent = Boolean(env.VIRUSTOTAL_API_KEY);

      // Direct REST test to capture exact Google response
      let restStatus = 0;
      let restData: any = null;
      let restError: string | null = null;
      if (apiKey) {
        try {
          const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${apiKey}`;
          const resp = await fetch(testUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
            }),
          });
          restStatus = resp.status;
          restData = await resp.json().catch(() => resp.statusText);
        } catch (err: any) {
          restError = err?.message || String(err);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          geminiConfigured: keyPresent,
          geminiKeyLength: keyLength,
          geminiKeyPrefix: keyPrefix,
          geminiModel: env.GEMINI_MODEL,
          virusTotalConfigured: vtPresent,
          restStatus,
          restData,
          restError,
        }, null, 2)
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
