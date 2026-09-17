import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth, Persistence } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from './config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function createAuth(firebaseApp: FirebaseApp): Auth {
  try {
    const mod = require('firebase/auth') as {
      getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
    };
    if (mod.getReactNativePersistence) {
      return initializeAuth(firebaseApp, {
        persistence: mod.getReactNativePersistence(AsyncStorage),
      });
    }
  } catch {
    // Fall through to default Auth.
  }
  return getAuth(firebaseApp);
}

if (isFirebaseConfigured) {
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  try {
    auth = createAuth(app);
  } catch {
    auth = getAuth(app);
  }
  db = getFirestore(app);
}

export { app, auth, db };
