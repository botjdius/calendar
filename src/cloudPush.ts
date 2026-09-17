import { pushGate, pushUrl, vapidPublicKey } from './config';
import type { PushAudience, PushSubscriptionRecord } from './pushStore';

export type CloudPushPayload = {
  audience: PushAudience;
  uid?: string;
  studentId?: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function headers() {
  return {
    'Content-Type': 'application/json',
    'X-Push-Gate': pushGate,
  };
}

async function readError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export function cloudPushConfigured() {
  return Boolean(pushUrl);
}

export async function fetchCloudVapidPublicKey() {
  if (vapidPublicKey) return vapidPublicKey;
  if (!pushUrl) return '';
  try {
    const res = await fetch(`${pushUrl}/vapid`);
    const data = (await res.json()) as { publicKey?: string };
    return String(data.publicKey || '');
  } catch {
    return '';
  }
}

export async function saveCloudPushSubscription(record: PushSubscriptionRecord) {
  if (!pushUrl) return false;
  const res = await fetch(`${pushUrl}/subscribe`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ gate: pushGate, ...record }),
  });
  if (!res.ok) throw new Error(await readError(res, '푸시 구독을 클라우드에 저장하지 못했습니다.'));
  return true;
}

export async function requestCloudPushTest(uid: string) {
  if (!pushUrl) throw new Error('푸시 서버가 아직 연결되지 않았습니다.');
  const res = await fetch(`${pushUrl}/test`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ gate: pushGate, uid }),
  });
  if (!res.ok) throw new Error(await readError(res, '테스트 알림을 보내지 못했습니다.'));
}

export async function notifyCloudPush(payload: CloudPushPayload) {
  if (!pushUrl) return false;
  try {
    const res = await fetch(`${pushUrl}/notify`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ gate: pushGate, ...payload }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
