import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Api } from 'grammy';
import { getEnv } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { adminService } from '../services/admin.service.js';
import { keywordRepository } from '../database/repositories/keyword.repository.js';
import { messageRepository } from '../database/repositories/message.repository.js';
import { botSettingRepository } from '../database/repositories/botSetting.repository.js';
import { userRepository } from '../database/repositories/user.repository.js';
import { dailyReportService } from '../services/dailyReport.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function handleDashboardRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  botApi?: Api
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

  // 2. Dashboard API Endpoints (Guarded by x-dashboard-key or key query param)
  if (url.pathname.startsWith('/api/dashboard/')) {
    const authKey = req.headers['x-dashboard-key'] || url.searchParams.get('key');
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

    // GET /api/dashboard/users
    if (req.method === 'GET' && url.pathname === '/api/dashboard/users') {
      try {
        const users = await userRepository.getAllUsers(100);
        const sanitized = users.map(u => ({
          id: u.id,
          telegramId: u.telegramId.toString(),
          firstName: u.firstName || '',
          lastName: u.lastName || '',
          fullName: [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Anonymous',
          username: u.username ? `@${u.username}` : null,
          usernameRaw: u.username || null,
          isBot: u.isBot,
          messageCount: u.messageCount,
          fileCount: u.fileCount,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sanitized));
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

    // GET /api/dashboard/daily-stats
    if (req.method === 'GET' && url.pathname === '/api/dashboard/daily-stats') {
      try {
        const stats = await dailyReportService.getDailyStatistics();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // POST /api/dashboard/trigger-daily-report
    if (req.method === 'POST' && url.pathname === '/api/dashboard/trigger-daily-report') {
      try {
        if (botApi) {
          await dailyReportService.sendDailyReport(botApi);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Daily report dispatched to Telegram' }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bot API not available on this server' }));
        }
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // GET /api/dashboard/export/users.csv
    if (req.method === 'GET' && url.pathname === '/api/dashboard/export/users.csv') {
      try {
        const users = await userRepository.getAllUsers(500);
        const headers = ['Telegram ID', 'Full Name', 'First Name', 'Last Name', 'Username', 'Is Bot', 'Messages Count', 'Files Count', 'Registered Date', 'Last Active'];
        const rows = users.map(u => [
          u.telegramId.toString(),
          [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Anonymous',
          u.firstName || '',
          u.lastName || '',
          u.username ? `@${u.username}` : '',
          u.isBot ? 'Yes' : 'No',
          u.messageCount,
          u.fileCount,
          u.createdAt.toISOString(),
          u.updatedAt.toISOString(),
        ]);

        const csvContent = '\uFEFF' + [headers, ...rows].map(row => row.map(escapeCsvField).join(',')).join('\r\n');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="telegram_users_${Date.now()}.csv"`,
        });
        res.end(csvContent);
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // GET /api/dashboard/export/deleted.csv
    if (req.method === 'GET' && url.pathname === '/api/dashboard/export/deleted.csv') {
      try {
        const deleted = await messageRepository.getRecentDeleted(500);
        const headers = ['Sent Date', 'Deleted Date', 'Sender Name', 'Sender Username', 'User ID', 'Chat ID', 'Message Type', 'Full Text'];
        const rows = deleted.map(d => [
          d.createdAt.toISOString(),
          d.deletedAt ? d.deletedAt.toISOString() : '',
          d.senderName || 'Anonymous',
          d.senderUsername ? `@${d.senderUsername}` : '',
          d.userId,
          d.chatId,
          d.messageType,
          d.fullText || '[Media File]',
        ]);

        const csvContent = '\uFEFF' + [headers, ...rows].map(row => row.map(escapeCsvField).join(',')).join('\r\n');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="deleted_messages_${Date.now()}.csv"`,
        });
        res.end(csvContent);
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // GET /api/dashboard/export/threats.csv
    if (req.method === 'GET' && url.pathname === '/api/dashboard/export/threats.csv') {
      try {
        const events = await prisma.fileEvent.findMany({
          orderBy: { createdAt: 'desc' },
          take: 500,
        });
        const headers = ['Date', 'Filename', 'Extension', 'Risk Level', 'Status', 'Size (Bytes)', 'SHA256', 'User ID', 'Chat ID', 'Impact Summary'];
        const rows = events.map(e => [
          e.createdAt.toISOString(),
          e.filename,
          e.extension,
          e.riskLevel,
          e.status,
          e.size.toString(),
          e.sha256,
          e.userId,
          e.chatId,
          e.impactSummary,
        ]);

        const csvContent = '\uFEFF' + [headers, ...rows].map(row => row.map(escapeCsvField).join(',')).join('\r\n');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="security_threats_${Date.now()}.csv"`,
        });
        res.end(csvContent);
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

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

