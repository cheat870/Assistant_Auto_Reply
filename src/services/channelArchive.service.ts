import type { Api } from 'grammy';
import { getEnv } from '../config/env.js';
import { botSettingRepository } from '../database/repositories/botSetting.repository.js';
import type { BankSlipAnalysis } from './ai.service.js';
import { logger } from '../utils/logger.js';

export class ChannelArchiveService {
  /**
   * Retrieves the configured private channel ID from DB or environment.
   */
  async getChannelId(): Promise<string | null> {
    try {
      const setting = await botSettingRepository.getSetting('ARCHIVE_CHANNEL_ID');
      if (setting && setting.trim()) {
        return setting.trim();
      }
    } catch {
      // ignore db error
    }

    const env = getEnv();
    return env.ARCHIVE_CHANNEL_ID || null;
  }

  /**
   * Archives a verified bank payment slip to the private channel.
   */
  async archiveBankSlip(
    botApi: Api,
    slip: BankSlipAnalysis,
    photoFileId: string,
    senderName: string,
    chatId: string
  ): Promise<void> {
    const channelId = await this.getChannelId();
    if (!channelId) return;

    try {
      const escape = (s?: string) => (s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'N/A');

      const caption = [
        `🧾 <b>[បណ្ណសារវិក្កយបត្រ - BANK PAYMENT SLIP ARCHIVE]</b>`,
        ``,
        `🏦 <b>ធនាគារ៖</b> ${escape(slip.bankName)}`,
        `💵 <b>ទឹកប្រាក់៖</b> <b>${escape(slip.amount)} ${escape(slip.currency)}</b>`,
        `🆔 <b>លេខប្រតិបត្តិការ (TxID)៖</b> <code>${escape(slip.transactionId)}</code>`,
        `👤 <b>អ្នកផ្ញើ៖</b> ${escape(slip.senderName || senderName)} ➔ <b>អ្នកទទួល៖</b> ${escape(slip.receiverName || 'SOCHEAT')}`,
        `🕒 <b>កាលបរិច្ឆេទ៖</b> ${escape(slip.dateTime || new Date().toLocaleString('km-KH'))}`,
        `💬 <b>សេចក្តីសង្ខេប៖</b> ${escape(slip.summaryKhmer)}`,
        `🆔 <b>Chat ID៖</b> <code>${chatId}</code>`,
      ].join('\n');

      await botApi.sendPhoto(channelId, photoFileId, {
        caption,
        parse_mode: 'HTML',
      });

      logger.info({ channelId, txId: slip.transactionId }, 'Bank slip archived to private channel');
    } catch (err) {
      logger.warn({ err, channelId }, 'Failed to archive bank slip to private channel');
    }
  }

  /**
   * Archives a deleted message and its media to the private channel.
   */
  async archiveDeletedMessage(
    botApi: Api,
    details: {
      senderName?: string | null;
      senderUsername?: string | null;
      senderId?: string;
      chatId: string;
      messageId: number;
      sentAt?: Date;
      deletedAt: Date;
      messageType: string;
      fullText?: string | null;
      mediaFileId?: string | null;
    }
  ): Promise<void> {
    const channelId = await this.getChannelId();
    if (!channelId) return;

    try {
      const escape = (s?: string | null) => (s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '');
      const sender = details.senderName || 'Anonymous';
      const handle = details.senderUsername ? `@${details.senderUsername}` : `ID: ${details.senderId || 'N/A'}`;
      const sentTime = details.sentAt ? details.sentAt.toLocaleString('km-KH') : 'N/A';
      const deleteTime = details.deletedAt.toLocaleString('km-KH');

      const text = [
        `🗑️ <b>[បណ្ណសារសារដែលបានលុប - DELETED MESSAGE ARCHIVE]</b>`,
        ``,
        `👤 <b>អ្នកផ្ញើ៖</b> ${escape(sender)} (${handle})`,
        `💬 <b>ប្រភេទ៖</b> <code>${details.messageType.toUpperCase()}</code>`,
        `🕒 <b>ផ្ញើនៅ៖</b> ${sentTime} | <b>លុបនៅ៖</b> ${deleteTime}`,
        `🆔 <b>Chat ID៖</b> <code>${details.chatId}</code>`,
        ``,
        `📝 <b>ខ្លឹមសារសារដើម៖</b>`,
        `<blockquote>${escape(details.fullText || '[គ្មានអត្ថបទ / Media File]')}</blockquote>`,
      ].join('\n');

      await botApi.sendMessage(channelId, text, { parse_mode: 'HTML' });

      // Forward media if available
      if (details.mediaFileId) {
        try {
          if (details.messageType === 'photo') {
            await botApi.sendPhoto(channelId, details.mediaFileId, {
              caption: `📸 <i>រូបភាពដែលគេបានលុប (Preserved Media)</i>`,
              parse_mode: 'HTML',
            });
          } else if (details.messageType === 'voice') {
            await botApi.sendVoice(channelId, details.mediaFileId, {
              caption: `🎙️ <i>សារសំឡេងដែលគេបានលុប (Preserved Audio)</i>`,
              parse_mode: 'HTML',
            });
          } else if (details.messageType === 'document') {
            await botApi.sendDocument(channelId, details.mediaFileId, {
              caption: `📎 <i>ឯកសារដែលគេបានលុប (Preserved Document)</i>`,
              parse_mode: 'HTML',
            });
          }
        } catch (mediaErr) {
          logger.warn({ mediaErr }, 'Could not forward deleted media to archive channel');
        }
      }
    } catch (err) {
      logger.warn({ err, channelId }, 'Failed to archive deleted message to private channel');
    }
  }

  /**
   * Archives a security threat (malware file or phishing URL) to the private channel.
   */
  async archiveSecurityThreat(
    botApi: Api,
    threat: {
      type: 'MALWARE_FILE' | 'PHISHING_LINK' | 'MALICIOUS_QR';
      title: string;
      item: string;
      riskLevel: string;
      detectionReason: string;
      senderId: string;
      chatId: string;
    }
  ): Promise<void> {
    const channelId = await this.getChannelId();
    if (!channelId) return;

    try {
      const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const text = [
        `🚨 <b>[បណ្ណសារសុវត្ថិភាព - SECURITY THREAT ARCHIVED]</b>`,
        ``,
        `⚠️ <b>ប្រភេទគ្រោះថ្នាក់៖</b> <code>${threat.type}</code>`,
        `🎯 <b>មុខសញ្ញា៖</b> <code>${escape(threat.item)}</code>`,
        `🔴 <b>កម្រិតហានិភ័យ៖</b> <b>${threat.riskLevel}</b>`,
        `🔍 <b>មូលហេតុ៖</b> ${escape(threat.detectionReason)}`,
        `👤 <b>អ្នកផ្ញើ៖</b> <code>${threat.senderId}</code> | Chat: <code>${threat.chatId}</code>`,
      ].join('\n');

      await botApi.sendMessage(channelId, text, { parse_mode: 'HTML' });
    } catch (err) {
      logger.warn({ err, channelId }, 'Failed to archive security threat to private channel');
    }
  }
}

export const channelArchiveService = new ChannelArchiveService();
