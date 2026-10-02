export const INSTRUCTOR_INVITE_CODE = 'JYANG-TEACHER';
export const APP_NAME = '쟝쟝';
export const APP_NAME_EN = 'Jyang Jyang';
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

const DEFAULT_PUSH_URL = 'https://jyang-jyang-push.ludicrous-apatosaurus.workers.dev';
const DEFAULT_VAPID_PUBLIC_KEY =
  'BHdNPyXfLjYWB7kjsi41USPYNMfWoWUpvj9GNJKz65Eo4ma6WT6wfuuilgxnOCFtLLPaPg_Q4PMBaqVIqXhORk4';
const DEFAULT_PUSH_GATE = '8dfd63bc8e02bb6069d9bcd2312fecb4';

export const vapidPublicKey =
  process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ||
  process.env.EXPO_PUBLIC_FCM_VAPID_KEY ||
  process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY ||
  DEFAULT_VAPID_PUBLIC_KEY;

export const pushUrl = (
  process.env.EXPO_PUBLIC_PUSH_URL || DEFAULT_PUSH_URL
).replace(/\/$/, '');
export const pushGate = process.env.EXPO_PUBLIC_PUSH_GATE || DEFAULT_PUSH_GATE;

export const siteUrl = (
  process.env.EXPO_PUBLIC_SITE_URL ||
  (firebaseConfig.projectId ? `https://${firebaseConfig.projectId}.web.app` : '') ||
  'https://jyangjyang.surge.sh'
).replace(/\/$/, '');
