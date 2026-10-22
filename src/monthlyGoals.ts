import type { MonthlyGoalItem, MonthlyGoalsStore } from './types';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function monthKeyFromIso(iso: string): string {
  const [y, m] = String(iso || '').split('-');
  if (!y || !m) return currentMonthKey();
  return `${y}-${pad(Number(m))}`;
}

export function currentMonthKey(today: string = todayIso()): string {
  return monthKeyFromIso(today);
}

export function nextMonthKey(key: string) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function previousMonthKey(key: string) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthKeyLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return `${y}년 ${m}월`;
}

function goalStamp(item: MonthlyGoalItem) {
  return String(item.updatedAt || '');
}

function normalizeItem(raw: unknown, monthKey: string): MonthlyGoalItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || '').trim();
  const text = String(row.text || '').trim();
  if (!id || !text) return null;
  const createdMonth = String(row.createdMonth || monthKey).trim() || monthKey;
  return {
    id,
    text,
    checked: Boolean(row.checked),
    createdMonth,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
  };
}

export function mergeRemovedMonthlyGoalIds(current?: string[], incoming?: string[]): string[] {
  return [
    ...new Set(
      [...(current || []), ...(incoming || [])]
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ].sort();
}

export function stripRemovedMonthlyGoals(
  store: MonthlyGoalsStore | undefined,
  removedMonthlyGoalIds?: string[]
): MonthlyGoalsStore {
  const removed = new Set(mergeRemovedMonthlyGoalIds([], removedMonthlyGoalIds));
  if (!removed.size) return normalizeMonthlyGoalsStore(store);
  const next = normalizeMonthlyGoalsStore(store);
  for (const month of Object.keys(next)) {
    const list = (next[month] || []).filter((item) => !removed.has(item.id));
    if (list.length) next[month] = list;
    else delete next[month];
  }
  return next;
}

export function normalizeMonthlyGoalsStore(raw: MonthlyGoalsStore | undefined): MonthlyGoalsStore {
  if (!raw || typeof raw !== 'object') return {};
  const out: MonthlyGoalsStore = {};
  for (const [key, list] of Object.entries(raw)) {
    const monthKey = String(key || '').trim();
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    const items = (Array.isArray(list) ? list : [])
      .map((item) => normalizeItem(item, monthKey))
      .filter((item): item is MonthlyGoalItem => Boolean(item));
    const byId = new Map<string, MonthlyGoalItem>();
    for (const item of items) {
      const prev = byId.get(item.id);
      if (!prev || goalStamp(item) >= goalStamp(prev)) byId.set(item.id, item);
    }
    if (byId.size) out[monthKey] = [...byId.values()];
  }
  return out;
}

function sortedMonthKeys(store: MonthlyGoalsStore) {
  return Object.keys(store).filter((k) => store[k]?.length).sort();
}

export function rollMonthForward(
  store: MonthlyGoalsStore,
  fromMonth: string,
  toMonth: string,
  removedMonthlyGoalIds?: string[]
): MonthlyGoalsStore {
  const base = stripRemovedMonthlyGoals(store, removedMonthlyGoalIds);
  const from = base[fromMonth] || [];
  if (!from.length) return base;
  const unchecked = from.filter((item) => !item.checked);
  if (!unchecked.length) return base;
  const next = { ...base };
  next[fromMonth] = from.filter((item) => item.checked);
  if (!next[fromMonth].length) delete next[fromMonth];
  const current = [...(next[toMonth] || [])];
  const ids = new Set(current.map((item) => item.id));
  for (const item of unchecked) {
    if (ids.has(item.id)) continue;
    current.push({ ...item, updatedAt: item.updatedAt || new Date().toISOString() });
    ids.add(item.id);
  }
  next[toMonth] = current;
  return next;
}

export function applyRolloversToMonth(
  store: MonthlyGoalsStore,
  targetMonth: string,
  removedMonthlyGoalIds?: string[]
): MonthlyGoalsStore {
  let next = stripRemovedMonthlyGoals(store, removedMonthlyGoalIds);
  const keys = sortedMonthKeys(next);
  if (!keys.length) return next;
  let cursor = keys[0];
  while (cursor < targetMonth) {
    const following = nextMonthKey(cursor);
    next = rollMonthForward(next, cursor, following, removedMonthlyGoalIds);
    cursor = following;
  }
  return next;
}

export function prepareMonthlyGoals(
  store: MonthlyGoalsStore | undefined,
  targetMonth: string,
  removedMonthlyGoalIds?: string[]
): { store: MonthlyGoalsStore; monthItems: MonthlyGoalItem[]; changed: boolean } {
  const normalized = stripRemovedMonthlyGoals(store, removedMonthlyGoalIds);
  const rolled = applyRolloversToMonth(normalized, targetMonth, removedMonthlyGoalIds);
  const changed = JSON.stringify(rolled) !== JSON.stringify(normalized);
  return {
    store: rolled,
    monthItems: rolled[targetMonth] || [],
    changed,
  };
}

export function monthlyGoalsProgress(items: MonthlyGoalItem[]) {
  const total = items.length;
  const done = items.filter((item) => item.checked).length;
  return { done, total };
}

function mergeGoalItem(a: MonthlyGoalItem, b: MonthlyGoalItem, preferB: boolean): MonthlyGoalItem {
  const stampA = goalStamp(a);
  const stampB = goalStamp(b);
  if (stampA !== stampB) return stampB >= stampA ? b : a;
  return preferB ? b : a;
}

export function mergeMonthlyGoals(
  a: MonthlyGoalsStore | undefined,
  b: MonthlyGoalsStore | undefined,
  preferB: boolean,
  removedMonthlyGoalIds?: string[]
): MonthlyGoalsStore {
  const removed = new Set(mergeRemovedMonthlyGoalIds([], removedMonthlyGoalIds));
  const left = stripRemovedMonthlyGoals(a, [...removed]);
  const right = stripRemovedMonthlyGoals(b, [...removed]);
  const months = new Set([...Object.keys(left), ...Object.keys(right)]);
  const out: MonthlyGoalsStore = {};
  for (const month of months) {
    const map = new Map<string, MonthlyGoalItem>();
    for (const item of left[month] || []) {
      if (!removed.has(item.id)) map.set(item.id, item);
    }
    for (const item of right[month] || []) {
      if (removed.has(item.id)) continue;
      const prev = map.get(item.id);
      map.set(item.id, prev ? mergeGoalItem(prev, item, preferB) : item);
    }
    if (map.size) out[month] = [...map.values()];
  }
  return out;
}

export function newMonthlyGoalItem(text: string, monthKey: string): MonthlyGoalItem {
  return {
    id: nid(),
    text: text.trim(),
    checked: false,
    createdMonth: monthKey,
    updatedAt: new Date().toISOString(),
  };
}

export function removeMonthlyGoalItem(
  store: MonthlyGoalsStore,
  itemId: string,
  removedMonthlyGoalIds?: string[]
): { store: MonthlyGoalsStore; removedMonthlyGoalIds: string[] } {
  const id = String(itemId || '').trim();
  if (!id) {
    return {
      store: normalizeMonthlyGoalsStore(store),
      removedMonthlyGoalIds: mergeRemovedMonthlyGoalIds([], removedMonthlyGoalIds),
    };
  }
  return {
    store: stripRemovedMonthlyGoals(store, [id]),
    removedMonthlyGoalIds: mergeRemovedMonthlyGoalIds(removedMonthlyGoalIds, [id]),
  };
}

export function updateMonthlyGoalItems(
  store: MonthlyGoalsStore,
  monthKey: string,
  items: MonthlyGoalItem[],
  removedMonthlyGoalIds?: string[]
): MonthlyGoalsStore {
  const next = { ...stripRemovedMonthlyGoals(store, removedMonthlyGoalIds) };
  const cleaned = items
    .map((item) => normalizeItem(item, monthKey))
    .filter((item): item is MonthlyGoalItem => Boolean(item));
  if (cleaned.length) next[monthKey] = cleaned;
  else delete next[monthKey];
  return next;
}

export function toggleMonthlyGoalItem(
  store: MonthlyGoalsStore,
  monthKey: string,
  itemId: string,
  checked: boolean,
  removedMonthlyGoalIds?: string[]
): MonthlyGoalsStore {
  const stamp = new Date().toISOString();
  const base = stripRemovedMonthlyGoals(store, removedMonthlyGoalIds);
  const list = base[monthKey] || [];
  return updateMonthlyGoalItems(
    base,
    monthKey,
    list.map((item) => (item.id === itemId ? { ...item, checked, updatedAt: stamp } : item)),
    removedMonthlyGoalIds
  );
}
