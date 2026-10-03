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
            const replyMsg =
              `🎙️ <b>បម្លែងសំឡេងជាអក្សរ (Voice Note Transcription)៖</b>\n\n` +
              `<i>"${transcription.transcript}"</i>\n\n` +
              `💡 <b>សេចក្តីសង្ខេប៖</b> ${transcription.summaryKhmer}`;

            const businessConnId = ctx.businessMessage?.business_connection_id;
            await ctx.reply(replyMsg, {
              ...(businessConnId ? { business_connection_id: businessConnId } : {}),
              reply_to_message_id: msg?.message_id,
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
        reply_to_message_id: incoming?.message_id,
        parse_mode: 'HTML',
      });

      // Archive bank slip to Private Channel
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
        const warning = [
          `🚨 <b>ការព្រមានសុវត្ថិភាព QR CODE (DANGEROUS QR PHISHING ALERT)</b>`,
          ``,
          `⚠️ <b>ប្រភេទ QR៖</b> <code>${qr.qrType}</code>`,
          `🔴 <b>កម្រិតគ្រោះថ្នាក់៖</b> <b>CRITICAL (គ្រោះថ្នាក់ខ្ពស់បំផុត)</b>`,
          qr.qrType === 'TELEGRAM_LOGIN'
            ? `❌ <b>ការព្រមានជាបន្ទាន់៖ នេះជា Telegram Login QR Code! ប្រសិនបើអ្នកស្កេន ជនខិលខូចនឹងអាចលួចគ្រប់គ្រងគណនី Telegram របស់អ្នកភ្លាមៗ (Account Takeover)!</b>\n`
            : '',
          `🔍 <b>ខ្លឹមសារកូដ៖</b> <code>${escape(qr.decodedContent)}</code>`,
          `💡 <b>ការវិភាគ៖</b> ${qr.summaryKhmer}`,
          ``,
          `❌ <b>សូមកុំស្កេន QR Code នេះជាដាច់ខាត!</b>`,
        ].filter(Boolean).join('\n');

        await ctx.reply(warning, {
          reply_to_message_id: incoming?.message_id,
          parse_mode: 'HTML',
        });

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
        await ctx.reply(
          `💳 <b>បានស្គាល់ QR កូដទូទាត់ប្រាក់ (Payment KHQR)</b>\n\n` +
          `• <b>ទិន្នន័យ៖</b> <code>${escape(qr.decodedContent)}</code>\n` +
          `• <b>ស្ថានភាព៖</b> មានសុវត្ថិភាព (Safe Payment Code)`,
          {
            reply_to_message_id: incoming?.message_id,
            parse_mode: 'HTML',
          }
        );
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error in handlePhotoMessage');
  }
}
