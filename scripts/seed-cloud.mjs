import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getFirestore, setDoc } from 'firebase/firestore';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
for (const line of env.split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
}

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  throw new Error('.env에 Firebase 키를 넣어 주세요.');
}

const data = JSON.parse(readFileSync(join(root, 'server/data.json'), 'utf8'));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const instructor = (data.accounts || []).find((a) => a.role === 'instructor');
const name = instructor?.name || '서연';
const password = String(instructor?.password || '1234');
const mail = `${String(name).trim().replace(/\s+/g, '').toLowerCase()}@instructor.jyang.local`;

try {
  await signInWithEmailAndPassword(auth, mail, password);
} catch {
  const cred = await createUserWithEmailAndPassword(auth, mail, password);
  await setDoc(doc(db, 'users', cred.user.uid), { name, role: 'instructor' });
}

for (const student of data.students || []) {
  await setDoc(doc(db, 'students', student.id), student);
  if (student.joinCode) {
    await setDoc(doc(db, 'joinCodes', student.joinCode), { studentId: student.id, name: student.name });
  }
}
for (const closure of data.closures || []) {
  await setDoc(doc(db, 'closures', closure.id), closure);
}
for (const slot of data.openSlots || []) {
  await setDoc(doc(db, 'openSlots', slot.id), slot);
}
if (data.bank) await setDoc(doc(db, 'studio', 'bank'), data.bank);
for (const req of data.requests || []) {
  await setDoc(doc(db, 'makeupRequests', req.id), req);
}

console.log(`클라우드에 레슨생 ${(data.students || []).length}명을 올렸습니다.`);
