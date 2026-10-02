import { PrismaClient } from '@prisma/client';
import { DEFAULT_BLOCKED_EXTENSIONS } from '../src/config/constants.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding initial database records...');

  // 1. Seed Default Blocked Extensions
  for (const ext of DEFAULT_BLOCKED_EXTENSIONS) {
    await prisma.blockedExtension.upsert({
      where: { extension: ext },
      create: {
        extension: ext,
        enabled: true,
        description: 'Default blocked extension requiring security review',
      },
      update: {},
    });
  }
  console.log('✅ Blocked extensions seeded.');

  // 2. Seed Default Auto-Reply Keywords
  const defaultKeywords = [
    {
      keyword: 'hello',
      reply: '👋 Hello! How can I help you today?',
      matchType: 'CONTAINS' as const,
      priority: 10,
    },
    {
      keyword: 'hi',
      reply: '👋 Hello! Welcome. Send any question or upload a file for analysis.',
      matchType: 'EXACT' as const,
      priority: 10,
    },
    {
      keyword: 'price',
      reply: '💰 Please send the product name and I will help you check the price.',
      matchType: 'CONTAINS' as const,
      priority: 20,
    },
    {
      keyword: 'help',
      reply: '📖 Type /help to see all available commands and bot features.',
      matchType: 'EXACT' as const,
      priority: 5,
    },
    // Khmer Auto-Reply Keywords
    {
      keyword: 'សួស្តី',
      reply: '👋 សួស្តី! តើខ្ញុំអាចជួយអ្វីអ្នកបានទេថ្ងៃនេះ?',
      matchType: 'CONTAINS' as const,
      priority: 15,
    },
    {
      keyword: 'ជម្រាបសួរ',
      reply: '🙏 ជម្រាបសួរ! សូមស្វាគមន៍មកកាន់ប្រព័ន្ធឆ្លើយតប និងត្រួតពិនិត្យសុវត្ថិភាពឯកសារ។',
      matchType: 'CONTAINS' as const,
      priority: 15,
    },
    {
      keyword: 'ជំនួយ',
      reply: '📖 វាយពាក្យ /help ដើម្បីមើលបញ្ជីពាក្យបញ្ជា ឬ /admin សម្រាប់ផ្ទាំងគ្រប់គ្រង។',
      matchType: 'CONTAINS' as const,
      priority: 10,
    },
    {
      keyword: 'សុវត្ថិភាព',
      reply: '🛡️ Bot នេះមានប្រព័ន្ធការពារ និងវិភាគឯកសារ (PE, Scripts, Archives) ដោយមិនបើកដំណើរការឯកសារនោះឡើយ។',
      matchType: 'CONTAINS' as const,
      priority: 10,
    },
  ];

  for (const kw of defaultKeywords) {
    const existing = await prisma.keyword.findFirst({
      where: { keyword: kw.keyword, chatId: null },
    });
    if (!existing) {
      await prisma.keyword.create({
        data: {
          keyword: kw.keyword,
          reply: kw.reply,
          matchType: kw.matchType,
          priority: kw.priority,
          enabled: true,
        },
      });
    }
  }
  console.log('✅ Default auto-reply keywords seeded.');

  // 3. Seed Default Bot Settings (Universal Busy Mode Auto-Reply)
  await prisma.botSetting.upsert({
    where: { key: 'BUSY_MODE' },
    create: {
      key: 'BUSY_MODE',
      value: 'true',
      description: 'Enable universal busy auto-reply',
    },
    update: {},
  });

  await prisma.botSetting.upsert({
    where: { key: 'BUSY_REPLY_TEXT' },
    create: {
      key: 'BUSY_REPLY_TEXT',
      value: 'BOT_Reply: សូមរងចាំការឆ្លើយ ពី SOCHEAT ពេលនេះគាត់កំពុងជាប់រវល់។',
      description: 'Universal busy reply message',
    },
    update: {},
  });

  await prisma.botSetting.upsert({
    where: { key: 'FALLBACK_REPLY_TEXT' },
    create: {
      key: 'FALLBACK_REPLY_TEXT',
      value: 'BOT_Reply: សូមរងចាំការឆ្លើយ ពី SOCHEAT ពេលនេះគាត់កំពុងជាប់រវល់។',
      description: 'Fallback reply message',
    },
    update: {},
  });
  console.log('✅ Default bot settings seeded.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
