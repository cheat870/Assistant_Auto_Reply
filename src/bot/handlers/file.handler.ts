import { getEnv } from '../../config/env.js';
import { aiService } from '../../services/ai.service.js';
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
  const isVoice = Boolean(ctx.message?.voice);
  const media = ctx.message?.video || ctx.message?.audio || ctx.message?.voice;
  if (!media) return;

  // AI Voice-to-Text Transcription for voice notes
  if (isVoice && aiService.isAvailable()) {
    try {
      const tgFile = await ctx.api.getFile(media.file_id);
      if (tgFile.file_path) {
        const env = getEnv();
        const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${tgFile.file_path}`;
        const res = await fetch(url);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          const transcription = await aiService.transcribeVoiceNote(buffer, media.mime_type || 'audio/ogg');
          if (transcription) {
            const replyMsg =
              `🎙️ <b>បម្លែងសំឡេងជាអក្សរ (Voice Note Transcription)៖</b>\n\n` +
              `<i>"${transcription.transcript}"</i>\n\n` +
              `💡 <b>សេចក្តីសង្ខេប៖</b> ${transcription.summaryKhmer}`;

            await ctx.reply(replyMsg, {
              reply_to_message_id: ctx.message?.message_id,
              parse_mode: 'HTML',
            });
            return;
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error transcribing voice note');
    }
  }

  let filename: string | undefined;
  if ('file_name' in media && typeof media.file_name === 'string') {
    filename = media.file_name;
  } else if ('title' in media && typeof media.title === 'string') {
    filename = `${media.title}.mp3`;
  } else if (isVoice) {
    filename = 'voice_note.ogg';
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

export async function handlePhotoMessage(ctx: BotContext): Promise<void> {
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return;

  if (!aiService.isAvailable()) return;

  try {
    // Get highest resolution photo (last element in array)
    const photo = photos[photos.length - 1]!;
    const tgFile = await ctx.api.getFile(photo.file_id);
    if (!tgFile.file_path) return;

    const env = getEnv();
    const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${tgFile.file_path}`;
    const res = await fetch(url);
    if (!res.ok) return;

    const buffer = Buffer.from(await res.arrayBuffer());
    const slip = await aiService.analyzeBankSlip(buffer, 'image/jpeg');

    if (slip && slip.isBankSlip && slip.status === 'VERIFIED') {
      const msg =
        `🧾 <b>បានរកឃើញវិក្កយបត្រផ្ទេរប្រាក់ (Bank Transfer Detected)</b>\n\n` +
        `• <b>ធនាគារ៖</b> ${slip.bankName || 'Unknown Bank'}\n` +
        `• <b>ចំនួនទឹកប្រាក់៖</b> <b>${slip.amount || 'N/A'} ${slip.currency || ''}</b>\n` +
        `• <b>លេខកូដប្រតិបត្តិការ (TxID)៖</b> <code>${slip.transactionId || 'N/A'}</code>\n` +
        (slip.senderName ? `• <b>អ្នកផ្ញើ៖</b> ${slip.senderName}\n` : '') +
        (slip.receiverName ? `• <b>អ្នកទទួល៖</b> ${slip.receiverName}\n` : '') +
        (slip.dateTime ? `• <b>កាលបរិច្ឆេទ៖</b> ${slip.dateTime}\n` : '') +
        `\n✅ <b>ស្ថានភាព៖</b> វិក្កយបត្រត្រឹមត្រូវ (បានកត់ត្រាទុកជូន SOCHEAT រួចរាល់)`;

      await ctx.reply(msg, {
        reply_to_message_id: ctx.message?.message_id,
        parse_mode: 'HTML',
      });
    }
  } catch (err) {
    logger.error({ err }, 'Error in handlePhotoMessage');
  }
}
