export const km = {
  // Public user commands
  welcome_title: '👋 សូមស្វាគមន៍មកកាន់ប្រព័ន្ធស្វ័យប្រវត្តិ និងត្រួតពិនិត្យសុវត្ថិភាពឯកសារ!',
  welcome_features:
    '🤖 <b>មុខងារចម្បង៖</b>\n' +
    '• <b>ឆ្លើយតបស្វ័យប្រវត្តិ (Chat Automation):</b> ឆ្លើយតបសំណួរ និងពាក្យគន្លឹះទូទៅភ្លាមៗ។\n' +
    '• <b>សុវត្ថិភាពឯកសារ (File Security):</b> វិភាគសុវត្ថិភាពបែប Static ដោយមិនបើកដំណើរការឯកសារ (.exe, .bat, archives, scripts)។\n' +
    '• <b>ការសម្រេចចិត្តដោយសុវត្ថិភាព:</b> ឯកសារត្រូវបានវិភាគ និងដាក់ក្នុងជួររង់ចាំការសម្រេចពី Admin ដោយមិនលុបដោយស្វ័យប្រវត្តិនោះទេ។',
  welcome_help_hint: '💡 ផ្ញើសារដើម្បីសាកល្បងការឆ្លើយតបស្វ័យប្រវត្តិ ឬផ្ញើឯកសារដើម្បីស្កេនសុវត្ថិភាព។',
  admin_detected: '🛡️ <b>បានរកឃើញសិទ្ធិជាអ្នកគ្រប់គ្រង (Admin):</b>\nប្រើ /admin ដើម្បីបើកផ្ទាំងគ្រប់គ្រង, /stats មើលស្ថិតិ, និង /pending ដើម្បីពិនិត្យឯកសាររង់ចាំ។',

  help_title: '📖 <b>សៀវភៅណែនាំ និងបញ្ជីពាក្យបញ្ជា (Help Reference)</b>',
  help_user_commands:
    '<b>ពាក្យបញ្ជាសម្រាប់អ្នកប្រើប្រាស់ទូទៅ៖</b>\n' +
    '/start - ចាប់ផ្តើម និងមើលសារស្វាគមន៍\n' +
    '/help - មើលបញ្ជីពាក្យបញ្ជា និងការណែនាំ\n' +
    '/menu - បង្ហាញម៉ឺនុយរហ័ស\n' +
    '/lang - ផ្លាស់ប្តូរភាសា (ភាសាខ្មែរ / English)\n\n' +
    '🛡️ <b>គោលការណ៍សុវត្ថិភាពឯកសារ៖</b>\n' +
    'នៅពេលមានឯកសារដែលគួរឱ្យសង្ស័យ Bot នឹងវិភាគលក្ខណៈបច្ចេកទេសដោយសុវត្ថិភាព និងជូនដំណឹងទៅ Admin ត្រួតពិនិត្យ។ ឯកសារនឹង <b>មិនត្រូវបានលុបចោលដោយស្វ័យប្រវត្តិ</b> ឡើយ។',

  help_admin_commands:
    '\n\n<b>ពាក្យបញ្ជាសម្រាប់អ្នកគ្រប់គ្រង (Admin Commands)៖</b>\n' +
    '/admin - បើកផ្ទាំងបញ្ជា Admin Panel\n' +
    '/stats - បង្ហាញស្ថិតិប្រព័ន្ធ និងការវិភាគ\n' +
    '/pending - មើលបញ្ជីឯកសារដែលរង់ចាំការត្រួតពិនិត្យ\n' +
    '/keywords - មើលបញ្ជីពាក្យគន្លឹះឆ្លើយតបស្វ័យប្រវត្តិ\n' +
    '/addkeyword &lt;ពាក្យ&gt; | &lt;ចម្លើយ&gt; | [matchType] | [priority] - បន្ថែមពាក្យគន្លឹះ\n' +
    '/delkeyword &lt;id&gt; - លុបពាក្យគន្លឹះ\n' +
    '/blocked - បង្ហាញកន្ទុយឯកសារដែលស្ថិតក្រោមការតាមដាន\n' +
    '/addblocked &lt;.ext&gt; [ពិពណ៌នា] - បន្ថែមកន្ទុយឯកសារ\n' +
    '/delblocked &lt;.ext&gt; - លុបកន្ទុយឯកសារ\n' +
    '/settings - បង្ហាញការកំណត់ប្រព័ន្ធ\n' +
    '/logs - មើលកំណត់ហេតុសវនកម្ម (Audit Logs)',

  // Security Alert - User Facing
  alert_user_title: '⚠️ <b>ការជូនដំណឹងសុវត្ថិភាពឯកសារ</b>',
  alert_file_label: '📄 <b>ឯកសារ:</b>',
  alert_type_label: '🔒 <b>ប្រភេទ:</b>',
  alert_risk_label: '⚠️ <b>កម្រិតហានិភ័យ:</b>',
  alert_impact_label: '💥 <b>ផលប៉ះពាល់ដែលអាចកើតមាន:</b>',
  alert_analysis_label: '🔍 <b>ការវិភាគបច្ចេកទេស:</b>',
  alert_sha256_label: '🔐 <b>លេខកូដ SHA-256:</b>',
  alert_disclaimer:
    '⚠️ <i>ការវិភាគនេះបង្ហាញពីលក្ខណៈបច្ចេកទេស និងសមត្ថភាពរបស់ឯកសារប៉ុណ្ណោះ។ វាមិនមែនជាការបញ្ជាក់ថាឯកសារនេះជាមេរោគនោះទេ។</i>',
  alert_status_waiting:
    '🛡️ <b>ស្ថានភាព:</b>\nកំពុងរង់ចាំការត្រួតពិនិត្យពីអ្នកគ្រប់គ្រង (Admin)។\nឯកសារ <b>មិនត្រូវបានលុបដោយស្វ័យប្រវត្តិ</b> នោះទេ។',

  // Security Alert - Admin Facing
  alert_admin_title: '🚨 <b>របាយការណ៍វិភាគសុវត្ថិភាពឯកសារលម្អិត</b>',
  admin_user_label: '👤 <b>អ្នកផ្ញើ:</b>',
  admin_userid_label: '🆔 <b>លេខសម្គាល់:</b>',
  admin_chat_label: '💬 <b>ការសន្ទនា:</b>',
  admin_filename_label: '📄 <b>ឈ្មោះឯកសារ:</b>',
  admin_ext_label: '🔒 <b>កន្ទុយឯកសារ:</b>',
  admin_size_label: '📦 <b>ទំហំ:</b>',
  admin_filetype_label: '🧬 <b>ប្រភេទឯកសារ:</b>',
  admin_arch_label: '💻 <b>ស្ថាបត្យកម្ម:</b>',
  admin_sig_label: '🔏 <b>ហត្ថលេខាឌីជីថល:</b>',
  admin_indicators_label: '🔍 <b>សញ្ញាសម្គាល់ (Indicators):</b>',
  admin_impact_label: '💥 <b>ផលប៉ះពាល់ (Potential Impact):</b>',
  admin_scanner_label: '🛡️ <b>ម៉ាស៊ីនស្កេន:</b>',
  admin_scanner_unconfigured: 'មិនទាន់កំណត់រចនាសម្ព័ន្ធ (NOT CONFIGURED)',
  admin_status_pending: '⏳ <b>ស្ថានភាព:</b> <b>រង់ចាំការត្រួតពិនិត្យ (PENDING REVIEW)</b>',

  // Buttons
  btn_delete: '🗑 លុបចោល (DELETE)',
  btn_allow: '✅ អនុញ្ញាត (ALLOW)',
  btn_ignore: '❌ មើលរំលង (IGNORE)',
  btn_back_admin: '🔙 ត្រឡប់ទៅផ្ទាំង Admin',

  // Admin Panel Buttons
  panel_title: '🛠 <b>ផ្ទាំងគ្រប់គ្រងអ្នកគ្រប់គ្រង (ADMIN PANEL)</b>',
  panel_desc: 'សូមជ្រើសរើសផ្នែកខាងក្រោមដើម្បីកំណត់រចនាសម្ព័ន្ធ ឬត្រួតពិនិត្យសុវត្ថិភាព៖',
  panel_btn_pending: '🚨 ឯកសាររង់ចាំត្រួតពិនិត្យ',
  panel_btn_autoreply: '🤖 ឆ្លើយតបស្វ័យប្រវត្តិ',
  panel_btn_keywords: '🔑 ពាក្យគន្លឹះ (Keywords)',
  panel_btn_protection: '🛡️ ការពារឯកសារ',
  panel_btn_extensions: '📁 កន្ទុយឯកសារ',
  panel_btn_stats: '📊 ស្ថិតិប្រព័ន្ធ',
  panel_btn_settings: '⚙️ ការកំណត់',
  panel_btn_logs: '📝 កំណត់ហេតុ (Logs)',

  // Moderation responses
  mod_unauthorized: '⛔ គ្មានសិទ្ធិ: មានតែអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចសម្រេចបាន។',
  mod_already_reviewed: '⚠️ ឯកសារនេះត្រូវបានត្រួតពិនិត្យរួចរាល់ហើយ។',
  mod_deleted_success: '🗑 <b>សារត្រូវបានលុបចេញដោយ</b>',
  mod_allowed_success: '✅ <b>ឯកសារត្រូវបានអនុញ្ញាតដោយ</b>',
  mod_ignored_success: '❌ <b>ការត្រួតពិនិត្យត្រូវបានមើលរំលងដោយ</b> (គ្មានសកម្មភាព)',
  mod_delete_permission_error:
    '⚠️ បានប្តូរស្ថានភាពទៅជា DELETED ប៉ុន្តែមិនអាចលុបសារនៅលើ Telegram បានទេ។\n\nមូលហេតុ: Bot មិនមានសិទ្ធិ Delete Messages នៅក្នុងក្រុម ឬសារនេះមានរយៈពេលយូរពេក។',

  // Rate Limiting
  rate_limit_alert: '⚡ <b>លើសកម្រិតកំណត់:</b> អ្នកកំពុងផ្ញើសារលឿនពេកហើយ។ សូមរង់ចាំបន្តិចសិន។',

  // Language selection
  lang_choose: '🌐 <b>សូមជ្រើសរើសភាសា / Please choose your language:</b>',
  lang_changed_km: '✅ បានប្តូរភាសាទៅជា <b>ភាសាខ្មែរ</b> ដោយជោគជ័យ!',
  lang_changed_en: '✅ Language changed to <b>English</b> successfully!',

  // Risk translation mapping
  risk_critical: '🔴 ខ្ពស់បំផុត (CRITICAL)',
  risk_high: '🔴 ខ្ពស់ (HIGH)',
  risk_medium: '🟡 មធ្យម (MEDIUM)',
  risk_low: '🟢 ទាប (LOW)',
  risk_unknown: '⚪ មិនច្បាស់ (UNKNOWN)',

  // Common impacts translated
  impact_windows_exec: 'អាចដំណើរការកូដកម្មវិធីនៅលើប្រព័ន្ធប្រតិបត្តិការ Windows',
  impact_launch_process: 'អាចបើកដំណើរការកម្មវិធី ឬ process ផ្សេងទៀត',
  impact_file_mod: 'អាចបង្កើត កែប្រែ ឬលុបឯកសារនៅលើប្រព័ន្ធ',
  impact_network: 'អាចភ្ជាប់ទំនាក់ទំនង ឬបញ្ជូនទិន្នន័យទៅកាន់សេវាកម្មខាងក្រៅ',
  impact_compromise: 'បើសិនជាឯកសារបង្កប់មេរោគ វាអាចលួចទិន្នន័យ ឬប៉ះពាល់សុវត្ថិភាពប្រព័ន្ធ',
  impact_double_ext: 'អាចធ្វើឱ្យអ្នកប្រើប្រាស់ភ័ន្តច្រឡំថាជាឯកសារទូទៅ ហើយចុចបើកវា',
  impact_script_cmd: 'អាចដំណើរការបញ្ជា script ដោយផ្ទាល់លើប្រព័ន្ធប្រតិបត្តិការ',
  impact_registry: 'មានពាក្យបញ្ជាដែលអាចកែប្រែ Registry ឬកំណត់ persistence',
  impact_archive_exec: 'មានផ្ទុកឯកសារកម្មវិធី ឬ script នៅខាងក្នុង Archive',
  impact_zip_bomb: 'មានលក្ខណៈដូច Zip Bomb (ទំហំផ្ទុះធំខុសប្រក្រតី)',
};
