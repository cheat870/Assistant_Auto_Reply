import { prisma } from '../prisma.js';

export class BotSettingRepository {
  async getSetting(key: string): Promise<string | null> {
    const setting = await prisma.botSetting.findUnique({
      where: { key },
    });
    return setting?.value ?? null;
  }

  async setSetting(key: string, value: string, description?: string) {
    return prisma.botSetting.upsert({
      where: { key },
      create: { key, value, description },
      update: { value, description: description || undefined },
    });
  }

  async getAllSettings() {
    return prisma.botSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }
}

export const botSettingRepository = new BotSettingRepository();
