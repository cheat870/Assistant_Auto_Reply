import type { NextFunction } from 'grammy';
import { rateLimitService } from '../../services/rateLimit.service.js';
import type { BotContext } from '../../types/index.js';

export async function rateLimitMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await next();
    return;
  }

  // Administrators bypass message rate limits
  if (ctx.isAdmin) {
    await next();
    return;
  }

  const isLimited = await rateLimitService.isRateLimited('user', userId);
  if (isLimited) {
    ctx.rateLimitExceeded = true;
    // Don't flood user with rate limit alerts; only respond once per window
    try {
      await ctx.reply(
        '⚡ <b>Rate Limit Exceeded:</b> You are sending messages too quickly. Please slow down and wait a few seconds.',
        { parse_mode: 'HTML' }
      );
    } catch {
      // Ignore if cannot send
    }
    return;
  }

  await next();
}
