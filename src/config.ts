export const INSTRUCTOR_INVITE_CODE = 'JYANG-TEACHER';
export const APP_NAME = '쟝쟝';
export const APP_NAME_EN = 'Jyang JyanG';
export const DEFAULT_SESSION_COUNT = 4;

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

export const webPushFirebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FCM_API_KEY || firebaseConfig.apiKey,
  authDomain: process.env.EXPO_PUBLIC_FCM_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: process.env.EXPO_PUBLIC_FCM_PROJECT_ID || firebaseConfig.projectId,
  messagingSenderId:
    process.env.EXPO_PUBLIC_FCM_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  appId: process.env.EXPO_PUBLIC_FCM_APP_ID || firebaseConfig.appId,
};

export const isWebPushFirebaseConfigured = Boolean(
  webPushFirebaseConfig.apiKey &&
    webPushFirebaseConfig.projectId &&
    webPushFirebaseConfig.messagingSenderId &&
    webPushFirebaseConfig.appId
);

export const webPushVapidKey =
  process.env.EXPO_PUBLIC_FCM_VAPID_KEY ||
  process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY ||
  '';

export const siteUrl = (
  process.env.EXPO_PUBLIC_SITE_URL ||
  (firebaseConfig.projectId ? `https://${firebaseConfig.projectId}.web.app` : '') ||
  'https://jyangjyang.surge.sh'
).replace(/\/$/, '');
