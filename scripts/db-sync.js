import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL || '';

if (dbUrl && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
  console.log('Detected remote cloud database (Neon/Render). Synchronizing schema...');
  try {
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
    console.log('✅ Remote database schema successfully synchronized!');
  } catch (err) {
    console.warn('⚠️ Warning: Prisma db push encountered an issue, continuing build:', err.message);
  }
} else {
  console.log('Local/development environment detected. Skipping remote db push during build.');
}
