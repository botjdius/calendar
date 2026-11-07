/**
 * Web export + Surge upload. Surge domain = hostname of EXPO_PUBLIC_SITE_URL (from .env).
 * Example: EXPO_PUBLIC_SITE_URL=https://jyangjyang.surge.sh → surge dist jyangjyang.surge.sh
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

function loadEnvFile() {
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile();

const site = (process.env.EXPO_PUBLIC_SITE_URL || 'https://jyangjyang.surge.sh').replace(/\/$/, '');
let domain;
try {
  domain = new URL(site).hostname;
} catch {
  console.error('Invalid EXPO_PUBLIC_SITE_URL:', site);
  process.exit(1);
}

console.log(`Site URL (app): ${site}`);
console.log(`Surge domain:   ${domain}`);

execSync('npx expo export --platform web', { cwd: root, stdio: 'inherit', env: process.env });
execSync('cp dist/index.html dist/200.html', { cwd: root, stdio: 'inherit', shell: true });

const pub = join(root, 'public');
if (existsSync(pub)) {
  for (const name of ['sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'index.html']) {
    const p = join(pub, name);
    if (existsSync(p)) cpSync(p, join(root, 'dist', name));
  }
}

execSync(`npx surge dist ${domain}`, { cwd: root, stdio: 'inherit', env: process.env });
