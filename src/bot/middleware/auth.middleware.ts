import type { NextFunction } from 'grammy';
import { adminService } from '../../services/admin.service.js';
import type { BotContext } from '../../types/index.js';

export async function authMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  ctx.isAdmin = adminService.isAdmin(userId);
  await next();
}

export async function requireAdmin(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.isAdmin) {
    await ctx.reply(
      '⛔ <b>Access Denied:</b> This command is restricted to authorized administrators only.',
      {
        parse_mode: 'HTML',
      }
    );
    return;
  }
  await next();
}
