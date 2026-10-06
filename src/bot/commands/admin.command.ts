import { InlineKeyboard } from 'grammy';
import { getEnv } from '../../config/env.js';
import { botSettingRepository } from '../../database/repositories/botSetting.repository.js';
import { userRepository } from '../../database/repositories/user.repository.js';
import { getChatLanguage, t } from '../../i18n/index.js';
import { adminService } from '../../services/admin.service.js';
import { autoReplyService } from '../../services/autoReply.service.js';
import { channelArchiveService } from '../../services/channelArchive.service.js';
import type { BotContext } from '../../types/index.js';
import { getAdminPanelKeyboard } from '../keyboards/admin.keyboard.js';

export async function handleAdminCommand(ctx: BotContext): Promise<void> {
  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);
  const text = `${t('panel_title', locale)}\n\n${t('panel_desc', locale)}`;

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: getAdminPanelKeyboard(locale),
  });
}

export async function handleStatsCommand(ctx: BotContext): Promise<void> {
  const stats = await adminService.getStatistics();
  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);

  let text = '';
  if (locale === 'km') {
    text =
      `📊 <b>ស្ថិតិប្រព័ន្ធ (BOT STATISTICS)</b>\n\n` +
      `👤 <b>អ្នកប្រើប្រាស់សរុប៖</b> ${stats.usersCount.toLocaleString()} នាក់\n` +
      `💬 <b>សារដែលទទួលបាន៖</b> ${stats.messagesCount.toLocaleString()}\n\n` +
      `🔍 <b>ឯកសារដែលបានវិភាគ៖</b> ${stats.filesAnalyzedCount.toLocaleString()}\n` +
      `🚨 <b>ឯកសាររង់ចាំត្រួតពិនិត្យ៖</b> ${stats.pendingReviewsCount.toLocaleString()}\n\n` +
      `🗑 <b>លុបចេញដោយ Admin៖</b> ${stats.deletedByAdminCount.toLocaleString()}\n` +
      `✅ <b>អនុញ្ញាតដោយ Admin៖</b> ${stats.approvedCount.toLocaleString()}\n` +
      `❌ <b>មើលរំលង (Ignored)៖</b> ${stats.ignoredCount.toLocaleString()}\n\n` +
      `🤖 <b>ឆ្លើយតបស្វ័យប្រវត្តិ៖</b> ${stats.autoRepliesCount.toLocaleString()}\n` +
      `👥 <b>ក្រុម/ការសន្ទនាសរុប៖</b> ${stats.chatsCount.toLocaleString()}`;
  } else {
    text = adminService.formatStatsMessage(stats);
  }

  await ctx.reply(text, { parse_mode: 'HTML' });
}

export async function handlePendingCommand(ctx: BotContext): Promise<void> {
  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);
  const pending = await adminService.getPendingReviews(10);

  if (pending.length === 0) {
    const emptyMsg =
      locale === 'km'
        ? '✅ <b>គ្មានឯកសាររង់ចាំត្រួតពិនិត្យទេ</b>\n\nឯកសារទាំងអស់ត្រូវបានពិនិត្យរួចរាល់។'
        : '✅ <b>No Pending Reviews</b>\n\nAll files have been reviewed.';
    await ctx.reply(emptyMsg, { parse_mode: 'HTML' });
    return;
  }

  const title =
    locale === 'km'
      ? `🚨 <b>បញ្ជីឯកសាររង់ចាំការត្រួតពិនិត្យ (${pending.length})</b>\n\n`
      : `🚨 <b>PENDING FILE REVIEWS (${pending.length})</b>\n\n`;

  let text = title;
  const keyboard = new InlineKeyboard();

  pending.forEach((event, index) => {
    const num = index + 1;
    const riskEmoji = {
      CRITICAL: '🔴',
      HIGH: '🔴',
      MEDIUM: '🟠',
      LOW: '🟢',
      UNKNOWN: '⚪',
    }[event.riskLevel];

    text += `<b>${num}️⃣</b> <code>${event.filename}</code>\n`;
    text += `   👤 User: <code>${event.userId}</code> | Chat: <code>${event.chatId}</code>\n`;
    text += `   ⚠️ Risk: ${riskEmoji} ${event.riskLevel}\n\n`;

    const btnLabel =
      locale === 'km'
        ? `${num}️⃣ ពិនិត្យ: ${event.filename.substring(0, 14)}`
        : `${num}️⃣ Review: ${event.filename.substring(0, 14)}`;

    keyboard.text(btnLabel, `mod:view:${event.id}`).row();
  });

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

export async function handleSettingsCommand(ctx: BotContext): Promise<void> {
  const env = getEnv();
  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);

  let text = '';
  if (locale === 'km') {
    text =
      `⚙️ <b>ការកំណត់ប្រព័ន្ធ និងគោលការណ៍សុវត្ថិភាព</b>\n\n` +
      `• <b>ឆ្លើយតបស្វ័យប្រវត្តិ (Auto Reply):</b> ${env.AUTO_REPLY_ENABLED ? '✅ បើកដំណើរការ' : '❌ បិទ'}\n` +
      `• <b>ការពារឯកសារ (File Protection):</b> ${env.FILE_PROTECTION_ENABLED ? '✅ បើកដំណើរការ' : '❌ បិទ'}\n` +
      `• <b>ស្កេន Archive:</b> ${env.ARCHIVE_SCANNING_ENABLED ? '✅ បើកដំណើរការ' : '❌ បិទ'}\n` +
      `• <b>ជូនដំណឹង Admin:</b> ${env.ADMIN_NOTIFICATIONS_ENABLED ? '✅ បើកដំណើរការ' : '❌ បិទ'}\n\n` +
      `🛡️ <b>គោលការណ៍សុវត្ថិភាពជាកាតព្វកិច្ច (MANDATORY RULES):</b>\n` +
      `• <b>Auto Delete:</b> ${env.AUTO_DELETE ? '⚠️ True' : '🔒 False (មិនលុបស្វ័យប្រវត្តិ)'}\n` +
      `• <b>Auto Ban:</b> ${env.AUTO_BAN ? '⚠️ True' : '🔒 False (មិន Ban ស្វ័យប្រវត្តិ)'}\n` +
      `• <b>Auto Mute:</b> ${env.AUTO_MUTE ? '⚠️ True' : '🔒 False (មិន Mute ស្វ័យប្រវត្តិ)'}\n` +
      `• <b>តម្រូវឱ្យ Admin អនុម័ត:</b> ${env.ADMIN_APPROVAL_REQUIRED ? '✅ True (កាតព្វកិច្ច)' : '❌ False'}\n\n` +
      `📏 <b>កម្រិតកំណត់ (LIMITS):</b>\n` +
      `• ទំហំឯកសារអតិបរមា: ${env.MAX_FILE_SIZE_MB} MB\n` +
      `• ចំនួនឯកសារក្នុង Archive អតិបរមា: ${env.MAX_ARCHIVE_ENTRIES}\n` +
      `• ទំហំស្រង់ចេញអតិបរមា: ${env.MAX_ARCHIVE_EXTRACTED_SIZE_MB} MB\n` +
      `• រយៈពេលកំណត់ស្កេន: ${env.FILE_SCAN_TIMEOUT_SECONDS}s`;
  } else {
    text =
      `⚙️ <b>SYSTEM & MODERATION SETTINGS</b>\n\n` +
      `• <b>Auto Reply:</b> ${env.AUTO_REPLY_ENABLED ? '✅ Enabled' : '❌ Disabled'}\n` +
      `• <b>File Protection:</b> ${env.FILE_PROTECTION_ENABLED ? '✅ Enabled' : '❌ Disabled'}\n` +
      `• <b>Archive Scanning:</b> ${env.ARCHIVE_SCANNING_ENABLED ? '✅ Enabled' : '❌ Disabled'}\n` +
      `• <b>Admin Notifications:</b> ${env.ADMIN_NOTIFICATIONS_ENABLED ? '✅ Enabled' : '❌ Disabled'}\n\n` +
      `🛡️ <b>MANDATORY SAFETY RULES:</b>\n` +
      `• <b>Auto Delete:</b> ${env.AUTO_DELETE ? '⚠️ True' : '🔒 False (Compliant)'}\n` +
      `• <b>Auto Ban:</b> ${env.AUTO_BAN ? '⚠️ True' : '🔒 False (Compliant)'}\n` +
      `• <b>Auto Mute:</b> ${env.AUTO_MUTE ? '⚠️ True' : '🔒 False (Compliant)'}\n` +
      `• <b>Admin Approval Required:</b> ${env.ADMIN_APPROVAL_REQUIRED ? '✅ True' : '❌ False'}\n\n` +
      `📏 <b>LIMITS:</b>\n` +
      `• Max File Size: ${env.MAX_FILE_SIZE_MB} MB\n` +
      `• Max Archive Entries: ${env.MAX_ARCHIVE_ENTRIES}\n` +
      `• Max Extracted Size: ${env.MAX_ARCHIVE_EXTRACTED_SIZE_MB} MB\n` +
      `• Scan Timeout: ${env.FILE_SCAN_TIMEOUT_SECONDS}s`;
  }

  await ctx.reply(text, { parse_mode: 'HTML' });
}

export async function handleLogsCommand(ctx: BotContext): Promise<void> {
  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);
  const logs = await adminService.getRecentLogs(10);

  if (logs.length === 0) {
    const emptyMsg = locale === 'km' ? '📝 <b>កំណត់ហេតុសវនកម្ម</b>\n\nមិនទាន់មានកំណត់ហេតុថ្មីៗទេ។' : '📝 <b>Audit Logs</b>\n\nNo recent audit logs found.';
    await ctx.reply(emptyMsg, { parse_mode: 'HTML' });
    return;
  }

  const title = locale === 'km' ? `📝 <b>កំណត់ហេតុសវនកម្មថ្មីៗ (${logs.length})</b>\n\n` : `📝 <b>RECENT AUDIT LOGS (${logs.length})</b>\n\n`;

  let text = title;
  for (const log of logs) {
    const time = log.createdAt.toISOString().replace('T', ' ').substring(0, 19);
    text += `• <b>[${log.action}]</b> - <code>${time}</code>\n`;
    text += `  Target: ${log.targetType} (<code>${log.targetId || 'N/A'}</code>)\n`;
    if (log.adminTelegramId) {
      text += `  Admin: <code>${log.adminTelegramId.toString()}</code>\n`;
    }
    text += '\n';
  }

  await ctx.reply(text, { parse_mode: 'HTML' });
}

export async function handleBusyCommand(ctx: BotContext): Promise<void> {
  const locale = getChatLanguage(ctx.chat?.id, ctx.from?.language_code);
  const rawText = ctx.message?.text?.trim() || '';
  const parts = rawText.split(/\s+/);
  const arg = parts.slice(1).join(' ').trim();

  if (!arg) {
    const current = await autoReplyService.getBusyMode();
    const statusText = current.enabled
      ? (locale === 'km' ? '✅ កំពុងបើក (ឆ្លើយគ្រប់សារ)' : '✅ Active (Replies to all messages)')
      : (locale === 'km' ? '❌ បិទ (ឆ្លើយតាម Keyword)' : '❌ Disabled (Keyword mode)');

    const msg =
      locale === 'km'
        ? `🤖 <b>ស្ថានភាពឆ្លើយតបពេលរវល់ (Busy Auto-Reply Mode)</b>\n\n` +
          `• <b>ស្ថានភាព៖</b> ${statusText}\n` +
          `• <b>សារឆ្លើយតបបច្ចុប្បន្ន៖</b>\n<code>${current.text}</code>\n\n` +
          `📖 <b>របៀបបញ្ជា៖</b>\n` +
          `• <code>/busy on</code> — បើកឆ្លើយគ្រប់សារទាំងអស់\n` +
          `• <code>/busy off</code> — បិទ (ត្រឡប់ទៅ Keyword)\n` +
          `• <code>/busy &lt;សារថ្មី&gt;</code> — កំណត់សារឆ្លើយតបថ្មី`
        : `🤖 <b>Busy Auto-Reply Mode Status</b>\n\n` +
          `• <b>Status:</b> ${statusText}\n` +
          `• <b>Current Busy Message:</b>\n<code>${current.text}</code>\n\n` +
          `📖 <b>Usage:</b>\n` +
          `• <code>/busy on</code> — Enable replying to all incoming messages\n` +
          `• <code>/busy off</code> — Disable (back to keyword matching)\n` +
          `• <code>/busy &lt;new text&gt;</code> — Update busy message`;

    await ctx.reply(msg, { parse_mode: 'HTML' });
    return;
  }

  if (arg.toLowerCase() === 'on') {
    await autoReplyService.setBusyMode(true);
    const msg =
      locale === 'km'
        ? `✅ <b>បានបើកដំណើរការ Busy Mode រួចរាល់!</b>\n\nរាល់សារដែលផ្ញើមក (គ្រប់អក្សរទាំងអស់) Bot នឹងឆ្លើយតបសាររវល់ដោយស្វ័យប្រវត្តិ។`
        : `✅ <b>Busy Mode Enabled!</b>\n\nThe bot will now auto-reply to all incoming messages with the busy message.`;
    await ctx.reply(msg, { parse_mode: 'HTML' });
    return;
  }

  if (arg.toLowerCase() === 'off') {
    await autoReplyService.setBusyMode(false);
    const msg =
      locale === 'km'
        ? `❌ <b>បានបិទ Busy Mode!</b>\n\nBot នឹងត្រឡប់ទៅឆ្លើយតបតាមពាក្យគន្លឹះ (Keywords) វិញ។`
        : `❌ <b>Busy Mode Disabled!</b>\n\nThe bot returned to keyword matching mode.`;
    await ctx.reply(msg, { parse_mode: 'HTML' });
    return;
  }

  // Update busy message text and enable
  await autoReplyService.setBusyMode(true, arg);
  const msg =
    locale === 'km'
      ? `✅ <b>បានកែប្រែ និងបើកសារឆ្លើយតបពេលរវល់ជោគជ័យ!</b>\n\nសារថ្មី៖\n<code>${arg}</code>`
      : `✅ <b>Busy reply message updated and enabled!</b>\n\nNew message:\n<code>${arg}</code>`;
  await ctx.reply(msg, { parse_mode: 'HTML' });
}

/**
 * Command /archive [<channel_id>]
 * Checks or configures the Telegram Private Archive Channel ID.
 */
export async function handleArchiveCommand(ctx: BotContext): Promise<void> {
  const rawText = ctx.message?.text?.trim() || '';
  const parts = rawText.split(/\s+/);
  const arg = parts.slice(1).join(' ').trim();

  const currentId = await channelArchiveService.getChannelId();

  if (!arg) {
    const statusMsg = currentId
      ? `📁 <b>ប៉ុស្តិ៍បណ្ណសារស្វ័យប្រវត្តិ (Private Archive Channel)៖</b>\n\n` +
        `• <b>Channel ID បច្ចុប្បន្ន៖</b> <code>${currentId}</code>\n` +
        `• <b>ស្ថានភាព៖</b> ✅ សកម្ម (Active)\n\n` +
        `💡 <b>មុខងារស្វ័យប្រវត្តិ៖</b>\n` +
        `- រក្សាទុកវិក្កយបត្រ / Bank Slip KHQR\n` +
        `- រក្សាទុកសារ និងរូបភាពដែលគេបានលុប (Deleted Messages)\n` +
        `- រក្សាទុករបាយការណ៍មេរោគ និង Phishing Links\n\n` +
        `📖 <b>របៀបប្តូរ Channel ID ថ្មី៖</b>\n` +
        `វាយ៖ <code>/archive -100xxxxxxxxxx</code>\n` +
        `<i>(ចំណាំ៖ ត្រូវប្រាកដថាបានទាញ Bot ចូល Channel នោះ និងផ្តល់សិទ្ធិ Post Messages)</i>`
      : `📁 <b>ប៉ុស្តិ៍បណ្ណសារស្វ័យប្រវត្តិ (Private Archive Channel)៖</b>\n\n` +
        `• <b>ស្ថានភាព៖</b> ❌ មិនទាន់កំណត់ (Not Configured)\n\n` +
        `📖 <b>របៀបកំណត់៖</b>\n` +
        `1. បង្កើត Telegram Private Channel ថ្មីមួយ\n` +
        `2. Add Bot របស់អ្នកចូលជា Administrator (ផ្តល់សិទ្ធិ Post Messages)\n` +
        `3. វាយបញ្ជា៖ <code>/archive &lt;CHANNEL_ID&gt;</code> (ឧទាហរណ៍៖ <code>/archive -1001234567890</code>)`;

    await ctx.reply(statusMsg, { parse_mode: 'HTML' });
    return;
  }

  // Update archive channel ID in bot setting repository
  await botSettingRepository.setSetting('ARCHIVE_CHANNEL_ID', arg, 'Private Archive Channel Telegram ID');

  await ctx.reply(
    `✅ <b>បានកំណត់ Archive Channel ID ជោគជ័យ!</b>\n\n` +
    `• <b>Channel ID ថ្មី៖</b> <code>${arg}</code>\n\n` +
    `រាល់ Bank Slips, Deleted Messages, និង Phishing Threats នឹងត្រូវបាញ់ចូល Channel នេះដោយស្វ័យប្រវត្តិ។`,
    { parse_mode: 'HTML' }
  );
}

/**
 * Admin command: /users
 * Lists registered users with names, usernames, and activity stats.
 */
export async function handleUsersCommand(ctx: BotContext): Promise<void> {
  const users = await userRepository.getAllUsers(30);

  if (users.length === 0) {
    await ctx.reply(
      '👥 <b>បញ្ជីឈ្មោះអ្នកប្រើប្រាស់ (Users List)៖</b>\n\n<i>មិនទាន់មានអ្នកប្រើប្រាស់នៅក្នុងប្រព័ន្ធនៅឡើយទេ។</i>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = [
    `👥 <b>បញ្ជីឈ្មោះអ្នកប្រើប្រាស់សរុប (${users.length} នាក់)៖</b>`,
    `<i>អ្នកដែលបានឆាតមកកាន់ Bot ឬ Business Secretary របស់អ្នក៖</i>`,
    ``,
  ];

  for (let i = 0; i < users.length; i++) {
    const u = users[i]!;
    const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Anonymous';
    const handle = u.username ? `@${u.username}` : 'គ្មាន Username';
    const lastSeen = u.updatedAt ? u.updatedAt.toLocaleString('km-KH') : 'N/A';
    const botTag = u.isBot ? ' 🤖 [Bot]' : '';

    lines.push(`<b>${i + 1}. 👤 ${escape(fullName)}</b>${botTag}`);
    lines.push(`   • Handle: <b>${escape(handle)}</b>`);
    lines.push(`   • Telegram ID: <code>${u.telegramId.toString()}</code>`);
    lines.push(`   • ចំនួនសារ: <b>${u.messageCount}</b> សារ (ឯកសារ: ${u.fileCount})`);
    lines.push(`   • សកម្មចុងក្រោយ: <i>${lastSeen}</i>`);
    lines.push(``);
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

