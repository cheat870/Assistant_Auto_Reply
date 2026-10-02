import { DEFAULT_BLOCKED_EXTENSIONS } from '../../config/constants.js';
import { normalizeExtension } from '../../utils/extension.js';
import { prisma } from '../prisma.js';

export class BlockedExtensionRepository {
  async seedDefaultsIfEmpty(): Promise<void> {
    const count = await prisma.blockedExtension.count();
    if (count === 0) {
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
    }
  }

  async isExtensionBlocked(ext: string): Promise<boolean> {
    const normalized = normalizeExtension(ext);
    const item = await prisma.blockedExtension.findUnique({
      where: { extension: normalized },
    });
    return item ? item.enabled : false;
  }

  async getAllBlockedExtensions() {
    return prisma.blockedExtension.findMany({
      orderBy: { extension: 'asc' },
    });
  }

  async addExtension(ext: string, description?: string) {
    const normalized = normalizeExtension(ext);
    return prisma.blockedExtension.upsert({
      where: { extension: normalized },
      create: {
        extension: normalized,
        enabled: true,
        description,
      },
      update: {
        enabled: true,
        description: description || undefined,
      },
    });
  }

  async removeExtension(ext: string) {
    const normalized = normalizeExtension(ext);
    return prisma.blockedExtension.delete({
      where: { extension: normalized },
    });
  }
}

export const blockedExtensionRepository = new BlockedExtensionRepository();
