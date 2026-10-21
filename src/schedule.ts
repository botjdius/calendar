import { normalizeChecklistChecked } from './lessonChecklist';
import type { Closure, CycleIndex, LessonSession, MakeupInfo, PackPayment, SessionFile, Student } from './types';

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function nid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function wrapCycle(n: number): CycleIndex {
  const r = ((n - 1) % 4 + 4) % 4;
  return (r + 1) as CycleIndex;
}

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(iso: string) {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

export function addDays(iso: string, days: number) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function todayIso() {
  return toIso(new Date());
}

export function weekdayOf(iso: string) {
  return parseIso(iso).getDay();
}

export function nextOnWeekday(fromIso: string, weekday: number) {
  const d = parseIso(fromIso);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return toIso(d);
}

export function normalizeTime(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return '14:00';
  const pm = /오후|pm/i.test(text);
  const am = /오전|am/i.test(text);
  const withMin = text.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})/);
  const hourOnly = text.match(/(\d{1,2})\s*시/) || text.match(/(\d{1,2})/);
  let hour = 14;
  let min = 0;
  if (withMin) {
    hour = Number(withMin[1]);
    min = Number(withMin[2]);
  } else if (hourOnly) {
    hour = Number(hourOnly[1]);
  }
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  if (hour > 23) hour %= 24;
  if (min > 59) min = 0;
  return `${pad(hour)}:${pad(min)}`;
}

export function formatTime12(raw?: string) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const [hs, ms] = normalizeTime(text).split(':');
  const hour = Number(hs);
  const period = hour < 12 ? '오전' : '오후';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return ms === '00' ? `${period} ${hour12}시` : `${period} ${hour12}시 ${ms}분`;
}

export function parseWeekly(raw: string): { weekday: number; time: string } {
  const text = raw.trim();
  const dayIdx = WEEKDAYS.findIndex((w) => text.startsWith(w));
  const rest = dayIdx >= 0 ? text.slice((WEEKDAYS[dayIdx] || '').length) : text;
  return { weekday: dayIdx >= 0 ? dayIdx : 3, time: normalizeTime(rest) };
}

export function formatWeekly(weekday: number, time: string) {
  if (weekday < 0) return formatTime12(time) || '시간 미정';
  return `${WEEKDAYS[weekday] ?? ''} ${formatTime12(time)}`.trim();
}

export function countsToward(session: LessonSession) {
  if (session.status === 'cancelled') return false;
  if (session.makeup?.status === 'done' || session.makeup?.status === 'absent') return true;
  return session.status === 'attended' || session.status === 'absent';
}

export function isHolidaySession(session: Pick<LessonSession, 'status'>) {
  return session.status === 'cancelled';
}

export function sessionLabel(session: LessonSession) {
  if (isHolidaySession(session)) return '휴강으로 다음주로 이동';
  if (session.makeup?.status === 'done') return '보강 출석 (대체)';
  if (session.makeup?.status === 'absent') return '보강 불참';
  if (session.makeup?.status === 'planned') return '보강 예정';
  if (session.status === 'attended') return '출석';
  if (session.status === 'absent') return '불참석';
  return '대기';
}

export function applyAttendance(session: LessonSession, status: LessonSession['status']): LessonSession {
  if (session.makeup && status !== 'cancelled') {
    const makeupStatus = status === 'attended' ? 'done' : status === 'absent' ? 'absent' : 'planned';
    return { ...session, makeup: { ...session.makeup, status: makeupStatus } };
  }
  return { ...session, status };
}

export function sessionStats(student: Student) {
  const counted = student.sessions.filter(countsToward).length;
  const cancelled = student.sessions.filter((s) => s.status === 'cancelled').length;
  const remaining = student.sessions.filter((s) => !countsToward(s) && s.status !== 'cancelled').length;
  const last = [...student.sessions].reverse().find(countsToward);
  return {
    counted,
    cancelled,
    remaining,
    total: student.sessions.length,
    currentCycle: last?.cycle ?? student.startCycle ?? 1,
  };
}

export function packsOf(sessions: LessonSession[]) {
  const map = new Map<number, LessonSession[]>();
  for (const s of sessions) {
    const list = map.get(s.pack) ?? [];
    list.push(s);
    map.set(s.pack, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pack, list]) => ({ pack, sessions: sortSessions(list) }));
}

export function paymentForPack(student: Pick<Student, 'payments'>, pack: number): PackPayment {
  return student.payments?.find((p) => p.pack === pack) ?? { pack, paid: false };
}

export function openedPacksThrough(student: Pick<Student, 'sessions'>, session?: LessonSession) {
  const ordered = sortSessions(student.sessions || []);
  const end = session ? ordered.findIndex((s) => s.id === session.id) : ordered.length - 1;
  const until = end < 0 ? ordered : ordered.slice(0, end + 1);
  return [...new Set(until.filter((s) => s.status !== 'cancelled').map((s) => s.pack ?? 0))];
}

export function paidSessionForPack(
  student: Pick<Student, 'sessions'>,
  payment: PackPayment
): LessonSession | undefined {
  if (!payment.paid) return undefined;
  const ordered = sortSessions(student.sessions || []).filter((s) => s.status !== 'cancelled');
  if (payment.paidSessionId) {
    const marked = ordered.find((s) => s.id === payment.paidSessionId);
    if (marked) return marked;
  }
  const packSessions = ordered.filter((s) => (s.pack ?? 0) === payment.pack);
  if (payment.paidAt) {
    const sameDate = packSessions.find((s) => s.date === payment.paidAt);
    if (sameDate) return sameDate;
  }
  return packSessions[0];
}

export function paymentBoxesForSession(student: Pick<Student, 'sessions' | 'payments'>, session: LessonSession) {
  if (isHolidaySession(session)) return [];
  const opened = openedPacksThrough(student, session);
  const current = session.pack ?? 0;
  const boxes = opened.map((pack) => paymentForPack(student, pack));
  if (!boxes.some((p) => p.pack === current)) {
    boxes.push(paymentForPack(student, current));
  }
  const ordered = sortSessions(student.sessions || []);
  const here = ordered.findIndex((s) => s.id === session.id);
  return boxes.flatMap((p) => {
    if (!p.paid) return [p];
    const marked = paidSessionForPack(student, p);
    if (!marked) return session.pack === p.pack ? [p] : [];
    if (session.id === marked.id) return [p];
    const markedAt = ordered.findIndex((s) => s.id === marked.id);
    if (here > markedAt) return [];
    if (session.pack === p.pack && marked.pack === p.pack) return [{ pack: p.pack, paid: false }];
    return [];
  });
}

export function showPaymentBox(student: Pick<Student, 'sessions' | 'payments'>, session: LessonSession) {
  return paymentBoxesForSession(student, session).length > 0;
}

export function paymentBadge(student: Pick<Student, 'sessions' | 'payments'>): 'none' | 'paid' | 'unpaid' {
  const packs = openedPacksThrough(student);
  if (!packs.length) return 'none';
  return packs.some((pack) => !paymentForPack(student, pack).paid) ? 'unpaid' : 'paid';
}

export function upsertPayment(
  payments: PackPayment[] | undefined,
  pack: number,
  paid: boolean,
  paidAt?: string,
  paidSessionId?: string
): PackPayment[] {
  const next: PackPayment = {
    pack,
    paid,
    paidAt: paid ? paidAt || todayIso() : undefined,
    paidSessionId: paid ? paidSessionId || undefined : undefined,
  };
  const list = payments || [];
  if (list.some((p) => p.pack === pack)) {
    return list.map((p) => (p.pack === pack ? next : p));
  }
  return [...list, next];
}

export function paymentLabel(badge: 'none' | 'paid' | 'unpaid') {
  if (badge === 'paid') return '결제';
  if (badge === 'unpaid') return '미결제';
  return '';
}

export function lessonCheckPayNotes(
  student: Pick<Student, 'sessions' | 'payments'>,
  session: LessonSession
) {
  if (isHolidaySession(session)) return [];
  const notes: string[] = [];
  if (session.cycle === 4) notes.push('(결제 알리기)');
  const unpaid = paymentBoxesForSession(student, session).some((p) => !p.paid);
  if (unpaid) notes.push('(미결제)');
  return notes;
}

export function sortSessions(sessions: LessonSession[]) {
  return [...sessions].sort((a, b) => {
    const pa = a.pack ?? 0;
    const pb = b.pack ?? 0;
    if (pa !== pb) return pa - pb;
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    return a.cycle - b.cycle;
  });
}

export function isLockedSession(session: LessonSession) {
  if (session.makeup?.status === 'done' || session.makeup?.status === 'absent') return true;
  return session.status === 'attended' || session.status === 'absent';
}

export function hasOpenMakeup(session: Pick<LessonSession, 'makeup'>) {
  const makeup = session.makeup;
  if (!makeup?.date) return false;
  return makeup.status !== 'done' && makeup.status !== 'absent';
}

export function lessonDisplayDate(session: Pick<LessonSession, 'date' | 'makeup'>) {
  return session.makeup?.date || session.date || '';
}

export function lessonDisplayTime(session: Pick<LessonSession, 'time' | 'makeup'>) {
  return session.makeup?.time || session.time || '';
}

export function isArchivedLesson(session: LessonSession, today = todayIso()) {
  const date = lessonDisplayDate(session);
  return Boolean(date) && date < today;
}

export function splitSessionsAroundToday(sessions: LessonSession[], today = todayIso()) {
  const byDisplay = (a: LessonSession, b: LessonSession, newestFirst: boolean) => {
    const dateCmp = newestFirst
      ? lessonDisplayDate(b).localeCompare(lessonDisplayDate(a))
      : lessonDisplayDate(a).localeCompare(lessonDisplayDate(b));
    if (dateCmp) return dateCmp;
    const timeCmp = newestFirst
      ? lessonDisplayTime(b).localeCompare(lessonDisplayTime(a))
      : lessonDisplayTime(a).localeCompare(lessonDisplayTime(b));
    if (timeCmp) return timeCmp;
    if (newestFirst) {
      return (b.pack ?? 0) - (a.pack ?? 0) || b.cycle - a.cycle;
    }
    return (a.pack ?? 0) - (b.pack ?? 0) || a.cycle - b.cycle;
  };
  const upcoming = [...sessions]
    .filter((session) => !isArchivedLesson(session, today))
    .sort((a, b) => byDisplay(a, b, false));
  const past = [...sessions]
    .filter((session) => isArchivedLesson(session, today))
    .sort((a, b) => byDisplay(a, b, true));
  return { upcoming, past };
}

function blankSession(partial: Pick<LessonSession, 'cycle' | 'pack' | 'date' | 'time'>): LessonSession {
  return {
    id: nid(),
    status: 'pending',
    makeup: null,
    note: '',
    studentNote: '',
    attachments: [],
    ...partial,
  };
}

function nextCyclePack(cycle: CycleIndex, pack: number) {
  const nextCycle = wrapCycle(cycle + 1);
  return { cycle: nextCycle, pack: nextCycle === 1 ? pack + 1 : pack };
}

export function insertSessionAfter(
  sessions: LessonSession[],
  afterSessionId: string | undefined,
  opts: { time?: string; weekday?: number; startCycle?: CycleIndex; closures?: Closure[] }
): LessonSession[] {
  const ordered = sortSessions(sessions || []);
  let idx = afterSessionId ? ordered.findIndex((session) => session.id === afterSessionId) : ordered.length - 1;
  if (afterSessionId && idx < 0) idx = ordered.length - 1;
  const after = idx >= 0 ? ordered[idx] : undefined;
  const weekday = Number.isInteger(opts.weekday) ? ((opts.weekday as number) % 7 + 7) % 7 : 3;
  const extra = blankSession({
    cycle: after ? wrapCycle(after.cycle + 1) : wrapCycle(opts.startCycle || 1),
    pack: after ? (after.cycle === 4 ? (after.pack ?? 0) + 1 : after.pack ?? 0) : 0,
    date: after?.date || nextOnWeekday(todayIso(), weekday),
    time: normalizeTime(opts.time || after?.time || '14:00'),
  });
  const insertAt = idx >= 0 ? idx + 1 : 0;
  let cycle = extra.cycle;
  let pack = extra.pack;
  const shifted = ordered.slice(insertAt).map((session) => {
    if (session.status === 'cancelled' || isLockedSession(session)) return session;
    ({ cycle, pack } = nextCyclePack(cycle, pack));
    return { ...session, cycle, pack };
  });
  return realignAfter([...ordered.slice(0, insertAt), extra, ...shifted], after?.id || extra.id, opts);
}

export function sequenceSessions(sessions: LessonSession[]) {
  return [...sessions].sort((a, b) => {
    const pa = a.pack ?? 0;
    const pb = b.pack ?? 0;
    if (pa !== pb) return pa - pb;
    if ((a.cycle || 0) !== (b.cycle || 0)) return a.cycle - b.cycle;
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    return String(a.id).localeCompare(String(b.id));
  });
}

export function effectiveCursor(session: Pick<LessonSession, 'date' | 'makeup'>) {
  return session.makeup?.date || session.date || '';
}

export function nextLessonSlot(
  from: string,
  weekday: number,
  time?: string,
  closures?: Closure[]
) {
  if (!from) return from;
  const day = Number.isInteger(weekday) ? ((weekday % 7) + 7) % 7 : weekdayOf(from);
  const next = weekdayOf(from) === day ? addDays(from, 7) : nextOnWeekday(addDays(from, 1), day);
  return skipClosures(next, time || '', closures);
}

export function realignAfter(
  sessions: LessonSession[],
  anchorId: string | undefined,
  opts: { weekday?: number; time?: string; closures?: Closure[] } = {}
): LessonSession[] {
  const list = sessions || [];
  const holds = list.filter((session) => session.status === 'cancelled');
  const reals = sequenceSessions(list.filter((session) => session.status !== 'cancelled'));
  if (!reals.length) return list;
  let anchorIdx = anchorId ? reals.findIndex((session) => session.id === anchorId) : 0;
  if (anchorIdx < 0) anchorIdx = 0;
  const weekday = Number.isInteger(opts.weekday)
    ? (((opts.weekday as number) % 7) + 7) % 7
    : weekdayOf(reals[anchorIdx].date);
  const time = opts.time || reals[anchorIdx].time || '';
  const dates = new Map<string, string>();
  for (let i = 0; i <= anchorIdx; i += 1) dates.set(reals[i].id, reals[i].date);
  let cursor = effectiveCursor(reals[anchorIdx]);
  for (let i = anchorIdx + 1; i < reals.length; i += 1) {
    const session = reals[i];
    if (isLockedSession(session)) {
      dates.set(session.id, session.date);
      cursor = effectiveCursor(session) || session.date || cursor;
      continue;
    }
    const prev = reals[i - 1];
    const prevDate = dates.get(prev.id) || prev.date;
    if (session.date && session.date === prev.date && session.date === prevDate) {
      dates.set(session.id, prevDate);
      continue;
    }
    const next = nextLessonSlot(cursor, weekday, session.time || time, opts.closures);
    dates.set(session.id, next);
    cursor = next;
  }
  return [
    ...list
      .filter((session) => session.status !== 'cancelled')
      .map((session) => (dates.has(session.id) ? { ...session, date: dates.get(session.id) as string, originalDate: undefined } : session)),
    ...holds,
  ];
}

export function lastRealSession(sessions: LessonSession[]) {
  const reals = sequenceSessions((sessions || []).filter((session) => session.status !== 'cancelled'));
  return reals[reals.length - 1];
}

export function latestLessonDate(sessions: LessonSession[]) {
  return (sessions || [])
    .filter((session) => session.status !== 'cancelled')
    .reduce((max, session) => (session.date && session.date > max ? session.date : max), '');
}

export function weekAfterLatest(latest: string, time?: string, closures?: Closure[]) {
  if (!latest) return latest;
  return skipClosures(addDays(latest, 7), time || '', closures);
}

export function appendContinuingSessions(
  sessions: LessonSession[],
  count: number,
  opts: { weekday: number; time?: string; startCycle?: CycleIndex; cycle?: CycleIndex; closures?: Closure[] }
): LessonSession[] {
  const weekday = ((Number(opts.weekday) % 7) + 7) % 7;
  const time = normalizeTime(opts.time || '14:00');
  const last = lastRealSession(sessions);
  const latest = latestLessonDate(sessions);
  let cycle = opts.cycle
    ? wrapCycle(opts.cycle)
    : last
      ? wrapCycle(last.cycle + 1)
      : wrapCycle(opts.startCycle || 1);
  let pack = last ? (cycle <= last.cycle ? (last.pack ?? 0) + 1 : last.pack ?? 0) : 0;
  let date = latest ? weekAfterLatest(latest, time, opts.closures) : nextOnWeekday(todayIso(), weekday);
  const extra: LessonSession[] = [];
  for (let i = 0; i < count; i += 1) {
    extra.push(blankSession({ cycle, pack, date, time }));
    ({ cycle, pack } = nextCyclePack(cycle, pack));
    date = weekAfterLatest(date, time, opts.closures);
  }
  return [...(sessions || []), ...extra];
}

export function removeSessionById(sessions: LessonSession[], sessionId: string) {
  return (sessions || []).filter((session) => session.id !== sessionId);
}

export function generatePack(opts: {
  startCycle: CycleIndex;
  pack: number;
  weekday: number;
  time: string;
  fromDate: string;
  count?: number;
  exactFirst?: boolean;
}): LessonSession[] {
  const count = opts.count ?? 4;
  const weekday = ((opts.weekday % 7) + 7) % 7;
  const time = normalizeTime(opts.time);
  const seed = opts.fromDate || todayIso();
  const first = opts.exactFirst ? seed : nextOnWeekday(seed, weekday);
  return Array.from({ length: count }, (_, i) => ({
    id: nid(),
    cycle: wrapCycle(opts.startCycle + i),
    pack: opts.pack,
    status: 'pending' as const,
    date: addDays(first, i * 7),
    time,
    makeup: null,
    note: '',
    studentNote: '',
    attachments: [],
  }));
}

export function dateHitsClosure(iso: string, time: string, closures: Closure[] | undefined) {
  if (!iso) return false;
  return (closures || []).some(
    (c) => isPublicClosure(c) && closureCovers(c, iso) && timeMatches(time || '', c.time || '')
  );
}

export function skipClosures(iso: string, time: string, closures: Closure[] | undefined) {
  if (!iso) return iso;
  let cur = iso;
  for (let i = 0; i < 60; i += 1) {
    if (!dateHitsClosure(cur, time, closures)) return cur;
    cur = addDays(cur, 7);
  }
  return cur;
}

function lessonDaysInClosures(closures: Closure[] | undefined, weekday: number, time: string) {
  const days: string[] = [];
  for (const closure of closures || []) {
    if (!isPublicClosure(closure)) continue;
    if (!timeMatches(time, closure.time || '')) continue;
    for (const day of eachDay(closure.date, closureEnd(closure))) {
      if (weekdayOf(day) === weekday) days.push(day);
    }
  }
  return [...new Set(days)].sort();
}

export function holidayHoldId(date: string, time: string) {
  return `holiday:${date}:${time || 'all'}`;
}

export function dedupeHolidaySessions(sessions: LessonSession[]) {
  const chosen = new Map<string, LessonSession>();
  for (const session of sessions || []) {
    if (session.status !== 'cancelled' || !session.date) continue;
    const previous = chosen.get(session.date);
    if (!previous || session.id.startsWith('holiday:')) chosen.set(session.date, session);
  }
  return (sessions || []).filter(
    (session) =>
      session.status !== 'cancelled' ||
      !session.date ||
      chosen.get(session.date) === session
  );
}

export function applyClosuresToSessions(
  sessions: LessonSession[],
  time: string,
  closures: Closure[] | undefined,
  weekday?: number
) {
  const reals = sessions.filter((session) => session.status !== 'cancelled');
  const ordered = sortSessions(reals);
  const seedDate = ordered.find((session) => session.date)?.date || '';
  const lessonWeekday =
    Number.isInteger(weekday) && (weekday as number) >= 0 ? ((weekday as number) % 7 + 7) % 7 : weekdayOf(seedDate);
  const extras: LessonSession[] = [];
  const placed = new Map<string, string>();

  const occupied = (iso: string, exceptId: string) => {
    if (!iso) return false;
    if (extras.some((hold) => hold.date === iso)) return true;
    for (const [id, date] of placed) {
      if (id !== exceptId && date === iso) return true;
    }
    return ordered.some(
      (session) => isLockedSession(session) && session.date === iso && session.id !== exceptId && !placed.has(session.id)
    );
  };

  const addHold = (cycle: number, pack: number, date: string, sessionTime: string) => {
    if (!date || extras.some((hold) => hold.date === date)) return;
    extras.push({
      id: holidayHoldId(date, sessionTime || time),
      cycle: wrapCycle(cycle),
      pack,
      status: 'cancelled',
      date,
      time: sessionTime || time,
      makeup: null,
      note: '',
      studentNote: '',
      attachments: [],
    });
  };

  for (const session of ordered) {
    if (isLockedSession(session)) {
      if (session.date) placed.set(session.id, session.date);
      continue;
    }
    const sessionTime = session.time || time;
    const origin =
      session.originalDate && dateHitsClosure(session.originalDate, sessionTime, closures)
        ? session.originalDate
        : session.date;
    let next = session.date || '';
    if (!next) continue;
    const hitOwn = dateHitsClosure(origin || next, sessionTime, closures);
    if (hitOwn && origin) {
      addHold(session.cycle, session.pack ?? 0, origin, sessionTime);
      if (next === origin || dateHitsClosure(next, sessionTime, closures)) next = addDays(origin, 7);
    }
    for (let i = 0; i < 60; i += 1) {
      const closed = dateHitsClosure(next, sessionTime, closures);
      const taken = occupied(next, session.id);
      const keepOwnSameDay =
        !closed &&
        !hitOwn &&
        next === session.date &&
        ordered.some((other) => other.id !== session.id && other.date === session.date);
      if (!closed && (!taken || keepOwnSameDay)) break;
      if (closed && hitOwn) addHold(session.cycle, session.pack ?? 0, next, sessionTime);
      next = addDays(next, 7);
    }
    placed.set(session.id, next);
  }

  for (const day of lessonDaysInClosures(closures, lessonWeekday, time)) {
    if (ordered.some((session) => isLockedSession(session) && session.date === day)) continue;
    if (extras.some((hold) => hold.date === day)) continue;
    const after = skipClosures(addDays(day, 7), time, closures);
    const moved =
      ordered.find((session) => placed.get(session.id) === after) ||
      ordered
        .filter((session) => (placed.get(session.id) || '') > day)
        .sort((a, b) => (placed.get(a.id) || '').localeCompare(placed.get(b.id) || ''))[0];
    const prev = [...ordered]
      .filter((session) => (placed.get(session.id) || '') && (placed.get(session.id) || '') < day)
      .sort((a, b) => (placed.get(b.id) || '').localeCompare(placed.get(a.id) || ''))[0];
    if (moved) addHold(moved.cycle, moved.pack ?? 0, day, moved.time || time);
    else if (prev) addHold(wrapCycle(prev.cycle + 1), prev.pack ?? 0, day, prev.time || time);
  }

  return dedupeHolidaySessions([
    ...reals.map((session) => {
      const date = placed.get(session.id);
      if (!date) return { ...session, originalDate: undefined };
      return { ...session, date, originalDate: undefined };
    }),
    ...extras,
  ]);
}

export function postponeOverlaps(
  sessions: LessonSession[],
  time: string,
  closures: Closure[] | undefined,
  weekday?: number
) {
  return applyClosuresToSessions(sessions, time, closures, weekday);
}

export const MAKEUP_WINDOW_DAYS = 7;
export const MAKEUP_LOCK_DAYS = 3;

export function makeupWindow(sessionDate: string) {
  if (!sessionDate) return null;
  return {
    start: addDays(sessionDate, -MAKEUP_WINDOW_DAYS),
    end: addDays(sessionDate, MAKEUP_WINDOW_DAYS),
  };
}

export function slotInMakeupWindow(slotDate: string, sessionDate: string) {
  const window = makeupWindow(sessionDate);
  if (!window || !slotDate) return false;
  return slotDate >= window.start && slotDate <= window.end;
}

export function makeupRequestLocked(sessionDate: string, today = todayIso()) {
  if (!sessionDate) return true;
  return today >= addDays(sessionDate, -MAKEUP_LOCK_DAYS);
}

export function canRequestMakeupForSession(session: Pick<LessonSession, 'date' | 'status'>, today = todayIso()) {
  if (!session?.date) return false;
  if (isHolidaySession(session)) return false;
  if (session.status === 'attended') return false;
  if (makeupRequestLocked(session.date, today)) return false;
  return true;
}

export function makeupRequestBlockReason(
  session: Pick<LessonSession, 'date' | 'status'> | undefined,
  slotDate?: string,
  today = todayIso()
) {
  if (!session) return '바꿀 레슨 회차를 찾을 수 없습니다.';
  if (isHolidaySession(session)) return '휴강 회차는 보강으로 바꿀 수 없습니다.';
  if (session.status === 'attended') return '이미 출석한 회차는 보강으로 바꿀 수 없습니다.';
  if (makeupRequestLocked(session.date, today)) return '레슨 3일 전부터는 보강 신청을 할 수 없습니다.';
  if (slotDate && !slotInMakeupWindow(slotDate, session.date)) {
    return '이 시간은 해당 레슨일 기준 앞뒤 1주 안의 보강 시간이 아닙니다.';
  }
  return '';
}

export function eligibleMakeupSessions(sessions: LessonSession[], today = todayIso()) {
  return (sessions || [])
    .filter((s) => canRequestMakeupForSession(s, today))
    .sort(
      (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || ''))
    );
}

export function sessionsForMakeupSlot(sessions: LessonSession[], slotDate: string, today = todayIso()) {
  return eligibleMakeupSessions(sessions, today).filter((s) => slotInMakeupWindow(slotDate, s.date));
}

export function studentsEligibleForOpenSlot(
  students: Pick<Student, 'id' | 'sessions' | 'linkedUid'>[],
  slotDate: string,
  today = todayIso()
) {
  return (students || []).filter(
    (student) => sessionsForMakeupSlot(student.sessions || [], slotDate, today).length > 0
  );
}

export function openSlotWhenLabel(slot: { date?: string; startTime?: string; endTime?: string }) {
  if (!slot?.date) return '';
  const d = parseIso(slot.date);
  const day = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  const start = formatTime12(slot.startTime);
  const end = slot.endTime ? `–${formatTime12(slot.endTime)}` : '';
  const time = `${start}${end}`;
  return [day, time].filter(Boolean).join(' ');
}

export function slotsForStudentMakeup(
  openSlots: { id: string; date: string }[],
  sessions: LessonSession[],
  today = todayIso()
) {
  const eligible = eligibleMakeupSessions(sessions, today);
  return (openSlots || []).filter((slot) => eligible.some((s) => slotInMakeupWindow(slot.date, s.date)));
}

export function slotsForSessionMakeup(
  openSlots: { id: string; date: string }[],
  session: Pick<LessonSession, 'date' | 'status'>,
  today = todayIso()
) {
  if (!canRequestMakeupForSession(session, today)) return [];
  return (openSlots || []).filter((slot) => slotInMakeupWindow(slot.date, session.date));
}

export function applyMakeupReplacement(
  student: Student,
  sessionId: string,
  makeup: MakeupInfo | null,
  _closures: Closure[] = []
): Student {
  return {
    ...student,
    sessions: (student.sessions || []).map((s) => (s.id === sessionId ? { ...s, makeup } : s)),
  };
}

export function placeAvoidingClosures(
  sessions: LessonSession[],
  time: string,
  closures: Closure[] | undefined,
  weekday = 0
) {
  return postponeOverlaps(sessions, time, closures, weekday);
}

export function applyLessonSetup(
  student: Student,
  opts: { weekday: number; time?: string; startCycle: CycleIndex; firstDate?: string; applyTime?: boolean },
  closures: Closure[] = []
): Student {
  const weekday = ((Number(opts.weekday) % 7) + 7) % 7;
  const time = normalizeTime(opts.time || student.time);
  const startCycle = wrapCycle(opts.startCycle || student.startCycle || 1);
  const existing = student.sessions || [];
  const firstPack = existing.filter((s) => (s.pack ?? 0) === 0);
  const rest = existing.filter((s) => (s.pack ?? 0) !== 0);
  const locked = sortSessions(firstPack.filter((s) => isLockedSession(s)));
  const unlocked = sortSessions(firstPack.filter((s) => !isLockedSession(s) && s.status !== 'cancelled'));
  const seed =
    opts.firstDate ||
    unlocked.find((s) => s.date)?.date ||
    sortSessions(existing).find((s) => s.date)?.date ||
    todayIso();
  const first = nextOnWeekday(seed, weekday);
  let count = 4 - locked.length;
  if (unlocked.length > count) count = unlocked.length;
  if (!locked.length && !unlocked.length) count = 4;
  if (count < 1) count = 0;
  const planned = count
    ? generatePack({
        startCycle,
        pack: 0,
        weekday,
        time,
        fromDate: first,
        count,
        exactFirst: true,
      })
    : [];
  const rebuilt = planned.map((plan, i) => {
    const prev = unlocked[i];
    if (!prev) return plan;
    return {
      ...prev,
      cycle: plan.cycle,
      pack: 0,
      date: plan.date,
      time: opts.applyTime ? plan.time : prev.time || plan.time,
      status: prev.status === 'cancelled' ? 'pending' : prev.status,
      originalDate: undefined,
    };
  });
  return {
    ...student,
    weekday,
    time,
    weeklyTime: formatWeekly(weekday, time),
    startCycle,
    sessions: applyClosuresToSessions([...locked, ...rebuilt, ...rest], time, closures, weekday),
  };
}

export function applyFixedSchedule(
  student: Student,
  opts: { weekday: number; time: string; startCycle: CycleIndex; firstDate?: string },
  closures: Closure[] = []
): Student {
  return applyLessonSetup(student, { ...opts, applyTime: true }, closures);
}

export function nextPackStart(student: Student): { startCycle: CycleIndex; pack: number; fromDate: string } {
  const last = lastRealSession(student.sessions || []);
  const latest = latestLessonDate(student.sessions || []);
  if (!last) {
    return { startCycle: student.startCycle || 1, pack: 0, fromDate: nextOnWeekday(todayIso(), student.weekday) };
  }
  return {
    startCycle: wrapCycle(last.cycle + 1),
    pack: last.cycle === 4 ? (last.pack ?? 0) + 1 : last.pack ?? 0,
    fromDate: nextLessonSlot(latest || last.date, student.weekday, student.time),
  };
}

function timeMatches(sessionTime: string, closureTime: string) {
  if (!closureTime.trim()) return true;
  return normalizeTime(sessionTime) === normalizeTime(closureTime);
}

export function daysBetween(from: string, to: string) {
  const a = parseIso(from);
  const b = parseIso(to);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function rebuildFromFirstDate(
  sessions: LessonSession[],
  firstDate: string,
  time?: string,
  closures: Closure[] = []
) {
  if (!firstDate) return sessions;
  const placed = sessions.map((session, i, all) => {
    if (isLockedSession(session)) return session;
    const firstUnlocked = all.find((s) => !isLockedSession(s));
    return session.id === firstUnlocked?.id ? { ...session, date: firstDate, time: time || session.time } : session;
  });
  return placeAvoidingClosures(placed, time || '', closures);
}

export function retargetFollowing(sessions: LessonSession[], sessionId: string, newDate: string, newTime?: string) {
  if (!newDate) return sessions || [];
  return (sessions || []).map((session) => {
    if (session.id !== sessionId) return session;
    return { ...session, date: newDate, time: newTime || session.time };
  });
}

export function closureEnd(c: Pick<Closure, 'date' | 'endDate'>) {
  const end = c.endDate || c.date;
  return end < c.date ? c.date : end;
}

export function eachDay(start: string, end: string) {
  if (!start) return [];
  const last = !end || end < start ? start : end;
  const days: string[] = [];
  let cur = start;
  while (cur <= last) {
    days.push(cur);
    cur = addDays(cur, 1);
    if (days.length > 366) break;
  }
  return days;
}

export function closureCovers(c: Pick<Closure, 'date' | 'endDate'>, iso: string) {
  return Boolean(iso) && iso >= c.date && iso <= closureEnd(c);
}

export function isPublicClosure(c: Pick<Closure, 'scope'>) {
  return !c.scope || c.scope === 'all';
}

export function isClosureActive(
  c: Pick<Closure, 'date' | 'endDate'>,
  onDate = todayIso()
) {
  return Boolean(c.date) && closureEnd(c) >= onDate;
}

export function isPublicHolidayDate(iso: string, closures?: Closure[]) {
  if (!iso) return false;
  return (closures || []).some((c) => isPublicClosure(c) && closureCovers(c, iso));
}

export function hideFromLessonCheck(session: LessonSession, closures?: Closure[]) {
  if (isHolidaySession(session)) return true;
  return isPublicHolidayDate(lessonDisplayDate(session), closures);
}

export function lessonCheckHolidayDays(
  closures: Closure[] | undefined,
  students: Array<Pick<Student, 'weekday' | 'sessions'>>,
  today = todayIso()
) {
  const weekdays = new Set(
    (students || [])
      .map((st) => Number(st.weekday))
      .filter((day) => Number.isInteger(day) && day >= 0)
      .map((day) => ((day % 7) + 7) % 7)
  );
  const holdDates = new Set<string>();
  for (const st of students || []) {
    for (const session of st.sessions || []) {
      if (isHolidaySession(session) && session.date) holdDates.add(session.date);
    }
  }
  const byDate = new Map<string, string>();
  for (const closure of closures || []) {
    if (!isPublicClosure(closure) || !closure.date) continue;
    const days = eachDay(closure.date, closureEnd(closure));
    const range = days.length > 1;
    const reason = String(closure.reason || '').trim();
    for (const day of days) {
      if (range && !weekdays.has(weekdayOf(day)) && !holdDates.has(day)) continue;
      const prev = byDate.get(day);
      if (!prev) byDate.set(day, reason);
      else if (reason && !prev) byDate.set(day, reason);
    }
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, reason]) => ({ date, reason, past: Boolean(date) && date < today }));
}

export function closureLabel(c: Pick<Closure, 'date' | 'endDate' | 'time' | 'reason'>) {
  const end = closureEnd(c);
  const days = !end || end === c.date ? c.date : `${c.date} ~ ${end}`;
  const when = c.time?.trim() ? formatTime12(c.time) : '종일';
  return `${days}  ${when}${c.reason ? `  · ${c.reason}` : ''}`;
}

export function sessionCoveredByClosure(
  session: Pick<LessonSession, 'date' | 'originalDate' | 'time' | 'status'>,
  closure: Closure,
  fallbackTime = ''
) {
  if (!isPublicClosure(closure)) return false;
  if (!timeMatches(session.time || fallbackTime, closure.time || '')) return false;
  return Boolean(session.date && closureCovers(closure, session.date));
}

export function sessionHitsClosure(
  session: Pick<LessonSession, 'date' | 'time' | 'status' | 'makeup'>,
  closure: Closure,
  fallbackTime = ''
) {
  if (!isPublicClosure(closure)) return false;
  const makeup = session.makeup;
  if (makeup?.date && makeup.status !== 'done' && makeup.status !== 'absent') {
    if (
      closureCovers(closure, makeup.date) &&
      timeMatches(makeup.time || session.time || fallbackTime, closure.time || '')
    ) {
      return true;
    }
    if (makeup.date !== session.date) return false;
  }
  if (session.status === 'cancelled' || session.status === 'attended' || session.status === 'absent') return false;
  return Boolean(
    session.date &&
      closureCovers(closure, session.date) &&
      timeMatches(session.time || fallbackTime, closure.time || '')
  );
}

export function studentsAffectedByClosure(
  students: Pick<Student, 'id' | 'time' | 'sessions' | 'linkedUid'>[],
  closure: Closure
) {
  return (students || []).filter((student) =>
    (student.sessions || []).some((session) => sessionHitsClosure(session, closure, student.time))
  );
}

export function closureWhenLabel(c: Pick<Closure, 'date' | 'endDate' | 'time' | 'reason'>) {
  if (!c?.date) return '';
  const start = parseIso(c.date);
  const startDay = `${start.getMonth() + 1}/${start.getDate()}(${WEEKDAYS[start.getDay()]})`;
  const endIso = closureEnd(c);
  const end = endIso && endIso !== c.date ? parseIso(endIso) : null;
  const range = end ? `–${end.getMonth() + 1}/${end.getDate()}(${WEEKDAYS[end.getDay()]})` : '';
  const when = c.time?.trim() ? formatTime12(c.time) : '종일';
  const reason = String(c.reason || '').trim();
  return [`${startDay}${range}`, when, reason ? `· ${reason}` : ''].filter(Boolean).join(' ');
}

export function applyAllHolidays(students: Student[], closures: Closure[]): Student[] {
  return students.map((st) => {
    const original = new Map((st.sessions || []).map((session) => [session.id, session.date]));
    let sessions = applyClosuresToSessions(st.sessions || [], st.time, closures, st.weekday);
    const moved = sessions.find(
      (session) => session.status !== 'cancelled' && original.has(session.id) && original.get(session.id) !== session.date
    );
    if (moved) {
      sessions = applyClosuresToSessions(
        realignAfter(sessions, moved.id, { weekday: st.weekday, time: st.time, closures }),
        st.time,
        closures,
        st.weekday
      );
    }
    return { ...st, sessions };
  });
}

export function applyHoliday(students: Student[], closure: Closure, allClosures?: Closure[]): Student[] {
  return applyAllHolidays(students, allClosures?.length ? allClosures : [closure]);
}

export function normalizeSession(raw: Record<string, unknown>, fallbackTime: string, pack = 0): LessonSession {
  const scheduledAt = String(raw.scheduledAt || '');
  const [oldDate, oldTime] = scheduledAt.split(' ');
  const index = Number(raw.index || raw.cycle || 1);
  const statusRaw = String(raw.status || 'pending');
  const status =
    statusRaw === 'done' || statusRaw === 'attended'
      ? 'attended'
      : statusRaw === 'cancelled'
        ? 'cancelled'
        : statusRaw === 'absent'
          ? 'absent'
          : 'pending';
  const makeupRaw = raw.makeup as MakeupInfo | null | undefined;
  return {
    id: String(raw.id || nid()),
    cycle: wrapCycle(index),
    pack: Number(raw.pack ?? pack),
    status,
    date: String(raw.date || oldDate || ''),
    time: String(raw.time || oldTime || fallbackTime || ''),
    originalDate: raw.originalDate ? String(raw.originalDate) : undefined,
    makeup: makeupRaw && makeupRaw.date ? makeupRaw : null,
    note: String(raw.note || ''),
    studentNote: String(raw.studentNote || ''),
    checklistChecked: normalizeChecklistChecked(raw.checklistChecked),
    attachments: Array.isArray(raw.attachments)
      ? (raw.attachments as SessionFile[]).filter((f) => f && f.id && f.uri)
      : [],
    removedAttachmentIds: Array.isArray(raw.removedAttachmentIds)
      ? [...new Set(raw.removedAttachmentIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [],
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
  };
}

function normalizePayments(
  raw: Student & { paidAt?: string },
  sessions: LessonSession[]
): PackPayment[] {
  const listed = Array.isArray(raw.payments)
    ? raw.payments
        .filter((p) => p && Number.isInteger(p.pack))
        .map((p) => ({
          pack: p.pack,
          paid: Boolean(p.paid),
          paidAt: p.paidAt || undefined,
          paidSessionId: p.paidSessionId || undefined,
        }))
    : [];
  if (listed.length) return listed;
  if (raw.paid) {
    return [{ pack: 0, paid: true, paidAt: raw.paidAt }];
  }
  return [];
}

export function normalizeStudent(raw: Student | (Student & { makeupCredits?: number; makeups?: unknown[]; paidAt?: string })): Student {
  const weekly = parseWeekly(raw.weeklyTime || `${WEEKDAYS[raw.weekday] ?? '수'} ${raw.time || '14:00'}`);
  const weekday = Number.isInteger(raw.weekday) && raw.weekday >= 0 ? raw.weekday : weekly.weekday;
  const time = raw.time || weekly.time;
  const removedSessionIds = [
    ...new Set((raw.removedSessionIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
  ];
  const removed = new Set(removedSessionIds);
  const sessions = dedupeHolidaySessions(
    (raw.sessions || [])
      .filter((session) => session?.id && !removed.has(session.id))
      .map((s, i) => normalizeSession(s as unknown as Record<string, unknown>, time, Math.floor(i / 4)))
  );
  const payments = normalizePayments(raw, sessions);
  const badge = paymentBadge({ sessions, payments });
  return {
    id: raw.id,
    name: raw.name,
    joinCode: raw.joinCode,
    linkedUid: raw.linkedUid ?? null,
    paid: badge !== 'unpaid',
    payments,
    weekday,
    time,
    weeklyTime: formatWeekly(weekday, time),
    startCycle: wrapCycle(raw.startCycle || sessions[0]?.cycle || 1),
    sessions,
    removedSessionIds,
  };
}
