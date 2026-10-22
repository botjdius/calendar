import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { mergeCloudAndLocalChecklist, normalizeChecklistChecked } from './lessonChecklist';

export { mergeCloudAndLocalChecklist };

/** Stable key: web `localStorage`, native AsyncStorage (same string). */
export const CHECKLIST_LOCAL_PREFIX = 'jyang:lesson-checklist-checked';

export function checklistStorageKey(studentId: string, sessionId: string) {
  return `${CHECKLIST_LOCAL_PREFIX}:${studentId}:${sessionId}`;
}

async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return AsyncStorage.getItem(key);
}

async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function readLocalChecklistChecked(studentId: string, sessionId: string): Promise<string[] | null> {
  const raw = await storageGet(checklistStorageKey(studentId, sessionId));
  if (raw === null) return null;
  try {
    return normalizeChecklistChecked(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function writeLocalChecklistChecked(
  studentId: string,
  sessionId: string,
  checkedIds: string[]
): Promise<void> {
  await storageSet(checklistStorageKey(studentId, sessionId), JSON.stringify(normalizeChecklistChecked(checkedIds)));
}

