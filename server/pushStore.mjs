export function mergePushSubscriptions(current, incoming) {
  const map = new Map();
  for (const item of [...(current || []), ...(incoming || [])]) {
    const next = normalizePushSubscription(item);
    if (!next) continue;
    const prev = map.get(next.endpoint);
    if (!prev || String(next.updatedAt) >= String(prev.updatedAt)) map.set(next.endpoint, next);
  }
  return [...map.values()];
}

export function normalizePushSubscription(item) {
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

export function upsertPushSubscription(list, item) {
  const next = normalizePushSubscription({ ...item, updatedAt: new Date().toISOString() });
  if (!next) return list || [];
  return mergePushSubscriptions(list, [next]);
}

export function matchPushSubscriptions(list, input = {}) {
  const rows = list || [];
  if (input.audience === 'instructors') return rows.filter((item) => item.role === 'instructor');
  if (input.audience === 'uid') return rows.filter((item) => item.uid && item.uid === input.uid);
  return rows.filter(
    (item) =>
      (input.studentId && item.studentId === input.studentId) ||
      (input.linkedUid && item.uid === input.linkedUid) ||
      (input.uid && item.uid === input.uid)
  );
}
