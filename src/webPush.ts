import { Platform } from 'react-native';
import { getApps, initializeApp } from 'firebase/app';
import {
  isWebPushFirebaseConfigured,
  webPushFirebaseConfig,
  webPushVapidKey,
} from './config';

const TOKEN_KEY = 'jyang-jyang-fcm-token';
const FCM_APP_NAME = 'jyang-web-push';

export type WebPushResult = {
  permission: NotificationPermission | 'unsupported';
  fcmReady: boolean;
  token: string;
  message: string;
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
      fcmReady: false,
      token: '',
      message: '이 브라우저에서는 웹 알림을 지원하지 않습니다.',
    };
  }
  const permission = Notification.permission;
  return {
    permission,
    fcmReady: false,
    token: localStorage.getItem(TOKEN_KEY) || '',
    message:
      permission === 'granted'
        ? '브라우저 알림이 허용되어 있습니다.'
        : permission === 'denied'
          ? '브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'
          : '버튼을 누르면 브라우저가 알림 허용 여부를 묻습니다.',
  };
}

function messagingApp() {
  if (!isWebPushFirebaseConfigured) return null;
  return (
    getApps().find((candidate) => candidate.name === FCM_APP_NAME) ||
    initializeApp(webPushFirebaseConfig, FCM_APP_NAME)
  );
}

export async function enableWebPush(): Promise<WebPushResult> {
  if (!webPushSupported()) return currentWebPushPermission();

  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;

  if (permission !== 'granted') {
    return {
      permission,
      fcmReady: false,
      token: '',
      message:
        permission === 'denied'
          ? '알림이 차단되었습니다. 브라우저 사이트 설정에서 알림을 허용해 주세요.'
          : '알림 권한이 아직 허용되지 않았습니다.',
    };
  }

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  const firebaseApp = messagingApp();
  if (!firebaseApp || !webPushVapidKey) {
    return {
      permission,
      fcmReady: false,
      token: '',
      message: '알림은 허용됐습니다. FCM 프로젝트와 VAPID 공개 키 설정이 필요합니다.',
    };
  }

  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) {
    return {
      permission,
      fcmReady: false,
      token: '',
      message: '이 브라우저에서는 Firebase 웹 푸시를 지원하지 않습니다.',
    };
  }

  const token = await getToken(getMessaging(firebaseApp), {
    vapidKey: webPushVapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) {
    return {
      permission,
      fcmReady: false,
      token: '',
      message: 'FCM 알림 토큰을 발급하지 못했습니다. Firebase 설정을 확인해 주세요.',
    };
  }

  localStorage.setItem(TOKEN_KEY, token);
  return {
    permission,
    fcmReady: true,
    token,
    message: '이 기기에서 푸시 알림을 받을 준비가 됐습니다.',
  };
}

export async function showWebPushTest() {
  if (!webPushSupported() || Notification.permission !== 'granted') {
    throw new Error('먼저 알림을 허용해 주세요.');
  }
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('쟝쟝 알림 테스트', {
    body: '이 기기에서 웹 푸시 알림을 정상적으로 표시할 수 있습니다.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'jyang-jyang-test',
    data: { url: '/' },
  });
}

export async function listenForForegroundMessages() {
  if (!webPushSupported() || !isWebPushFirebaseConfigured || !webPushVapidKey) {
    return () => {};
  }
  const firebaseApp = messagingApp();
  if (!firebaseApp) return () => {};
  const { getMessaging, isSupported, onMessage } = await import('firebase/messaging');
  if (!(await isSupported())) return () => {};

  return onMessage(getMessaging(firebaseApp), async (payload) => {
    if (Notification.permission !== 'granted') return;
    const registration = await navigator.serviceWorker.ready;
    const title = payload.notification?.title || payload.data?.title || '쟝쟝';
    await registration.showNotification(title, {
      body: payload.notification?.body || payload.data?.body || '새 알림이 도착했습니다.',
      icon: payload.notification?.icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.messageId || payload.data?.tag || 'jyang-jyang-message',
      data: { url: payload.fcmOptions?.link || payload.data?.link || '/' },
    });
  });
}
