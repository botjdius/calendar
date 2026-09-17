import { createRequire } from 'node:module';
import { appendEnv } from './env.mjs';

const require = createRequire(import.meta.url);
const webpush = require('web-push');

const SITE = 'https://jyangjyang.surge.sh';

function ensureVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return;
  if (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    process.env.VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
    return;
  }
  const keys = webpush.generateVAPIDKeys();
  appendEnv({
    EXPO_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:jyang@localhost',
  });
}

ensureVapid();

function vapidDetails() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT || 'mailto:jyang@localhost',
  };
}

export function vapidPublicKey() {
  return vapidDetails()?.publicKey || '';
}

export function pushReady() {
  return Boolean(vapidDetails());
}

function validSubscription(subscription) {
  return Boolean(
    subscription &&
      typeof subscription === 'object' &&
      String(subscription.endpoint || '').startsWith('https://') &&
      subscription.keys?.p256dh &&
      subscription.keys?.auth
  );
}

export function upsertSubscription(list, uid, role, subscription, studentId) {
  if (!uid || !validSubscription(subscription)) return list || [];
  const endpoint = String(subscription.endpoint);
  const next = (list || []).filter((item) => item.endpoint !== endpoint);
  next.push({
    uid,
    role: role === 'instructor' ? 'instructor' : 'student',
    studentId: studentId ? String(studentId) : undefined,
    endpoint,
    subscription,
    updatedAt: new Date().toISOString(),
  });
  return next;
}

export function removeSubscription(list, { uid, endpoint } = {}) {
  return (list || []).filter((item) => {
    if (endpoint && item.endpoint === endpoint) return false;
    if (uid && !endpoint && item.uid === uid) return false;
    return true;
  });
}

export async function sendPushTo(list, matcher, payload) {
  const details = vapidDetails();
  if (!details) return { sent: 0, gone: [] };
  webpush.setVapidDetails(details.subject, details.publicKey, details.privateKey);

  const body = JSON.stringify({
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

  const gone = [];
  let sent = 0;
  const targets = (list || []).filter(matcher);
  await Promise.all(
    targets.map(async (item) => {
      try {
        await webpush.sendNotification(item.subscription, body, {
          TTL: 86400,
          urgency: payload.urgency || 'high',
          headers: { Urgency: payload.urgency || 'high' },
        });
        sent += 1;
      } catch (err) {
        const status = Number(err?.statusCode || 0);
        if (status === 404 || status === 410) gone.push(item.endpoint);
      }
    })
  );
  return { sent, gone };
}
