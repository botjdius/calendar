import { execFile, spawn } from 'node:child_process';
import { chmodSync, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:https';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const dir = dirname(fileURLToPath(import.meta.url));
const binDir = join(dir, '.bin');
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function assetName() {
  const arm = process.arch === 'arm64';
  if (process.platform === 'darwin') return arm ? 'cloudflared-darwin-arm64.tgz' : 'cloudflared-darwin-amd64.tgz';
  if (process.platform === 'linux') return arm ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64';
  return '';
}

function follow(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'jyang-jyang' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        follow(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`다운로드 실패 (${res.statusCode})`));
        return;
      }
      resolve(res);
    }).on('error', reject);
  });
}

function pipeTo(stream, file) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(file);
    stream.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    stream.on('error', reject);
  });
}

async function ensureCloudflared() {
  const dest = join(binDir, 'cloudflared');
  if (existsSync(dest)) return dest;
  const asset = assetName();
  if (!asset) throw new Error('이 컴퓨터용 공개 터널을 자동으로 준비할 수 없습니다.');
  mkdirSync(binDir, { recursive: true });
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  const res = await follow(url);
  if (asset.endsWith('.tgz')) {
    const tar = join(tmpdir(), `jyang-cloudflared-${Date.now()}.tgz`);
    await pipeTo(res, tar);
    await execFileAsync('tar', ['-xzf', tar, '-C', binDir]);
  } else {
    await pipeTo(res, dest);
  }
  if (!existsSync(dest)) throw new Error('cloudflared 압축을 풀지 못했습니다.');
  chmodSync(dest, 0o755);
  return dest;
}

export function startPublicTunnel(port, onUrl) {
  const preset = String(process.env.JYANG_PUBLIC_URL || '').replace(/\/$/, '');
  if (preset) {
    onUrl(preset);
    return () => {};
  }
  if (process.env.JYANG_NO_TUNNEL === '1') return () => {};

  let child = null;
  let stopped = false;

  (async () => {
    try {
      const bin = await ensureCloudflared();
      if (stopped) return;
      child = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const handle = (buf) => {
        const found = String(buf).match(URL_RE);
        if (found) onUrl(found[0]);
      };
      child.stdout.on('data', handle);
      child.stderr.on('data', handle);
      child.on('error', (err) => {
        console.log('공개 링크 터널 오류:', err.message);
      });
      child.on('exit', (code) => {
        if (!stopped) console.log(`공개 링크 터널이 종료되었습니다 (${code ?? '?'}).`);
      });
    } catch (err) {
      console.log('공개 링크를 만들지 못했습니다:', err instanceof Error ? err.message : err);
      console.log('brew install cloudflared 후 npm run hub 를 다시 켜거나 JYANG_PUBLIC_URL 을 넣어 주세요.');
    }
  })();

  return () => {
    stopped = true;
    if (child) child.kill();
  };
}
