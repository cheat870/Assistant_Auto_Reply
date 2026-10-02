import { fileProtectionService } from '../../services/fileProtection.service.js';
import type { BotContext } from '../../types/index.js';
import { auditLogger, logger } from '../../utils/logger.js';

export async function handleDocumentMessage(ctx: BotContext): Promise<void> {
  const doc = ctx.message?.document;
  if (!doc) return;

  const filename = doc.file_name || 'unnamed_file';
  const sizeBytes = doc.file_size || 0;
  const mimeType = doc.mime_type;
  const fileId = doc.file_id;

  if (ctx.chat && ctx.from) {
    auditLogger.fileReceived(ctx.chat.id, ctx.from.id, filename, sizeBytes);
  }

  try {
    await fileProtectionService.processIncomingFile(ctx, {
      fileId,
      filename,
      mimeType,
      sizeBytes,
    });
  } catch (err) {
    logger.error({ err, filename }, 'Error handling document message');
  }
}

export async function handleAudioOrVideoMessage(ctx: BotContext): Promise<void> {
  const media = ctx.message?.video || ctx.message?.audio || ctx.message?.voice;
  if (!media) return;

  let filename: string | undefined;
  if ('file_name' in media && typeof media.file_name === 'string') {
    filename = media.file_name;
  } else if ('title' in media && typeof media.title === 'string') {
    filename = `${media.title}.mp3`;
  }

  if (!filename) return;

  const sizeBytes = media.file_size || 0;
  const mimeType = media.mime_type;
  const fileId = media.file_id;

  try {
    await fileProtectionService.processIncomingFile(ctx, {
      fileId,
      filename,
      mimeType,
      sizeBytes,
    });
  } catch (err) {
    logger.error({ err, filename }, 'Error handling audio/video message');
  }
}
