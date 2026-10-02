import { buildPushPayload } from '@block65/webcrypto-web-push';

const SITE = 'https://jyangjyang.surge.sh';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Push-Gate',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

function cors() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function mergePushSubscriptions(current, incoming) {
  const map = new Map();
  for (const item of [...(current || []), ...(incoming || [])]) {
    const next = normalizePushSubscription(item);
    if (!next) continue;
    const prev = map.get(next.endpoint);
    if (!prev || String(next.updatedAt) >= String(prev.updatedAt)) map.set(next.endpoint, next);
  }
  return [...map.values()];
}

function normalizePushSubscription(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const subscription = item.subscription;
  const endpoint = String(subscription?.endpoint || item.endpoint || '');
  if (!endpoint.startsWith('https://') || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return null;
  return {
    uid: String(item.uid || ''),
    role: item.role === 'instructor' ? 'instructor' : 'student',
    studentId: item.studentId ? String(item.studentId) : undefined,
    endpoint,
    subscription: {
      endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: String(subscription.keys.p256dh),
        auth: String(subscription.keys.auth),
      },
    },
    updatedAt: String(item.updatedAt || new Date().toISOString()),
  };
}

function studentIdSet(input = {}) {
  const ids = new Set();
  if (input.studentId) ids.add(String(input.studentId));
  for (const id of input.studentIds || []) {
    if (id) ids.add(String(id));
  }
  return ids;
}

function uidSet(input = {}) {
  const ids = new Set();
  if (input.uid) ids.add(String(input.uid));
  if (input.linkedUid) ids.add(String(input.linkedUid));
  for (const id of input.linkedUids || []) {
    if (id) ids.add(String(id));
  }
  return ids;
}

function matchPushSubscriptions(list, input = {}) {
  const rows = list || [];
  if (input.audience === 'instructors') return rows.filter((item) => item.role === 'instructor');
  if (input.audience === 'uid') return rows.filter((item) => item.uid && item.uid === input.uid);
  const ids = studentIdSet(input);
  const uids = uidSet(input);
  return rows.filter(
    (item) => (item.studentId && ids.has(item.studentId)) || (item.uid && uids.has(item.uid))
  );
}

function rentryText(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.content === 'string') return data.content;
  if (data.content && typeof data.content.text === 'string') return data.content.text;
  return '';
}

function gateOk(env, req, body) {
  const expected = String(env.PUSH_GATE || '');
  if (!expected) return false;
  const header = req.headers.get('X-Push-Gate') || '';
  const fromBody = body?.gate || '';
  return header === expected || fromBody === expected;
}

async function fetchRentryStudio(env) {
  const id = env.RENTRY_ID || 'jyangjyang-studio';
  const code = env.RENTRY_CODE || 'jyangcloud';
  try {
    const res = await fetch(`https://rentry.co/api/fetch/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `edit_code=${encodeURIComponent(code)}`,
    });
    if (!res.ok) return null;
    const text = rentryText(await res.json());
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchExtendsclass(env) {
  const url = env.CLOUD_URL || 'https://extendsclass.com/api/json-storage/bin/ebefede';
  try {
    const res = await fetch(`${url}?t=${Date.now()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function fetchStudio(env) {
  const [ext, rentry] = await Promise.all([fetchExtendsclass(env), fetchRentryStudio(env)]);
  if (ext && rentry) return (rentry.version || 0) >= (ext.version || 0) ? rentry : ext;
  return ext || rentry;
}

async function fetchStudioSubs(env) {
  const [ext, rentry] = await Promise.all([fetchExtendsclass(env), fetchRentryStudio(env)]);
  return mergePushSubscriptions(ext?.pushSubscriptions, rentry?.pushSubscriptions);
}

async function loadKv(env) {
  if (!env.PUSH_SUBS) return [];
  const raw = await env.PUSH_SUBS.get('list');
  if (!raw) return [];
  try {
    return mergePushSubscriptions([], JSON.parse(raw));
  } catch {
    return [];
  }
}

async function loadPushList(env) {
  const [dedicated, studio] = await Promise.all([loadKv(env), fetchStudioSubs(env)]);
  return mergePushSubscriptions(studio, dedicated);
}

async function writeStudioSubs(env, list) {
  const studio = await fetchStudio(env);
  if (!studio || typeof studio !== 'object' || Array.isArray(studio)) return false;
  studio.pushSubscriptions = list;
  const payload = JSON.stringify(studio);
  const url = env.CLOUD_URL || 'https://extendsclass.com/api/json-storage/bin/ebefede';
  if (payload.length > 90_000) return false;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: payload,
  });
  return res.ok;
}

async function saveDedicated(env, list) {
  if (env.PUSH_SUBS) {
    await env.PUSH_SUBS.put('list', JSON.stringify(list));
    return true;
  }
  return writeStudioSubs(env, list);
}

function vapid(env) {
  const publicKey = env.VAPID_PUBLIC_KEY || '';
  const privateKey = env.VAPID_PRIVATE_KEY || '';
  if (!publicKey || !privateKey) return null;
  return {
    subject: 'https://jyangjyang.surge.sh',
    publicKey,
    privateKey,
  };
}

function pushBody(payload) {
  return JSON.stringify({
    notification: {
      title: payload.title || '쟝쟝',
      body: payload.body || '새 알림이 도착했습니다.',
      icon: '/icon-192.png',
    },
    data: {
      title: payload.title || '쟝쟝',
      body: payload.body || '새 알림이 도착했습니다.',
      url: payload.url || '/',
      tag: payload.tag || 'jyang-jyang-message',
    },
    fcmOptions: { link: payload.url ? `${SITE}${payload.url}` : SITE },
  });
}

async function sendPush(env, targets, payload) {
  const keys = vapid(env);
  if (!keys) return { sent: 0, gone: [] };
  const gone = [];
  let sent = 0;
  await Promise.all(
    targets.map(async (item) => {
      try {
        const message = {
          data: pushBody(payload),
          options: { ttl: 86400, urgency: payload.urgency || 'high' },
        };
        const built = await buildPushPayload(message, item.subscription, keys);
        const res = await fetch(item.subscription.endpoint, built);
        if (res.status === 404 || res.status === 410) gone.push(item.endpoint);
        else if (res.ok || res.status === 201) sent += 1;
        else console.log('push-result', res.status);
      } catch {
        // skip broken endpoints
      }
    })
  );
  if (gone.length) {
    const dedicated = await loadKv(env);
    const next = dedicated.filter((item) => !gone.includes(item.endpoint));
    if (env.PUSH_SUBS && next.length !== dedicated.length) await saveDedicated(env, next);
  }
  return { sent, gone };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return cors();
    const url = new URL(req.url);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json(200, { ok: true, push: Boolean(vapid(env)) });
    }
    if (req.method === 'GET' && url.pathname === '/vapid') {
      return json(200, { publicKey: env.VAPID_PUBLIC_KEY || '', ready: Boolean(vapid(env)) });
    }

    let body = {};
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}));
    }
    if (req.method === 'POST' && !gateOk(env, req, body)) {
      return json(403, { error: '푸시 서버 키가 올바르지 않습니다.' });
    }

    if (req.method === 'POST' && url.pathname === '/subscribe') {
      const record = normalizePushSubscription({ ...body, updatedAt: new Date().toISOString() });
      if (!record || !record.uid) return json(400, { error: '이 브라우저의 푸시 구독을 저장하지 못했습니다.' });
      const current = env.PUSH_SUBS ? await loadKv(env) : await fetchStudioSubs(env);
      const next = mergePushSubscriptions(current, [record]);
      const ok = env.PUSH_SUBS ? await saveDedicated(env, next) : await writeStudioSubs(env, next);
      if (!ok) return json(502, { error: '푸시 구독을 클라우드에 저장하지 못했습니다.' });
      return json(200, { ok: true, push: true });
    }

    if (req.method === 'POST' && url.pathname === '/unsubscribe') {
      const endpoint = body.subscription?.endpoint || body.endpoint;
      const current = env.PUSH_SUBS ? await loadKv(env) : await fetchStudioSubs(env);
      const next = current.filter((item) => {
        if (endpoint && item.endpoint === endpoint) return false;
        if (body.uid && !endpoint && item.uid === body.uid) return false;
        return true;
      });
      await saveDedicated(env, next);
      return json(200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/test') {
      const uid = String(body.uid || '');
      if (!uid) return json(400, { error: '로그인한 뒤 테스트 알림을 보낼 수 있습니다.' });
      const list = await loadPushList(env);
      const targets = matchPushSubscriptions(list, { audience: 'uid', uid });
      const result = await sendPush(env, targets, {
        title: '쟝쟝 알림 테스트',
        body: '앱을 닫아도 이 알림이 오면 맥이 꺼져 있어도 푸시가 연결된 것입니다.',
        url: '/',
        tag: 'jyang-jyang-test',
      });
      if (!result.sent) {
        return json(400, {
          error: targets.length
            ? '푸시 서버가 이 기기로 보내지 못했습니다. 알림 켜기를 다시 눌러 주세요.'
            : '이 기기의 푸시 구독이 없습니다. 알림 켜기를 다시 눌러 주세요.',
        });
      }
      return json(200, { ok: true, sent: result.sent });
    }

    if (req.method === 'POST' && url.pathname === '/notify') {
      const list = await loadPushList(env);
      const targets = matchPushSubscriptions(list, {
        audience: body.audience || 'instructors',
        uid: body.uid,
        studentId: body.studentId,
        studentIds: body.studentIds,
        linkedUid: body.linkedUid,
        linkedUids: body.linkedUids,
      });
      const result = await sendPush(env, targets, {
        title: body.title || '쟝쟝',
        body: body.body || '새 알림이 도착했습니다.',
        url: body.url || '/',
        tag: body.tag || 'jyang-jyang-message',
      });
      return json(200, { ok: true, sent: result.sent });
    }

    return json(404, { error: 'not found' });
  },
};
