import { GoogleGenAI } from '@google/genai';
import { getEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface BankSlipAnalysis {
  isBankSlip: boolean;
  bankName?: string;
  amount?: string;
  currency?: string;
  transactionId?: string;
  senderName?: string;
  receiverName?: string;
  dateTime?: string;
  status: 'VERIFIED' | 'SUSPICIOUS' | 'UNCLEAR' | 'NOT_A_SLIP';
  summaryKhmer: string;
}

export interface VoiceTranscription {
  transcript: string;
  language: string;
  summaryKhmer: string;
}

export interface QrCodeAnalysis {
  isQrCode: boolean;
  qrType: 'TELEGRAM_LOGIN' | 'PAYMENT_KHQR' | 'URL' | 'TEXT' | 'UNKNOWN' | 'NOT_A_QR';
  decodedContent?: string;
  isPhishingOrSuspicious: boolean;
  threatDetails?: string;
  summaryKhmer: string;
}

export class AiService {
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI | null {
    const env = getEnv();
    if (!env.GEMINI_API_KEY) return null;
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
    return this.client;
  }

  isAvailable(): boolean {
    return Boolean(getEnv().GEMINI_API_KEY);
  }

  /**
   * Tries multiple Gemini models with fallback (e.g. gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-flash)
   */
  private async generateWithFallback(contents: any): Promise<any> {
    const ai = this.getClient();
    if (!ai) return null;

    const env = getEnv();
    const candidateModels = [
      env.GEMINI_MODEL,
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-3.8-pro',
      'gemini-2.5-pro',
      'gemini-3.5-flash-lite',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    let lastError: any = null;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // 1. Try via official Google GenAI SDK
    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
        });
        if (response && response.text) {
          return response;
        }
      } catch (err: any) {
        lastError = err;
        logger.warn({ model, errMsg: err?.message || String(err) }, 'Gemini SDK model attempt failed, trying fallback');
      }
    }

    // 2. Direct REST Fallback (Direct HTTPS fetch with x-goog-api-key and ?key=)
    const apiKey = env.GEMINI_API_KEY?.trim();
    if (apiKey) {
      for (const model of candidateModels) {
        try {
          const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

          let parts: any[] = [];
          if (typeof contents === 'string') {
            parts = [{ text: contents }];
          } else if (Array.isArray(contents)) {
            parts = contents.map(item => {
              if (item.text) return { text: item.text };
              if (item.inlineData) {
                return {
                  inline_data: {
                    mime_type: item.inlineData.mimeType,
                    data: item.inlineData.data,
                  },
                };
              }
              return item;
            });
          }

          let restRes = await fetch(restUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts }],
            }),
          });

          // If Google returns 503 (High Demand spike) or 429, wait 800ms and retry once
          if (restRes.status === 503 || restRes.status === 429) {
            await sleep(800);
            restRes = await fetch(restUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
              },
              body: JSON.stringify({
                contents: [{ parts }],
              }),
            });
          }

          if (restRes.ok) {
            const data = (await restRes.json()) as any;
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              return { text };
            }
          } else {
            const errBody = await restRes.text().catch(() => '');
            logger.warn({ model, status: restRes.status, errBody }, 'Gemini Direct REST returned error');
          }
        } catch (fetchErr: any) {
          logger.warn({ model, fetchErr: fetchErr?.message || String(fetchErr) }, 'Gemini Direct REST fetch error');
        }
      }
    }

    logger.error({ lastError: lastError?.message || lastError }, 'All Gemini SDK and REST candidate models failed');
    return null;
  }

  /**
   * Generates a context-aware polite auto-reply using Gemini AI.
   * Answers user's question in natural Khmer/English and clarifies Socheat is currently occupied.
   */
  async generateSmartAutoReply(
    userText: string,
    senderName: string = 'ភ្ញៀវ'
  ): Promise<string | null> {
    const env = getEnv();
    if (!env.AI_AUTO_REPLY_ENABLED) return null;

    try {
      const prompt = `
You are the personal AI Assistant for SOCHEAT on Telegram.
The user "${senderName}" just sent this message:
"${userText}"

Instructions:
1. Respond politely, helpfully, and concisely strictly in Cambodian Khmer (ភាសាខ្មែរ) using only standard Khmer script (or English if the user wrote in English). NEVER use Burmese, Thai, or any non-Khmer scripts.
2. If the user asks a question (such as prices, services, greeting, status, or basic math/queries), provide a direct, helpful, and courteous response.
3. Inform the user respectfully that SOCHEAT is currently occupied and will reply personally as soon as available.
4. Keep the tone friendly, professional, and trustworthy.
5. End the reply with:
"\n\n🤖 <i>AI Assistant ជំនួស SOCHEAT (គាត់នឹងឆ្លើយតបផ្ទាល់ពេលទំនេរ)</i>"

Output only the reply text formatted cleanly for Telegram.`;

      const response = await this.generateWithFallback(prompt);
      return response?.text?.trim() || null;
    } catch (err) {
      logger.error({ err }, 'Gemini AI Smart Auto-Reply generation failed');
      return null;
    }
  }

  /**
   * Transcribes a Telegram voice note or audio file to text.
   */
  async transcribeVoiceNote(
    audioBuffer: Buffer,
    mimeType: string = 'audio/ogg'
  ): Promise<VoiceTranscription | null> {
    try {
      const prompt = `
Please listen to this audio message carefully and:
1. Transcribe the exact words spoken into text.
2. Identify the language spoken (Khmer, English, etc.).
3. Provide a brief 1-2 sentence summary of what the speaker is asking or saying in Khmer.

Respond in JSON format with fields:
{
  "transcript": "Exact transcription here",
  "language": "Khmer or English etc",
  "summaryKhmer": "សេចក្តីសង្ខេបខ្លីនៃសារសំឡេងជាភាសាខ្មែរ"
}`;

      const response = await this.generateWithFallback([
        {
          inlineData: {
            data: audioBuffer.toString('base64'),
            mimeType,
          },
        },
        { text: prompt },
      ]);

      const raw = response?.text || '';
      if (!raw) return null;
      const cleanJson = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      return {
        transcript: parsed.transcript || raw,
        language: parsed.language || 'Unknown',
        summaryKhmer: parsed.summaryKhmer || 'សារសំឡេងទទួលបានជោគជ័យ។',
      };
    } catch (err) {
      logger.error({ err }, 'Gemini AI Voice Transcription failed');
      return null;
    }
  }

  /**
   * Performs OCR and structure extraction on bank slips and payment receipts (ABA, Bakong KHQR, etc.).
   */
  async analyzeBankSlip(
    imageBuffer: Buffer,
    mimeType: string = 'image/jpeg'
  ): Promise<BankSlipAnalysis | null> {
    try {
      const prompt = `
Analyze this image to determine if it is a bank transfer slip or payment receipt (e.g. ABA Bank, Bakong KHQR, ACLEDA, Wing, Canadia Bank, etc.).
Extract the details accurately into JSON:
{
  "isBankSlip": true,
  "bankName": "Bank name (e.g. ABA Bank / Bakong / Wing)",
  "amount": "Transfer amount (e.g. 50.00)",
  "currency": "USD or KHR",
  "transactionId": "Transaction ID or Ref Number",
  "senderName": "Name of sender if visible",
  "receiverName": "Name of recipient if visible",
  "dateTime": "Date and time of transaction",
  "status": "VERIFIED" | "SUSPICIOUS" | "UNCLEAR" | "NOT_A_SLIP",
  "summaryKhmer": "ការផ្ទេរប្រាក់ចំនួន $X ទៅកាន់ Y តាមរយៈធនាគារ Z"
}
If this image is not a payment receipt/bank slip, set "isBankSlip": false and "status": "NOT_A_SLIP".`;

      const response = await this.generateWithFallback([
        {
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType,
          },
        },
        { text: prompt },
      ]);

      const raw = response?.text || '';
      if (!raw) return null;
      const cleanJson = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed: BankSlipAnalysis = JSON.parse(cleanJson);
      return parsed;
    } catch (err) {
      logger.error({ err }, 'Gemini AI Bank Slip Analysis failed');
      return null;
    }
  }

  /**
   * Decodes and inspects a QR code image to detect phishing, Telegram session hijacking, or payment codes.
   */
  async analyzeQrCode(
    imageBuffer: Buffer,
    mimeType: string = 'image/jpeg'
  ): Promise<QrCodeAnalysis | null> {
    try {
      const prompt = `
Carefully examine this image to determine if it contains a QR code.
If a QR code is detected:
1. Decode the content inside the QR code (extract the URL, login token, text, or payment string).
2. Classify its type:
   - "TELEGRAM_LOGIN": If it looks like a Telegram login QR code (tg://login?token=..., web.telegram.org login, or QR login for Telegram desktop/web). CRITICAL: Unknown Telegram login QRs are used by hackers to hijack personal accounts!
   - "PAYMENT_KHQR": If it is a Cambodian Bakong KHQR, ABA KHQR, or bank payment code.
   - "URL": Any other general website URL.
   - "TEXT": Plain text or data.
   - "UNKNOWN": Other unidentifiable format.
3. Assess if it is a phishing link, malicious URL, or account takeover threat.
4. Output strictly in JSON format:
{
  "isQrCode": true,
  "qrType": "TELEGRAM_LOGIN" | "PAYMENT_KHQR" | "URL" | "TEXT" | "UNKNOWN",
  "decodedContent": "Extracted URL or raw string",
  "isPhishingOrSuspicious": true/false,
  "threatDetails": "Detailed reason why it is safe or dangerous",
  "summaryKhmer": "ការពន្យល់ជាភាសាខ្មែរសុទ្ធសាធ (ហាមប្រើភាសាផ្សេង)"
}
If NO QR code is found in the image, output:
{
  "isQrCode": false,
  "qrType": "NOT_A_QR",
  "isPhishingOrSuspicious": false,
  "summaryKhmer": "មិនមែនជារូបភាព QR Code ឡើយ។"
}`;

      const response = await this.generateWithFallback([
        {
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType,
          },
        },
        { text: prompt },
      ]);

      const raw = response?.text || '';
      if (!raw) return null;
      const cleanJson = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed: QrCodeAnalysis = JSON.parse(cleanJson);
      return parsed;
    } catch (err) {
      logger.error({ err }, 'Gemini AI QR Code Analysis failed');
      return null;
    }
  }
}

export const aiService = new AiService();
