import { InlineKeyboard } from 'grammy';
import { getChatLanguage, t } from '../../i18n/index.js';
import { messageRepository } from '../../database/repositories/message.repository.js';
import { adminService } from '../../services/admin.service.js';
import { autoReplyService } from '../../services/autoReply.service.js';
import type { BotContext } from '../../types/index.js';
import { getAdminPanelKeyboard, getBackToAdminKeyboard } from '../keyboards/admin.keyboard.js';

export async function handleAdminPanelCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('admin:')) return;

  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);
  const adminId = ctx.from?.id;
  if (!adminId || !adminService.isAdmin(adminId)) {
    await ctx.answerCallbackQuery({ text: t('mod_unauthorized', locale), show_alert: true });
    return;
  }

  const action = data.replace('admin:', '');

  switch (action) {
    case 'menu': {
      await ctx.editMessageText(
        `${t('panel_title', locale)}\n\n${t('panel_desc', locale)}`,
        {
          parse_mode: 'HTML',
          reply_markup: getAdminPanelKeyboard(locale),
        }
      );
      break;
    }

    case 'pending': {
      const pending = await adminService.getPendingReviews(10);
      let text =
        locale === 'km'
          ? `🚨 <b>បញ្ជីឯកសាររង់ចាំត្រួតពិនិត្យ (${pending.length})</b>\n\n`
          : `🚨 <b>PENDING FILE REVIEWS (${pending.length})</b>\n\n`;

      if (pending.length === 0) {
        text += locale === 'km' ? '✅ គ្មានឯកសារដែលត្រូវត្រួតពិនិត្យទេ។' : '✅ No pending files requiring review.';
      } else {
        pending.forEach((p, idx) => {
          text += `<b>${idx + 1}.</b> <code>${p.filename}</code> (${p.riskLevel})\n`;
          text += `   User: <code>${p.userId}</code> | ID: <code>${p.id}</code>\n\n`;
        });
        text += locale === 'km' ? `ប្រើ /pending ដើម្បីពិនិត្យ និងជ្រើសរើសសកម្មភាព។` : `Use /pending to review with action buttons.`;
      }

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: getBackToAdminKeyboard(locale),
      });
      break;
    }

    case 'busy:toggle': {
      const current = await autoReplyService.getBusyMode();
      await autoReplyService.setBusyMode(!current.enabled);
      await ctx.answerCallbackQuery({
        text: !current.enabled
          ? (locale === 'km' ? '✅ បានបើក Busy Mode (ឆ្លើយគ្រប់សារ)!' : '✅ Busy Mode enabled (replies to all)!')
          : (locale === 'km' ? '❌ បានបិទ Busy Mode (ត្រឡប់ទៅ Keywords)!' : '❌ Busy Mode disabled!'),
      });
      // Re-trigger autoreply view
      return handleAdminPanelCallback({
        ...ctx,
        callbackQuery: { ...ctx.callbackQuery, data: 'admin:autoreply' },
      } as BotContext);
    }

    case 'autoreply':
    case 'keywords': {
      const busy = await autoReplyService.getBusyMode();
      const keywords = await autoReplyService.listKeywords();
      let text = '';

      if (locale === 'km') {
        text =
          `🤖 <b>ការកំណត់ឆ្លើយតបស្វ័យប្រវត្តិ (AUTO-REPLY SYSTEM)</b>\n\n` +
          `• <b>Busy Mode (ឆ្លើយគ្រប់សារទាំងអស់):</b> ${busy.enabled ? '✅ កំពុងបើក (Active)' : '❌ បិទ (Disabled)'}\n` +
          `• <b>សារឆ្លើយតបបច្ចុប្បន្ន៖</b>\n<code>${busy.text}</code>\n\n` +
          `🔑 <b>ពាក្យគន្លឹះឆ្លើយតប Keywords (${keywords.length})៖</b>\n`;
      } else {
        text =
          `🤖 <b>AUTO-REPLY SYSTEM SETTINGS</b>\n\n` +
          `• <b>Busy Mode (Reply All):</b> ${busy.enabled ? '✅ Active' : '❌ Disabled'}\n` +
          `• <b>Current Busy Message:</b>\n<code>${busy.text}</code>\n\n` +
          `🔑 <b>Keywords (${keywords.length}):</b>\n`;
      }

      if (keywords.length === 0) {
        text +=
          locale === 'km'
            ? 'មិនទាន់មានពាក្យគន្លឹះនៅឡើយទេ។\n\nបន្ថែមដោយប្រើ៖\n<code>/addkeyword &lt;ពាក្យ&gt; | &lt;ចម្លើយ&gt;</code>'
            : 'No keywords configured.\n\nAdd one using:\n<code>/addkeyword &lt;keyword&gt; | &lt;reply&gt;</code>';
      } else {
        keywords.slice(0, 8).forEach((kw, idx) => {
          text += `<b>${idx + 1}.</b> <code>${kw.keyword}</code> (${kw.matchType}) -> "${kw.reply.substring(0, 25)}..."\n`;
        });
        text +=
          locale === 'km'
            ? `\nប្រើ /busy ដើម្បីបើក/បិទឆ្លើយគ្រប់សារ ឬ /keywords ដើម្បីមើលទាំងអស់។`
            : `\nUse /busy to toggle reply-all mode or /keywords to view full list.`;
      }

      const kb = new InlineKeyboard()
        .text(
          busy.enabled
            ? (locale === 'km' ? '🔴 បិទ Busy Mode' : '🔴 Disable Busy Mode')
            : (locale === 'km' ? '🟢 បើក Busy Mode' : '🟢 Enable Busy Mode'),
          'admin:busy:toggle'
        )
        .row()
        .text(t('btn_back_admin', locale), 'admin:menu');

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: kb,
      });
      break;
    }

    case 'fileprotection':
    case 'extensions': {
      const exts = await adminService.getBlockedExtensions();
      let text =
        locale === 'km'
          ? `🛡️ <b>កន្ទុយឯកសារដែលស្ថិតក្រោមការតាមដាន (${exts.length})</b>\n\n`
          : `🛡️ <b>BLOCKED & REVIEW EXTENSIONS (${exts.length})</b>\n\n`;

      const list = exts.map(e => `<code>${e.extension}</code>`).join(', ');
      text += list || (locale === 'km' ? 'គ្មានកំណត់ទេ។' : 'None configured.');
      text +=
        locale === 'km'
          ? `\n\nប្រើ /addblocked និង /delblocked ដើម្បីគ្រប់គ្រង។`
          : `\n\nUse /addblocked and /delblocked to manage.`;

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: getBackToAdminKeyboard(locale),
      });
      break;
    }

    case 'stats': {
      const stats = await adminService.getStatistics();
      let text = '';
      if (locale === 'km') {
        text =
          `📊 <b>ស្ថិតិប្រព័ន្ធ (BOT STATISTICS)</b>\n\n` +
          `👤 <b>អ្នកប្រើប្រាស់៖</b> ${stats.usersCount.toLocaleString()}\n` +
          `💬 <b>សារសរុប៖</b> ${stats.messagesCount.toLocaleString()}\n\n` +
          `🔍 <b>ឯកសារបានវិភាគ៖</b> ${stats.filesAnalyzedCount.toLocaleString()}\n` +
          `🚨 <b>ឯកសាររង់ចាំពិនិត្យ៖</b> ${stats.pendingReviewsCount.toLocaleString()}\n\n` +
          `🗑 <b>លុបដោយ Admin៖</b> ${stats.deletedByAdminCount.toLocaleString()}\n` +
          `✅ <b>អនុញ្ញាត៖</b> ${stats.approvedCount.toLocaleString()}\n` +
          `❌ <b>មើលរំលង៖</b> ${stats.ignoredCount.toLocaleString()}\n\n` +
          `🤖 <b>ឆ្លើយតបស្វ័យប្រវត្តិ៖</b> ${stats.autoRepliesCount.toLocaleString()}\n` +
          `👥 <b>ក្រុម/ការសន្ទនា៖</b> ${stats.chatsCount.toLocaleString()}`;
      } else {
        text = adminService.formatStatsMessage(stats);
      }

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: getBackToAdminKeyboard(locale),
      });
      break;
    }

    case 'settings': {
      const text =
        locale === 'km'
          ? `⚙️ <b>ការកំណត់ប្រព័ន្ធ</b>\n\nប្រើពាក្យបញ្ជា <code>/settings</code> ដើម្បីមើលរបាយការណ៍កំណត់រចនាសម្ព័ន្ធពេញលេញ។`
          : `⚙️ <b>SETTINGS SUMMARY</b>\n\nUse command <code>/settings</code> for full configuration report.`;

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: getBackToAdminKeyboard(locale),
      });
      break;
    }

    case 'logs': {
      const logs = await adminService.getRecentLogs(5);
      let text =
        locale === 'km'
          ? `📝 <b>កំណត់ហេតុសវនកម្មថ្មីៗ (${logs.length})</b>\n\n`
          : `📝 <b>RECENT AUDIT LOGS (${logs.length})</b>\n\n`;

      logs.forEach(l => {
        text += `• <b>[${l.action}]</b>: ${l.targetType} (<code>${l.targetId || ''}</code>)\n`;
      });
      text += locale === 'km' ? `\nប្រើ <code>/logs</code> ដើម្បីមើលប្រវត្តិពេញលេញ។` : `\nUse <code>/logs</code> for full history.`;

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: getBackToAdminKeyboard(locale),
      });
      break;
    }

    case 'deleted': {
      const deletedMessages = await messageRepository.getRecentDeleted(10);
      let text = '';
      if (deletedMessages.length === 0) {
        text =
          locale === 'km'
            ? '📋 <b>ប្រវត្តិសារដែលត្រូវបានលុប (Deleted Messages):</b>\n\n<i>មិនទាន់មានសារដែលត្រូវបានលុបត្រូវបានរកឃើញនៅឡើយទេ។</i>'
            : '📋 <b>Deleted Messages:</b>\n\n<i>No deleted messages recorded yet.</i>';
      } else {
        const header =
          locale === 'km'
            ? `📋 <b>ប្រវត្តិសារដែលបានលុបចុងក្រោយ (${deletedMessages.length}):</b>\n\n`
            : `📋 <b>Recently Deleted Messages (${deletedMessages.length}):</b>\n\n`;
        const items = deletedMessages.map((m, idx) => {
          const sender = m.senderName || 'Anonymous';
          const time = m.deletedAt ? m.deletedAt.toLocaleTimeString('km-KH') : m.createdAt.toLocaleTimeString('km-KH');
          const preview = m.fullText ? m.fullText.substring(0, 80) : `[${m.messageType}]`;
          return `<b>${idx + 1}. ${sender}</b> (⏰ ${time})\n<blockquote>${preview.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</blockquote>`;
        });
        text = header + items.join('\n\n') + (locale === 'km' ? '\n\nប្រើ <code>/deleted</code> សម្រាប់មើលលម្អិត។' : '\n\nUse <code>/deleted</code> for details.');
      }

      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: getBackToAdminKeyboard(locale),
      });
      break;
    }
  }

  await ctx.answerCallbackQuery();
}
