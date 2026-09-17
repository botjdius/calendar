import { Platform } from 'react-native';
import { fetchCloudVapidPublicKey, requestCloudPushTest, saveCloudPushSubscription } from './cloudPush';
import { vapidPublicKey } from './config';
import { fetchVapidPublicKey, requestHubPushTest, savePushSubscription } from './hub';
import { normalizePushSubscription, type PushSubscriptionRecord } from './pushStore';

const TOKEN_KEY = 'jyang-jyang-push-endpoint';

export type WebPushResult = {
  permission: NotificationPermission | 'unsupported';
  pushReady: boolean;
  hubSaved: boolean;
  token: string;
  message: string;
};

type PushContext = {
  hubBase?: string | null;
  uid?: string | null;
  role?: 'instructor' | 'student' | null;
  studentId?: string | null;
  persistSubscription?: (record: PushSubscriptionRecord) => Promise<void>;
};

export function webPushSupported() {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function currentWebPushPermission(): WebPushResult {
  if (!webPushSupported()) {
    return {
      permission: 'unsupported',
      pushReady: false,
      hubSaved: false,
      token: '',
      message: '이 브라우저에서는 웹 알림을 지원하지 않습니다. 홈 화면에 추가한 쟝쟝에서 켜 주세요.',
    };
  }
  const permission = Notification.permission;
  const endpoint = localStorage.getItem(TOKEN_KEY) || '';
  return {
    permission,
    pushReady: permission === 'granted',
    hubSaved: Boolean(endpoint),
    token: endpoint,
    message:
      permission === 'granted'
        ? '브라우저 알림이 허용되어 있습니다.'
        : permission === 'denied'
          ? '브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'
          : '버튼을 누르면 브라우저가 알림 허용 여부를 묻습니다.',
  };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function resolveVapidKey(hubBase?: string | null) {
  if (vapidPublicKey) return vapidPublicKey;
  const cloudKey = await fetchCloudVapidPublicKey();
  if (cloudKey) return cloudKey;
  if (!hubBase) return '';
  try {
    return await fetchVapidPublicKey(hubBase);
  } catch {
    return '';
  }
}

async function currentSubscription(registration: ServiceWorkerRegistration) {
  return registration.pushManager.getSubscription();
}

function toRecord(
  ctx: PushContext,
  subscription: PushSubscription
): PushSubscriptionRecord | null {
  return normalizePushSubscription({
    uid: ctx.uid || '',
    role: ctx.role === 'instructor' ? 'instructor' : 'student',
    studentId: ctx.studentId || undefined,
    endpoint: subscription.endpoint,
    subscription: subscription.toJSON(),
    updatedAt: new Date().toISOString(),
  });
}

async function saveRecord(ctx: PushContext, record: PushSubscriptionRecord) {
  const results = await Promise.allSettled([
    saveCloudPushSubscription(record),
    ctx.persistSubscription ? ctx.persistSubscription(record).then(() => true) : Promise.resolve(false),
    ctx.hubBase && ctx.uid
      ? savePushSubscription(ctx.hubBase, ctx.uid, record.subscription).then(() => true)
      : Promise.resolve(false),
  ]);
  return results.some((item) => item.status === 'fulfilled' && Boolean(item.value));
}

export async function enableWebPush(ctx: PushContext = {}): Promise<WebPushResult> {
  if (!webPushSupported()) return currentWebPushPermission();

  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;

  if (permission !== 'granted') {
    return {
      permission,
      pushReady: false,
      hubSaved: false,
      token: '',
      message:
        permission === 'denied'
          ? '알림이 차단되었습니다. 홈 화면 쟝쟝 앱의 알림을 허용해 주세요.'
          : '알림 권한이 아직 허용되지 않았습니다.',
    };
  }

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  const publicKey = await resolveVapidKey(ctx.hubBase);
  if (!publicKey) {
    return {
      permission,
      pushReady: false,
      hubSaved: false,
      token: '',
      message: '알림은 허용됐습니다. 잠시 후 다시 알림 켜기를 눌러 주세요.',
    };
  }

  let subscription = await currentSubscription(registration);
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const endpoint = subscription.endpoint;
  localStorage.setItem(TOKEN_KEY, endpoint);

  const record = ctx.uid ? toRecord(ctx, subscription) : null;
  const saved = record ? await saveRecord(ctx, record) : false;
  if (!saved) {
    return {
      permission,
      pushReady: true,
      hubSaved: false,
      token: endpoint,
      message: '알림은 허용됐습니다. 인터넷 연결을 확인한 뒤 알림 켜기를 다시 눌러 주세요.',
    };
  }

  return {
    permission,
    pushReady: true,
    hubSaved: true,
    token: endpoint,
    message: '이 기기에서 앱을 꺼도 보강·피드백 푸시를 받을 준비가 됐습니다.',
  };
}

export async function syncWebPushIfAllowed(ctx: PushContext = {}): Promise<WebPushResult | null> {
  if (!webPushSupported() || Notification.permission !== 'granted') return null;
  try {
    return await enableWebPush(ctx);
  } catch {
    return currentWebPushPermission();
  }
}

export async function showWebPushTest(ctx: PushContext = {}) {
  if (!webPushSupported() || Notification.permission !== 'granted') {
    throw new Error('먼저 알림을 허용해 주세요.');
  }
  if (ctx.uid) {
    try {
      await requestCloudPushTest(ctx.uid);
      return;
    } catch (error) {
      if (ctx.hubBase) {
        try {
          await requestHubPushTest(ctx.hubBase, ctx.uid);
          return;
        } catch {
          // keep the cloud error; it is what the phone will hit when the hub is off
        }
      }
      throw error instanceof Error
        ? error
        : new Error('테스트 알림을 보내지 못했습니다. 알림 켜기를 다시 눌러 주세요.');
    }
  }
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('쟝쟝 알림 테스트', {
    body: '앱이 열려 있을 때만 보이는 테스트입니다. 알림 켜기를 다시 누르면 닫아도 받을 수 있습니다.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'jyang-jyang-test',
    data: { url: '/' },
  });
}
