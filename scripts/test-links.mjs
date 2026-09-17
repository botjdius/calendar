const SITE = 'https://jyangjyang.surge.sh';
const EXPO = 'http://127.0.0.1:8081';
const HUB = 'http://127.0.0.1:8787';

async function check(name, url, expect) {
  const res = await fetch(url, { redirect: 'manual' });
  const loc = res.headers.get('location') || '';
  const type = res.headers.get('content-type') || '';
  const ok =
    expect.status === res.status &&
    (!expect.location || loc.includes(expect.location)) &&
    (!expect.html || type.includes('text/html') || type.includes('application/json'));
  const line = `${ok ? 'ok' : 'FAIL'} ${name} ${res.status} ${loc || type}`.trim();
  if (!ok) throw new Error(line);
  console.log(line);
  return res;
}

async function htmlHasApp(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!text.includes('root') && !text.includes('쟝쟝')) {
    throw new Error(`FAIL html ${url}`);
  }
  const src = (text.match(/src="([^"]+\.js)"/) || [])[1];
  if (src) {
    const js = await fetch(new URL(src, url).toString());
    if (!js.ok) throw new Error(`FAIL js ${src} ${js.status}`);
  }
  console.log(`ok html ${url}`);
}

const teach = await check('hub /teach', `${HUB}/teach`, { status: 302, location: ':8081/teach' });
await check('hub /enter', `${HUB}/enter`, { status: 302, location: ':8081/enter' });
await check('hub /j/Y6WMT7', `${HUB}/j/Y6WMT7`, { status: 302, location: ':8081/j/Y6WMT7' });
await check('hub /health', `${HUB}/health`, { status: 200 });

await htmlHasApp(`${EXPO}/teach`);
await htmlHasApp(`${EXPO}/enter`);
await htmlHasApp(`${EXPO}/j/Y6WMT7`);
await htmlHasApp(`${EXPO}/auth`);

await htmlHasApp(`${SITE}/teach`);
await htmlHasApp(`${SITE}/enter`);
await htmlHasApp(`${SITE}/j/Y6WMT7`);
await htmlHasApp(`${SITE}/`);

const health = await fetch(`${HUB}/health`).then((r) => r.json());
if (!health.ok) throw new Error('hub health not ok');
if (!(health.public || []).includes(SITE)) throw new Error('health missing surge public url');
console.log('ok hub public', health.public);
console.log('ok all links');
