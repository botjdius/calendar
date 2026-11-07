/**
 * Build web to dist/ and deploy Firebase Hosting (no Surge).
 * Needs: firebase-tools (npm i), `firebase login` once, and FIREBASE_PROJECT_ID in .env
 * or EXPO_PUBLIC_FIREBASE_PROJECT_ID from Firebase console.
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

const projectId =
  process.env.FIREBASE_PROJECT_ID?.trim() ||
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
  '';

if (!projectId) {
  console.error(
    'Set FIREBASE_PROJECT_ID or EXPO_PUBLIC_FIREBASE_PROJECT_ID in .env (Firebase project ID from console).'
  );
  process.exit(1);
}

console.log(`Firebase project: ${projectId}`);

execSync('npx expo export --platform web', { cwd: root, stdio: 'inherit', env: process.env });
execSync('cp dist/index.html dist/200.html', { cwd: root, stdio: 'inherit', shell: true });

const pub = join(root, 'public');
if (existsSync(pub)) {
  for (const name of ['sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
    const p = join(pub, name);
    if (existsSync(p)) cpSync(p, join(root, 'dist', name));
  }
}

execSync(`npx firebase deploy --only hosting --project ${projectId}`, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

console.log(`\nHosting URL is usually https://${projectId}.web.app`);
