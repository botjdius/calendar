import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { emptyBank } from './bank';
import { mergePushSubscriptions, type PushSubscriptionRecord } from './pushStore';
import type { Account, AnonymousFeedback, BankAccount, Closure, MakeupRequest, OpenSlot, RemovedStudent, Student } from './types';

export { BANK_MAX, bankLabel, emptyBank, mergeBanks, packBanks } from './bank';

const HUB_URL_KEY = 'jyang-jyang-hub-url';
const PUBLIC_HUB_KEY = 'jyang-jyang-public-hub';

export type SharedBlob = {
  version: number;
  accounts: Account[];
  students: Student[];
  closures: Closure[];
  openSlots: OpenSlot[];
  requests: MakeupRequest[];
  feedback?: AnonymousFeedback[];
  removedFeedback?: string[];
  removedRequests?: string[];
  removedOpenSlots?: string[];
  bank: BankAccount;
  banks?: BankAccount[];
  hubPublicUrl?: string;
  removedStudents?: RemovedStudent[];
  pushSubscriptions?: PushSubscriptionRecord[];
};

export const emptyShared = (): SharedBlob => ({
  version: 0,
  accounts: [],
  students: [],
  closures: [],
  openSlots: [],
  requests: [],
  feedback: [],
  removedFeedback: [],
  removedRequests: [],
  removedOpenSlots: [],
  bank: emptyBank(),
  banks: [],
  removedStudents: [],
  pushSubscriptions: [],
});

function pageHost(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.hostname || '';
  }
  return '';
}

export function normalizeHubUrl(url: string) {
  return url.trim().replace(/\/$/, '');
}

export function isEphemeralHubUrl(url: string) {
  return /trycloudflare\.com/i.test(String(url || ''));
}

function pageAllowsHub(url: string) {
  if (!isEphemeralHubUrl(url)) return true;
  const page = pageHost();
  if (!page) return false;
  try {
    return new URL(url).hostname === page;
  } catch {
    return url.includes(page);
  }
}

export async function savedHubUrl() {
  return normalizeHubUrl((await AsyncStorage.getItem(HUB_URL_KEY)) || '');
}

export async function rememberHubUrl(url: string) {
  const clean = normalizeHubUrl(url);
  if (clean) await AsyncStorage.setItem(HUB_URL_KEY, clean);
  else await AsyncStorage.removeItem(HUB_URL_KEY);
  return clean;
}

export async function savedPublicHubUrl() {
  return normalizeHubUrl((await AsyncStorage.getItem(PUBLIC_HUB_KEY)) || '');
}

export async function rememberPublicHubUrl(url: string) {
  const clean = normalizeHubUrl(url);
  if (!clean || isEphemeralHubUrl(clean)) return '';
  await AsyncStorage.setItem(PUBLIC_HUB_KEY, clean);
  return clean;
}

function isPrivateHost(host: string) {
  const name = String(host || '').split(':')[0];
  return (
    name === 'localhost' ||
    name === '127.0.0.1' ||
    name === '::1' ||
    /^192\.168\./.test(name) ||
    /^10\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name)
  );
}

export function pageHubUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  const { origin, port } = window.location;
  if (port === '8787') return normalizeHubUrl(origin);
  return '';
}

export async function probeHub(url: string) {
  const base = normalizeHubUrl(url);
  if (!base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || body.ok !== true) return null;
    const pub = Array.isArray(body.public) ? String(body.public[0] || '') : '';
    if (pub) await rememberPublicHubUrl(pub);
    return base;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function candidates(): Promise<string[]> {
  const saved = await savedHubUrl();
  const savedPublic = await savedPublicHubUrl();
  const env = (process.env.EXPO_PUBLIC_HUB_URL ?? '').replace(/\/$/, '');
  const page = pageHost();
  const originHub = pageHubUrl();
  const host =
    Constants.expoConfig?.hostUri?.split(':')[0] ||
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost?.split(':')[0] ||
    '';
  const lanHost = [page, host].find((h) => h && isPrivateHost(h) && h !== 'localhost' && h !== '127.0.0.1') || '';
  const pageIsLocal = page === 'localhost' || page === '127.0.0.1';
  const list = [
    originHub,
    pageIsLocal ? 'http://127.0.0.1:8787' : '',
    pageIsLocal ? 'http://localhost:8787' : '',
    saved,
    savedPublic,
    env,
    lanHost ? `http://${lanHost}:8787` : '',
    host && isPrivateHost(host) ? `http://${host}:8787` : '',
  ].filter(Boolean);
  return [...new Set(list)].filter(pageAllowsHub);
}

export async function discoverHub(): Promise<string | null> {
  for (const base of await candidates()) {
    const ok = await probeHub(base);
    if (ok) return ok;
  }
  return null;
}

async function timedFetch(url: string, init?: RequestInit, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parse(res: Response, fallback: string) {
  return res.json().then((body) => {
    if (!res.ok) throw new Error(body.error || fallback);
    return body;
  });
}

export async function fetchBlob(base: string, uid?: string | null): Promise<SharedBlob> {
  const q = uid ? `?uid=${encodeURIComponent(uid)}` : '';
  const res = await timedFetch(`${base}/view${q}`);
  return { ...emptyShared(), ...(await parse(res, '허브에서 자료를 읽지 못했습니다.')) };
}

export async function putBlob(
  base: string,
  uid: string,
  blob: Partial<Omit<SharedBlob, 'version'>>
): Promise<SharedBlob> {
  const res = await timedFetch(`${base}/view?uid=${encodeURIComponent(uid)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blob),
  });
  return { ...emptyShared(), ...(await parse(res, '허브에 저장하지 못했습니다.')) };
}

export async function hubAuth(
  base: string,
  body: Record<string, string | number | boolean | undefined | string[]>
): Promise<{ uid: string | null; view: SharedBlob }> {
  const res = await timedFetch(`${base}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parse(res, '입장에 실패했습니다.');
  return {
    uid: data.uid ?? null,
    view: { ...emptyShared(), ...data.view },
  };
}

export async function fetchVapidPublicKey(base: string) {
  const res = await timedFetch(`${base}/push-vapid`);
  const data = await parse(res, '알림 키를 읽지 못했습니다.');
  return String(data.publicKey || '');
}

export async function savePushSubscription(
  base: string,
  uid: string,
  subscription: PushSubscriptionJSON
) {
  const res = await timedFetch(`${base}/push-subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, subscription }),
  });
  await parse(res, '푸시 구독을 저장하지 못했습니다.');
}

export async function requestHubPushTest(base: string, uid: string) {
  const res = await timedFetch(`${base}/push-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  });
  await parse(res, '테스트 알림을 보내지 못했습니다.');
}
