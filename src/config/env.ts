import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ADMIN_IDS: z
    .string()
    .default('')
    .transform(val =>
      val
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0)
        .map(id => BigInt(id))
    ),
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  WEBHOOK_URL: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),
  PORT: z.coerce.number().default(3000),

  MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  MAX_ARCHIVE_ENTRIES: z.coerce.number().default(1000),
  MAX_ARCHIVE_EXTRACTED_SIZE_MB: z.coerce.number().default(200),
  FILE_SCAN_TIMEOUT_SECONDS: z.coerce.number().default(30),

  AUTO_REPLY_ENABLED: z
    .string()
    .default('true')
    .transform(v => v.toLowerCase() === 'true'),
  FILE_PROTECTION_ENABLED: z
    .string()
    .default('true')
    .transform(v => v.toLowerCase() === 'true'),
  ARCHIVE_SCANNING_ENABLED: z
    .string()
    .default('true')
    .transform(v => v.toLowerCase() === 'true'),
  ADMIN_NOTIFICATIONS_ENABLED: z
    .string()
    .default('true')
    .transform(v => v.toLowerCase() === 'true'),

  // Mandatory Safety Rules - Default strictly to false
  AUTO_DELETE: z
    .string()
    .default('false')
    .transform(v => v.toLowerCase() === 'true'),
  AUTO_BAN: z
    .string()
    .default('false')
    .transform(v => v.toLowerCase() === 'true'),
  AUTO_KICK: z
    .string()
    .default('false')
    .transform(v => v.toLowerCase() === 'true'),
  AUTO_MUTE: z
    .string()
    .default('false')
    .transform(v => v.toLowerCase() === 'true'),
  AUTO_RESTRICT: z
    .string()
    .default('false')
    .transform(v => v.toLowerCase() === 'true'),
  ADMIN_APPROVAL_REQUIRED: z
    .string()
    .default('true')
    .transform(v => v.toLowerCase() === 'true'),

  RATE_LIMIT_USER_MESSAGES: z.coerce.number().default(10),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(10),

  // Google Gemini AI Configuration
  GEMINI_API_KEY: z
    .string()
    .optional()
    .transform(v => (v ? v.replace(/[\r\n\s]+/g, '').trim() : undefined)),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  AI_AUTO_REPLY_ENABLED: z
    .string()
    .default('true')
    .transform(v => v.toLowerCase() === 'true'),

  // VirusTotal Threat Intelligence Configuration
  VIRUSTOTAL_API_KEY: z
    .string()
    .optional()
    .transform(v => (v ? v.replace(/[\r\n\s]+/g, '').trim() : undefined)),

  // Cloud Quarantine Storage (Cloudflare R2 / AWS S3)
  QUARANTINE_STORAGE_ENABLED: z
    .string()
    .default('false')
    .transform(v => v.toLowerCase() === 'true'),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default('auto'),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

export function getEnv(): Env {
  if (!parsedEnv) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const formatted = result.error.format();
      // Format validation errors cleanly
      throw new Error(`Environment validation error: ${JSON.stringify(formatted, null, 2)}`);
    }
    parsedEnv = result.data;
  }
  return parsedEnv;
}

export const env = {
  get current() {
    return getEnv();
  },
};
