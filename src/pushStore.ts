export type PushAudience = 'instructors' | 'uid' | 'student' | 'students';

export type PushSubscriptionRecord = {
  uid: string;
  role: 'instructor' | 'student';
  studentId?: string;
  endpoint: string;
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys?: { p256dh?: string; auth?: string };
  };
  updatedAt: string;
};

export function mergePushSubscriptions(
  current?: PushSubscriptionRecord[] | null,
  incoming?: PushSubscriptionRecord[] | null
): PushSubscriptionRecord[] {
  const map = new Map<string, PushSubscriptionRecord>();
  for (const item of [...(current || []), ...(incoming || [])]) {
    const next = normalizePushSubscription(item);
    if (!next) continue;
    const prev = map.get(next.endpoint);
    if (!prev || String(next.updatedAt) >= String(prev.updatedAt)) map.set(next.endpoint, next);
  }
  return [...map.values()];
}

export function normalizePushSubscription(item: unknown): PushSubscriptionRecord | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const body = item as Partial<PushSubscriptionRecord> & {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };
  const subscription = body.subscription;
  const endpoint = String(subscription?.endpoint || body.endpoint || '');
  if (!endpoint.startsWith('https://') || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return null;
  return {
    uid: String(body.uid || ''),
    role: body.role === 'instructor' ? 'instructor' : 'student',
    studentId: body.studentId ? String(body.studentId) : undefined,
    endpoint,
    subscription: {
      endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: String(subscription.keys.p256dh),
        auth: String(subscription.keys.auth),
      },
    },
    updatedAt: String(body.updatedAt || new Date().toISOString()),
  };
}

export function upsertPushSubscription(
  list: PushSubscriptionRecord[] | undefined,
  item: PushSubscriptionRecord
): PushSubscriptionRecord[] {
  const next = normalizePushSubscription({ ...item, updatedAt: new Date().toISOString() });
  if (!next) return list || [];
  return mergePushSubscriptions(list, [next]);
}

function studentIdSet(input: { studentId?: string; studentIds?: string[] }) {
  const ids = new Set<string>();
  if (input.studentId) ids.add(String(input.studentId));
  for (const id of input.studentIds || []) {
    if (id) ids.add(String(id));
  }
  return ids;
}

function uidSet(input: { uid?: string; linkedUid?: string; linkedUids?: string[] }) {
  const ids = new Set<string>();
  if (input.uid) ids.add(String(input.uid));
  if (input.linkedUid) ids.add(String(input.linkedUid));
  for (const id of input.linkedUids || []) {
    if (id) ids.add(String(id));
  }
  return ids;
}

export function matchPushSubscriptions(
  list: PushSubscriptionRecord[] | undefined,
  input: {
    audience: PushAudience;
    uid?: string;
    studentId?: string;
    studentIds?: string[];
    linkedUid?: string;
    linkedUids?: string[];
  }
): PushSubscriptionRecord[] {
  const rows = list || [];
  if (input.audience === 'instructors') return rows.filter((item) => item.role === 'instructor');
  if (input.audience === 'uid') return rows.filter((item) => item.uid && item.uid === input.uid);
  const ids = studentIdSet(input);
  const uids = uidSet(input);
  if (input.audience === 'students') {
    return rows.filter(
      (item) => (item.studentId && ids.has(item.studentId)) || (item.uid && uids.has(item.uid))
    );
  }
  return rows.filter(
    (item) =>
      (item.studentId && ids.has(item.studentId)) ||
      (item.uid && uids.has(item.uid))
  );
}
