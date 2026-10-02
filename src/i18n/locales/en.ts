export const en = {
  // Public user commands
  welcome_title: '👋 Welcome to the Security & Chat Automation Bot!',
  welcome_features:
    '🤖 <b>Core Features:</b>\n' +
    '• <b>Chat Automation:</b> Instant replies to common questions & keywords.\n' +
    '• <b>File Security:</b> Safe static inspection without running files (.exe, .bat, archives, scripts).\n' +
    '• <b>Safe Moderation:</b> Suspicious files are queued for admin decision and never deleted automatically.',
  welcome_help_hint: '💡 Send any message to test auto-reply or send a file for security scanning.',
  admin_detected: '🛡️ <b>Administrator Detected:</b>\nUse /admin to open the Admin Panel, /stats for metrics, and /pending to view review queues.',

  help_title: '📖 <b>Bot Help & Command Reference</b>',
  help_user_commands:
    '<b>User Commands:</b>\n' +
    '/start - Initialize bot and see welcome message\n' +
    '/help - View command list and usage guidance\n' +
    '/menu - Show quick menu\n' +
    '/lang - Change language (Khmer / English)\n\n' +
    '🛡️ <b>File Security Policy:</b>\n' +
    'When potentially dangerous files or scripts are sent, the bot performs non-destructive static analysis and alerts administrators for review. Files are <b>NEVER</b> deleted automatically.',

  help_admin_commands:
    '\n\n<b>Administrator Commands:</b>\n' +
    '/admin - Open interactive Admin Panel\n' +
    '/stats - Display bot statistics and performance metrics\n' +
    '/pending - List files awaiting security review\n' +
    '/keywords - List configured auto-reply keywords\n' +
    '/addkeyword &lt;kw&gt; | &lt;reply&gt; | [matchType] | [priority] - Add keyword\n' +
    '/delkeyword &lt;id&gt; - Remove keyword\n' +
    '/blocked - List blocked/review extensions\n' +
    '/addblocked &lt;.ext&gt; [description] - Add blocked extension\n' +
    '/delblocked &lt;.ext&gt; - Remove blocked extension\n' +
    '/settings - Display chat and system settings\n' +
    '/logs - View recent security and audit logs',

  // Security Alert - User Facing
  alert_user_title: '⚠️ <b>FILE SECURITY ALERT</b>',
  alert_file_label: '📄 <b>File:</b>',
  alert_type_label: '🔒 <b>Type:</b>',
  alert_risk_label: '⚠️ <b>Risk:</b>',
  alert_impact_label: '💥 <b>Potential Impact:</b>',
  alert_analysis_label: '🔍 <b>Analysis:</b>',
  alert_sha256_label: '🔐 <b>SHA-256:</b>',
  alert_disclaimer:
    '⚠️ <i>This analysis describes potential capabilities and detected indicators. It does NOT prove that this specific file is malicious.</i>',
  alert_status_waiting:
    '🛡️ <b>Status:</b>\nWaiting for administrator review.\nThe file has <b>NOT</b> been automatically deleted.',

  // Security Alert - Admin Facing
  alert_admin_title: '🚨 <b>DETAILED FILE SECURITY ANALYSIS</b>',
  admin_user_label: '👤 <b>User:</b>',
  admin_userid_label: '🆔 <b>User ID:</b>',
  admin_chat_label: '💬 <b>Chat:</b>',
  admin_filename_label: '📄 <b>Filename:</b>',
  admin_ext_label: '🔒 <b>Extension:</b>',
  admin_size_label: '📦 <b>Size:</b>',
  admin_filetype_label: '🧬 <b>File Type:</b>',
  admin_arch_label: '💻 <b>Architecture:</b>',
  admin_sig_label: '🔏 <b>Digital Signature:</b>',
  admin_indicators_label: '🔍 <b>Indicators:</b>',
  admin_impact_label: '💥 <b>Potential Impact:</b>',
  admin_scanner_label: '🛡️ <b>Scanner:</b>',
  admin_scanner_unconfigured: 'NOT CONFIGURED',
  admin_status_pending: '⏳ <b>Status:</b> <b>PENDING REVIEW</b>',

  // Buttons
  btn_delete: '🗑 DELETE',
  btn_allow: '✅ ALLOW',
  btn_ignore: '❌ IGNORE',
  btn_back_admin: '🔙 Back to Admin Panel',

  // Admin Panel Buttons
  panel_title: '🛠 <b>ADMIN PANEL</b>',
  panel_desc: 'Choose an action from the options below to configure policies or review files:',
  panel_btn_pending: '🚨 Pending Reviews',
  panel_btn_autoreply: '🤖 Auto Reply',
  panel_btn_keywords: '🔑 Keywords',
  panel_btn_protection: '🛡️ File Protection',
  panel_btn_extensions: '📁 Extensions',
  panel_btn_stats: '📊 Statistics',
  panel_btn_settings: '⚙️ Settings',
  panel_btn_logs: '📝 Logs',

  // Moderation responses
  mod_unauthorized: '⛔ Unauthorized: Only authorized administrators can moderate.',
  mod_already_reviewed: '⚠️ This file has already been reviewed.',
  mod_deleted_success: '🗑 <b>Message deleted by</b>',
  mod_allowed_success: '✅ <b>File approved by</b>',
  mod_ignored_success: '❌ <b>Review ignored by</b> (No action taken)',
  mod_delete_permission_error:
    '⚠️ Status set to DELETED, but unable to delete the message on Telegram.\n\nReason: Bot does not have the required Telegram permission or message is too old.',

  // Rate Limiting
  rate_limit_alert: '⚡ <b>Rate Limit Exceeded:</b> You are sending messages too quickly. Please slow down and wait a few seconds.',

  // Language selection
  lang_choose: '🌐 <b>Please choose your language / សូមជ្រើសរើសភាសា:</b>',
  lang_changed_km: '✅ បានប្តូរភាសាទៅជា <b>ភាសាខ្មែរ</b> ដោយជោគជ័យ!',
  lang_changed_en: '✅ Language changed to <b>English</b> successfully!',

  // Risk translation mapping
  risk_critical: '🔴 CRITICAL',
  risk_high: '🔴 HIGH',
  risk_medium: '🟡 MEDIUM',
  risk_low: '🟢 LOW',
  risk_unknown: '⚪ UNKNOWN',

  // Common impacts translated
  impact_windows_exec: 'Can execute native binary machine code on Windows',
  impact_launch_process: 'Can launch additional processes',
  impact_file_mod: 'Can create, modify, or delete files',
  impact_network: 'Can communicate with external services or transmit data',
  impact_compromise: 'If malicious, software could potentially compromise user data or system resources',
  impact_double_ext: 'A user could mistake the file for a normal document and unintentionally run it',
  impact_script_cmd: 'Can execute script commands directly on the operating system',
  impact_registry: 'Contains commands that can alter system registry or configure persistence',
  impact_archive_exec: 'Contains one or more executable or script files inside the archive',
  impact_zip_bomb: 'Exhibits characteristics of an archive bomb (abnormal decompression ratio/size)',
};
