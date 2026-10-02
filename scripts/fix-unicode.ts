import { prisma } from '../src/database/prisma.js';

async function fix() {
  const khmerText = 'BOT_Reply: សូមរងចាំការឆ្លើយ ពី SOCHEAT ពេលនេះគាត់កំពុងជាប់រវល់។';
  
  await prisma.botSetting.upsert({
    where: { key: 'BUSY_REPLY_TEXT' },
    update: { value: khmerText },
    create: {
      key: 'BUSY_REPLY_TEXT',
      value: khmerText,
      description: 'Universal busy reply message',
    },
  });

  await prisma.botSetting.upsert({
    where: { key: 'FALLBACK_REPLY_TEXT' },
    update: { value: khmerText },
    create: {
      key: 'FALLBACK_REPLY_TEXT',
      value: khmerText,
      description: 'Fallback reply message',
    },
  });

  await prisma.botSetting.upsert({
    where: { key: 'BUSY_MODE' },
    update: { value: 'true' },
    create: {
      key: 'BUSY_MODE',
      value: 'true',
      description: 'Enable universal busy auto-reply',
    },
  });

  console.log('Successfully updated settings with UTF-8 Khmer text!');
  const current = await prisma.botSetting.findMany();
  for (const s of current) {
    console.log(`${s.key} = ${s.value}`);
  }
}

fix()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
