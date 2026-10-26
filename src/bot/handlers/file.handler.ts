import { getEnv } from '../../config/env.js';
import { aiService } from '../../services/ai.service.js';
import { fileProtectionService } from '../../services/fileProtection.service.js';
import type { BotContext } from '../../types/index.js';
import { auditLogger, logger } from '../../utils/logger.js';

export async function handleDocumentMessage(ctx: BotContext): Promise<void> {
  const doc = ctx.message?.document || ctx.businessMessage?.document;
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
  const msg = ctx.message || ctx.businessMessage;
  const isVoice = Boolean(msg?.voice);
  const media = msg?.video || msg?.audio || msg?.voice;
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
            const senderName = msg?.from?.first_name || 'ភ្ញៀវ';
            const senderHandle = msg?.from?.username ? `@${msg.from.username}` : `ID: ${msg?.from?.id}`;

            // Deliver silently to Private Archive Channel so SOCHEAT can read it
            const channelId = await channelArchiveService.getChannelId();
            if (channelId) {
              await ctx.api.sendMessage(
                channelId,
                `🎙️ <b>[សំឡេងជាអក្សរ - VOICE TRANSCRIPTION]</b>\n\n` +
                `👤 <b>អ្នកផ្ញើ៖</b> ${senderName} (${senderHandle})\n` +
                `💬 <b>ខ្លឹមសារ៖</b> <i>"${transcription.transcript}"</i>\n\n` +
                `💡 <b>សេចក្តីសង្ខេប៖</b> ${transcription.summaryKhmer}`,
                { parse_mode: 'HTML' }
              ).catch(() => {});
            }
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

import { channelArchiveService } from '../../services/channelArchive.service.js';

export async function handlePhotoMessage(ctx: BotContext): Promise<void> {
  const incoming = ctx.message || ctx.businessMessage;
  const photos = incoming?.photo;
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

    // 1. Check for Bank Slip / Payment Receipt
    const slip = await aiService.analyzeBankSlip(buffer, 'image/jpeg');

    if (slip && slip.isBankSlip && slip.status === 'VERIFIED') {
      // Archive bank slip silently to Private Channel (Do NOT reply into user chat)
      if (ctx.chat) {
        await channelArchiveService.archiveBankSlip(
          ctx.api,
          slip,
          photo.file_id,
          incoming?.from?.first_name || 'ភ្ញៀវ',
          String(ctx.chat.id)
        );
      }
      return;
    }

    // 2. Check for QR Code (Phishing, Telegram Login Hijacking, or Bakong Payment)
    const qr = await aiService.analyzeQrCode(buffer, 'image/jpeg');
    if (qr && qr.isQrCode) {
      const escape = (s?: string) => (s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'N/A');

      if (qr.qrType === 'TELEGRAM_LOGIN' || qr.isPhishingOrSuspicious) {
        // Alert Admin directly in Telegram PM so SOCHEAT knows without replying in chat
        const sender = incoming?.from?.first_name || 'ភ្ញៀវ';
        const senderHandle = incoming?.from?.username ? `@${incoming.from.username}` : `ID: ${incoming?.from?.id || 'unknown'}`;

        for (const adminId of env.ADMIN_IDS) {
          try {
            await ctx.api.sendMessage(
              adminId.toString(),
              `🚨 <b>ការព្រមាន DANGEROUS QR CODE!</b>\n\n` +
              `👤 <b>អ្នកផ្ញើ៖</b> ${sender} (${senderHandle})\n` +
              `⚠️ <b>ប្រភេទ QR៖</b> <code>${qr.qrType}</code>\n` +
              `🔴 <b>កម្រិតគ្រោះថ្នាក់៖</b> <b>CRITICAL (លួចគណនី Telegram Login)</b>\n` +
              `🔍 <b>កូដ៖</b> <code>${escape(qr.decodedContent)}</code>\n` +
              `💡 <b>វិភាគ៖</b> ${qr.summaryKhmer}\n\n` +
              `❌ <i>សូមកុំស្កេនរូបភាព QR នេះជាដាច់ខាត!</i>`,
              { parse_mode: 'HTML' }
            );
          } catch {
            // ignore send error
          }
        }

        if (ctx.chat) {
          await channelArchiveService.archiveSecurityThreat(ctx.api, {
            type: 'MALICIOUS_QR',
            title: 'Dangerous QR Code Detected',
            item: qr.decodedContent || 'Telegram Login QR',
            riskLevel: 'CRITICAL',
            detectionReason: qr.threatDetails || qr.summaryKhmer,
            senderId: String(incoming?.from?.id || 'unknown'),
            chatId: String(ctx.chat.id),
          });
        }
        return;
      }

      if (qr.qrType === 'PAYMENT_KHQR') {
        // KHQR payment code recognized - silently record or ignore (No reply in chat)
        return;
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error in handlePhotoMessage');
  }
}
