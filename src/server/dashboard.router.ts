import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEnv } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { adminService } from '../services/admin.service.js';
import { keywordRepository } from '../database/repositories/keyword.repository.js';
import { messageRepository } from '../database/repositories/message.repository.js';
import { botSettingRepository } from '../database/repositories/botSetting.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function handleDashboardRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<boolean> {
  const env = getEnv();

  // 1. Serve Dashboard HTML
  if (req.method === 'GET' && (url.pathname === '/dashboard' || url.pathname === '/admin-portal')) {
    try {
      const candidatePaths = [
        path.join(__dirname, 'dashboard.html'),
        path.resolve(process.cwd(), 'dist/server/dashboard.html'),
        path.resolve(process.cwd(), 'src/server/dashboard.html'),
      ];
      let htmlContent = '';
      for (const p of candidatePaths) {
        try {
          htmlContent = await fs.readFile(p, 'utf-8');
          if (htmlContent) break;
        } catch {
          // try next path
        }
      }
      if (!htmlContent) {
        throw new Error('Dashboard HTML file not found');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlContent);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Failed to load dashboard interface');
    }
    return true;
  }

  // 2. Dashboard API Endpoints (Guarded by x-dashboard-key)
  if (url.pathname.startsWith('/api/dashboard/')) {
    const authKey = req.headers['x-dashboard-key'];
    if (authKey !== env.DASHBOARD_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid dashboard key' }));
      return true;
    }

    // GET /api/dashboard/stats
    if (req.method === 'GET' && url.pathname === '/api/dashboard/stats') {
      try {
        const stats = await adminService.getStatistics();
        const deletedCount = await prisma.messageEvent.count({ where: { isDeleted: true } });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...stats, deletedMessagesCount: deletedCount }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // GET /api/dashboard/deleted-messages
    if (req.method === 'GET' && url.pathname === '/api/dashboard/deleted-messages') {
      try {
        const list = await messageRepository.getRecentDeleted(50);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(list));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // GET /api/dashboard/security-events
    if (req.method === 'GET' && url.pathname === '/api/dashboard/security-events') {
      try {
        const events = await prisma.fileEvent.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        // Safely format bigints
        const sanitized = events.map(e => ({
          ...e,
          size: e.size.toString(),
          reviewedBy: e.reviewedBy ? e.reviewedBy.toString() : null,
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sanitized));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // GET /api/dashboard/keywords
    if (req.method === 'GET' && url.pathname === '/api/dashboard/keywords') {
      try {
        const kws = await keywordRepository.getActiveKeywords();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(kws));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // POST /api/dashboard/keywords
    if (req.method === 'POST' && url.pathname === '/api/dashboard/keywords') {
      try {
        const body = await parseJsonBody(req);
        if (!body.keyword || !body.reply) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Keyword and reply are required' }));
          return true;
        }

        const created = await keywordRepository.createKeyword({
          keyword: body.keyword,
          reply: body.reply,
          matchType: body.matchType || 'CONTAINS',
          priority: 10,
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(created));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // DELETE /api/dashboard/keywords/:id
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/dashboard/keywords/')) {
      const id = url.pathname.replace('/api/dashboard/keywords/', '');
      try {
        await keywordRepository.deleteKeyword(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // POST /api/dashboard/settings
    if (req.method === 'POST' && url.pathname === '/api/dashboard/settings') {
      try {
        const body = await parseJsonBody(req);
        if (body.key && body.value !== undefined) {
          await botSettingRepository.setSetting(body.key, String(body.value));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }
  }

  return false;
}

function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
