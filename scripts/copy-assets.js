import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('src/server/dashboard.html');
const destDir = path.resolve('dist/server');
const dest = path.join(destDir, 'dashboard.html');

if (fs.existsSync(src)) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`✔ Copied dashboard asset: ${src} -> ${dest}`);
} else {
  console.warn(`⚠ Warning: ${src} not found`);
}
