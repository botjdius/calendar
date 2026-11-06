export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function nid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function wrapCycle(n) {
  const r = ((n - 1) % 4 + 4) % 4;
  return r + 1;
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function toIso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(iso) {
  const [y, m, day] = String(iso || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

export function addDays(iso, days) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function todayIso() {
  return toIso(new Date());
}

export function weekdayOf(iso) {
  return parseIso(iso).getDay();
}

export function nextOnWeekday(fromIso, weekday) {
  const d = parseIso(fromIso);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return toIso(d);
}

export function normalizeTime(raw) {
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

export function formatTime12(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const [hs, ms] = normalizeTime(text).split(':');
  const hour = Number(hs);
  const period = hour < 12 ? '오전' : '오후';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return ms === '00' ? `${period} ${hour12}시` : `${period} ${hour12}시 ${ms}분`;
}

export function formatWeekly(weekday, time) {
  if (weekday < 0) return formatTime12(time) || '시간 미정';
  return `${WEEKDAYS[weekday] ?? ''} ${formatTime12(time)}`.trim();
}

export function daysBetween(from, to) {
  const a = parseIso(from);
  const b = parseIso(to);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function closureEnd(c) {
  const end = c.endDate || c.date;
  return end < c.date ? c.date : end;
}

export function eachDay(start, end) {
  if (!start) return [];
  const last = !end || end < start ? start : end;
  const days = [];
  let cur = start;
  while (cur <= last) {
    days.push(cur);
    cur = addDays(cur, 1);
    if (days.length > 366) break;
  }
  return days;
}

export function closureCovers(c, iso) {
  return Boolean(iso) && iso >= c.date && iso <= closureEnd(c);
}

export function isPublicClosure(c) {
  return !c?.scope || c.scope === 'all';
}

export function isClosureActive(c, onDate = todayIso()) {
  return Boolean(c?.date) && closureEnd(c) >= onDate;
}

export function isPublicHolidayDate(iso, closures) {
  if (!iso) return false;
  return (closures || []).some((c) => isPublicClosure(c) && closureCovers(c, iso));
}

export function hideFromLessonCheck(session, closures) {
  if (session?.status === 'cancelled') return true;
  return isPublicHolidayDate(lessonDisplayDate(session), closures);
}

export function lessonCheckHolidayDays(closures, students, today = todayIso()) {
  const weekdays = new Set(
    (students || [])
      .map((st) => Number(st.weekday))
      .filter((day) => Number.isInteger(day) && day >= 0)
      .map((day) => ((day % 7) + 7) % 7)
  );
  const holdDates = new Set();
  for (const st of students || []) {
    for (const session of st.sessions || []) {
      if (session.status === 'cancelled' && session.date) holdDates.add(session.date);
    }
  }
  const byDate = new Map();
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

export function closureLabel(c) {
  const end = closureEnd(c);
  const days = !end || end === c.date ? c.date : `${c.date} ~ ${end}`;
  const when = c.time?.trim() ? formatTime12(c.time) : '종일';
  return `${days}  ${when}${c.reason ? `  · ${c.reason}` : ''}`;
}

function timeMatches(sessionTime, closureTime) {
  if (!String(closureTime || '').trim()) return true;
  return normalizeTime(sessionTime) === normalizeTime(closureTime);
}

export function isLockedSession(session) {
  if (session.makeup?.status === 'done' || session.makeup?.status === 'absent') return true;
  return session.status === 'attended' || session.status === 'absent';
}

export function hasOpenMakeup(session) {
  const makeup = session.makeup;
  if (!makeup?.date) return false;
  return makeup.status !== 'done' && makeup.status !== 'absent';
}

export function lessonDisplayDate(session) {
  return session.makeup?.date || session.date || '';
}

export function lessonDisplayTime(session) {
  return session.makeup?.time || session.time || '';
}

export function isArchivedLesson(session, today = todayIso()) {
  const date = lessonDisplayDate(session);
  return Boolean(date) && date < today;
}

export function sortSessions(sessions) {
  return [...sessions].sort((a, b) => {
    const pa = a.pack ?? 0;
    const pb = b.pack ?? 0;
    if (pa !== pb) return pa - pb;
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.cycle || 0) - (b.cycle || 0);
  });
}

export function splitSessionsAroundToday(sessions, today = todayIso()) {
  const byDisplay = (a, b, newestFirst) => {
    const dateCmp = newestFirst
      ? lessonDisplayDate(b).localeCompare(lessonDisplayDate(a))
      : lessonDisplayDate(a).localeCompare(lessonDisplayDate(b));
    if (dateCmp) return dateCmp;
    const timeCmp = newestFirst
      ? lessonDisplayTime(b).localeCompare(lessonDisplayTime(a))
      : lessonDisplayTime(a).localeCompare(lessonDisplayTime(b));
    if (timeCmp) return timeCmp;
    if (newestFirst) {
      return (b.pack ?? 0) - (a.pack ?? 0) || (b.cycle || 0) - (a.cycle || 0);
    }
    return (a.pack ?? 0) - (b.pack ?? 0) || (a.cycle || 0) - (b.cycle || 0);
  };
  const upcoming = [...sessions]
    .filter((session) => !isArchivedLesson(session, today))
    .sort((a, b) => byDisplay(a, b, false));
  const past = [...sessions]
    .filter((session) => isArchivedLesson(session, today))
    .sort((a, b) => byDisplay(a, b, true));
  return { upcoming, past };
}

function blankSession(partial) {
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

function nextCyclePack(cycle, pack) {
  const nextCycle = wrapCycle(cycle + 1);
  return { cycle: nextCycle, pack: nextCycle === 1 ? pack + 1 : pack };
}

export function insertSessionAfter(sessions, afterSessionId, opts = {}) {
  const ordered = sortSessions(sessions || []);
  let idx = afterSessionId ? ordered.findIndex((session) => session.id === afterSessionId) : ordered.length - 1;
  if (afterSessionId && idx < 0) idx = ordered.length - 1;
  const after = idx >= 0 ? ordered[idx] : undefined;
  const weekday = Number.isInteger(opts.weekday) ? ((opts.weekday % 7) + 7) % 7 : 3;
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

export function sequenceSessions(sessions) {
  return [...sessions].sort((a, b) => {
    const pa = a.pack ?? 0;
    const pb = b.pack ?? 0;
    if (pa !== pb) return pa - pb;
    if ((a.cycle || 0) !== (b.cycle || 0)) return a.cycle - b.cycle;
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    return String(a.id).localeCompare(String(b.id));
  });
}

export function effectiveCursor(session) {
  return session.makeup?.date || session.date || '';
}

export function nextLessonSlot(from, weekday, time, closures) {
  if (!from) return from;
  const day = Number.isInteger(weekday) ? ((weekday % 7) + 7) % 7 : weekdayOf(from);
  const next = weekdayOf(from) === day ? addDays(from, 7) : nextOnWeekday(addDays(from, 1), day);
  return skipClosures(next, time || '', closures);
}

export function realignAfter(sessions, anchorId, opts = {}) {
  const list = sessions || [];
  const holds = list.filter((session) => session.status === 'cancelled');
  const reals = sequenceSessions(list.filter((session) => session.status !== 'cancelled'));
  if (!reals.length) return list;
  let anchorIdx = anchorId ? reals.findIndex((session) => session.id === anchorId) : 0;
  if (anchorIdx < 0) anchorIdx = 0;
  const weekday = Number.isInteger(opts.weekday) ? ((opts.weekday % 7) + 7) % 7 : weekdayOf(reals[anchorIdx].date);
  const time = opts.time || reals[anchorIdx].time || '';
  const dates = new Map();
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
      .map((session) => (dates.has(session.id) ? { ...session, date: dates.get(session.id), originalDate: undefined } : session)),
    ...holds,
  ];
}

export function lastRealSession(sessions) {
  const reals = sequenceSessions((sessions || []).filter((session) => session.status !== 'cancelled'));
  return reals[reals.length - 1];
}

export function latestLessonDate(sessions) {
  return (sessions || [])
    .filter((session) => session.status !== 'cancelled')
    .reduce((max, session) => (session.date && session.date > max ? session.date : max), '');
}

export function weekAfterLatest(latest, time, closures) {
  if (!latest) return latest;
  return skipClosures(addDays(latest, 7), time || '', closures);
}

export function inferContinuingPack(last, cycle) {
  if (!last) return 0;
  return cycle <= last.cycle ? (last.pack ?? 0) + 1 : last.pack ?? 0;
}

export function continuingPackOptions(sessions) {
  const packs = new Set();
  for (const s of sessions || []) {
    if (s.status !== 'cancelled') packs.add(s.pack ?? 0);
  }
  const max = packs.size ? Math.max(...packs) : -1;
  packs.add(max + 1);
  return [...packs].sort((a, b) => a - b);
}

export function appendContinuingSessions(sessions, count, opts = {}) {
  const weekday = ((Number(opts.weekday) % 7) + 7) % 7;
  const time = normalizeTime(opts.time || '14:00');
  const last = lastRealSession(sessions);
  const latest = latestLessonDate(sessions);
  let cycle = opts.cycle
    ? wrapCycle(opts.cycle)
    : last
      ? wrapCycle(last.cycle + 1)
      : wrapCycle(opts.startCycle || 1);
  let pack =
    Number.isInteger(opts.pack) && opts.pack >= 0 ? opts.pack : inferContinuingPack(last, cycle);
  let date = latest ? weekAfterLatest(latest, time, opts.closures) : nextOnWeekday(todayIso(), weekday);
  const extra = [];
  for (let i = 0; i < count; i += 1) {
    extra.push(blankSession({ cycle, pack, date, time }));
    ({ cycle, pack } = nextCyclePack(cycle, pack));
    date = weekAfterLatest(date, time, opts.closures);
  }
  return [...(sessions || []), ...extra];
}

export function removeSessionById(sessions, sessionId) {
  return (sessions || []).filter((session) => session.id !== sessionId);
}

export function rebuildFromFirstDate(sessions, firstDate, time) {
  if (!firstDate) return sessions;
  const ordered = sortSessions(sessions);
  let next = firstDate;
  const dates = new Map();
  for (const session of ordered) {
    if (isLockedSession(session) && session.date) {
      dates.set(session.id, session.date);
      const after = addDays(session.date, 7);
      if (after > next) next = after;
      continue;
    }
    dates.set(session.id, next);
    next = addDays(next, 7);
  }
  return sessions.map((session) => ({
    ...session,
    date: dates.get(session.id) || session.date,
    time: time || session.time,
  }));
}

export function retargetFollowing(sessions, sessionId, newDate, newTime) {
  if (!newDate) return sessions || [];
  return (sessions || []).map((session) => {
    if (session.id !== sessionId) return session;
    return { ...session, date: newDate, time: newTime || session.time };
  });
}

export function dateHitsClosure(iso, time, closures) {
  if (!iso) return false;
  return (closures || []).some(
    (c) => isPublicClosure(c) && closureCovers(c, iso) && timeMatches(time || '', c.time || '')
  );
}

export function skipClosures(iso, time, closures) {
  if (!iso) return iso;
  let cur = iso;
  for (let i = 0; i < 60; i += 1) {
    if (!dateHitsClosure(cur, time, closures)) return cur;
    cur = addDays(cur, 7);
  }
  return cur;
}

function lessonDaysInClosures(closures, weekday, time) {
  const days = [];
  for (const closure of closures || []) {
    if (!isPublicClosure(closure)) continue;
    if (!timeMatches(time, closure.time || '')) continue;
    for (const day of eachDay(closure.date, closureEnd(closure))) {
      if (weekdayOf(day) === weekday) days.push(day);
    }
  }
  return [...new Set(days)].sort();
}

export function holidayHoldId(date, time) {
  return `holiday:${date}:${time || 'all'}`;
}

export function dedupeHolidaySessions(sessions) {
  const chosen = new Map();
  for (const session of sessions || []) {
    if (session.status !== 'cancelled' || !session.date) continue;
    const previous = chosen.get(session.date);
    if (!previous || String(session.id || '').startsWith('holiday:')) {
      chosen.set(session.date, session);
    }
  }
  return (sessions || []).filter(
    (session) =>
      session.status !== 'cancelled' ||
      !session.date ||
      chosen.get(session.date) === session
  );
}

export function applyClosuresToSessions(sessions, time, closures, weekday) {
  const reals = sessions.filter((session) => session.status !== 'cancelled');
  const ordered = sortSessions(reals);
  const seedDate = ordered.find((session) => session.date)?.date || '';
  const lessonWeekday = Number.isInteger(weekday) && weekday >= 0 ? ((weekday % 7) + 7) % 7 : weekdayOf(seedDate);
  const extras = [];
  const placed = new Map();

  const occupied = (iso, exceptId) => {
    if (!iso) return false;
    if (extras.some((hold) => hold.date === iso)) return true;
    for (const [id, date] of placed) {
      if (id !== exceptId && date === iso) return true;
    }
    return ordered.some(
      (session) => isLockedSession(session) && session.date === iso && session.id !== exceptId && !placed.has(session.id)
    );
  };

  const addHold = (cycle, pack, date, sessionTime) => {
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

  const floorDate = (() => {
    const candidates = ordered
      .filter((session) => !isLockedSession(session))
      .map((session) => session.date)
      .filter(Boolean);
    return candidates.length ? [...candidates].sort()[0] : '';
  })();

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
    if (floorDate && day < floorDate) continue;
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

  const carryHolds = (sessions || []).filter(
    (s) =>
      s.status === 'cancelled' &&
      String(s.id || '').startsWith('holiday:') &&
      s.date &&
      dateHitsClosure(s.date, s.time || time, closures)
  );
  return dedupeHolidaySessions([
    ...reals.map((session) => {
      const date = placed.get(session.id);
      if (!date) return { ...session, originalDate: undefined };
      return { ...session, date, originalDate: undefined };
    }),
    ...extras,
    ...carryHolds,
  ]);
}

export function postponeOverlaps(sessions, time, closures, weekday) {
  return applyClosuresToSessions(sessions, time, closures, weekday);
}

export const MAKEUP_WINDOW_DAYS = 7;
export const MAKEUP_LOCK_DAYS = 3;

export function makeupWindow(sessionDate) {
  if (!sessionDate) return null;
  return {
    start: addDays(sessionDate, -MAKEUP_WINDOW_DAYS),
    end: addDays(sessionDate, MAKEUP_WINDOW_DAYS),
  };
}

export function slotInMakeupWindow(slotDate, sessionDate) {
  const window = makeupWindow(sessionDate);
  if (!window || !slotDate) return false;
  return slotDate >= window.start && slotDate <= window.end;
}

export function makeupRequestLocked(sessionDate, today = todayIso()) {
  if (!sessionDate) return true;
  return today >= addDays(sessionDate, -MAKEUP_LOCK_DAYS);
}

export function canRequestMakeupForSession(session, today = todayIso()) {
  if (!session?.date) return false;
  if (isHolidaySession(session)) return false;
  if (session.status === 'attended') return false;
  if (makeupRequestLocked(session.date, today)) return false;
  return true;
}

export function makeupRequestBlockReason(session, slotDate, today = todayIso()) {
  if (!session) return '바꿀 레슨 회차를 찾을 수 없습니다.';
  if (isHolidaySession(session)) return '휴강 회차는 보강으로 바꿀 수 없습니다.';
  if (session.status === 'attended') return '이미 출석한 회차는 보강으로 바꿀 수 없습니다.';
  if (makeupRequestLocked(session.date, today)) return '레슨 3일 전부터는 보강 신청을 할 수 없습니다.';
  if (slotDate && !slotInMakeupWindow(slotDate, session.date)) {
    return '이 시간은 해당 레슨일 기준 앞뒤 1주 안의 보강 시간이 아닙니다.';
  }
  return '';
}

export function eligibleMakeupSessions(sessions, today = todayIso()) {
  return (sessions || [])
    .filter((s) => canRequestMakeupForSession(s, today))
    .sort(
      (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || ''))
    );
}

export function sessionsForMakeupSlot(sessions, slotDate, today = todayIso()) {
  return eligibleMakeupSessions(sessions, today).filter((s) => slotInMakeupWindow(slotDate, s.date));
}

export function studentsEligibleForOpenSlot(students, slotDate, today = todayIso()) {
  return (students || []).filter(
    (student) => sessionsForMakeupSlot(student.sessions || [], slotDate, today).length > 0
  );
}

export function openSlotWhenLabel(slot) {
  if (!slot?.date) return '';
  const d = parseIso(slot.date);
  const day = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  const start = formatTime12(slot.startTime);
  const end = slot.endTime ? `–${formatTime12(slot.endTime)}` : '';
  const time = `${start}${end}`;
  return [day, time].filter(Boolean).join(' ');
}

export function slotsForStudentMakeup(openSlots, sessions, today = todayIso()) {
  const eligible = eligibleMakeupSessions(sessions, today);
  return (openSlots || []).filter((slot) => eligible.some((s) => slotInMakeupWindow(slot.date, s.date)));
}

export function slotsForSessionMakeup(openSlots, session, today = todayIso()) {
  if (!canRequestMakeupForSession(session, today)) return [];
  return (openSlots || []).filter((slot) => slotInMakeupWindow(slot.date, session.date));
}

export function applyMakeupReplacement(student, sessionId, makeup, _closures = []) {
  const stamp = new Date().toISOString();
  return {
    ...student,
    sessions: (student.sessions || []).map((s) =>
      s.id === sessionId ? { ...s, makeup, updatedAt: stamp } : s
    ),
  };
}

export function placeAvoidingClosures(sessions, time, closures, _weekday = 0) {
  return postponeOverlaps(sessions, time, closures);
}

export function applyLessonSetup(student, opts, closures = []) {
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
  const planned = [];
  let cursor = first;
  for (let i = 0; i < count; i += 1) {
    const date = i === 0 ? skipClosures(cursor, time, closures) : weekAfterLatest(cursor, time, closures);
    cursor = date;
    planned.push({
      id: nid(),
      cycle: wrapCycle(startCycle + i),
      pack: 0,
      status: 'pending',
      date,
      time,
      makeup: null,
      note: '',
      studentNote: '',
      attachments: [],
    });
  }
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

export function applyHoliday(students, closure, allClosures) {
  return applyAllHolidays(students, allClosures?.length ? allClosures : [closure]);
}

export function applyAllHolidays(students, closures) {
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

export function sessionCoveredByClosure(session, closure, fallbackTime = '') {
  if (!isPublicClosure(closure)) return false;
  if (!timeMatches(session.time || fallbackTime, closure.time || '')) return false;
  return Boolean(session.date && closureCovers(closure, session.date));
}

export function sessionHitsClosure(session, closure, fallbackTime = '') {
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

export function studentsAffectedByClosure(students, closure) {
  return (students || []).filter((student) =>
    (student.sessions || []).some((session) => sessionHitsClosure(session, closure, student.time))
  );
}

export function closureWhenLabel(c) {
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

/** In-app notice body (same wording as 휴강 push). */
export function closureAnnouncementBody(c) {
  const when = closureWhenLabel(c);
  return when ? `${when} 레슨·보강이 휴강입니다.` : '등록된 휴강이 있습니다.';
}

export const CLOSURE_ANNOUNCEMENT_TITLE = '휴강 일정';

export function isHolidaySession(session) {
  return session.status === 'cancelled';
}

export function isSyntheticHolidayHold(session) {
  return isHolidaySession(session) && String(session.id || '').startsWith('holiday:');
}

export function sessionLabel(session) {
  if (isSyntheticHolidayHold(session)) return '휴강';
  if (session.status === 'cancelled') return '휴강으로 다음주로 이동';
  if (session.makeup?.status === 'done') return '보강 출석 (대체)';
  if (session.makeup?.status === 'absent') return '보강 불참';
  if (session.makeup?.status === 'planned') return '보강 예정';
  if (session.status === 'attended') return '출석';
  if (session.status === 'absent') return '불참석';
  return '대기';
}

export function applyAttendance(session, status) {
  const stamp = new Date().toISOString();
  if (session.makeup && status !== 'cancelled') {
    const makeupStatus = status === 'attended' ? 'done' : status === 'absent' ? 'absent' : 'planned';
    return { ...session, makeup: { ...session.makeup, status: makeupStatus }, updatedAt: stamp };
  }
  return { ...session, status, updatedAt: stamp };
}

export function timeLabel(iso) {
  if (!iso) return '';
  const d = parseIso(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

export function paymentForPack(student, pack) {
  return student.payments?.find((p) => p.pack === pack) ?? { pack, paid: false };
}

export function openedPacksThrough(student, session) {
  const ordered = sortSessions(student.sessions || []);
  const end = session ? ordered.findIndex((s) => s.id === session.id) : ordered.length - 1;
  const until = end < 0 ? ordered : ordered.slice(0, end + 1);
  return [...new Set(until.filter((s) => s.status !== 'cancelled').map((s) => s.pack ?? 0))];
}

export function paidSessionForPack(student, payment) {
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

export function paymentBoxesForSession(student, session) {
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

export function paymentBadge(student) {
  const packs = openedPacksThrough(student);
  if (!packs.length) return 'none';
  return packs.some((pack) => !paymentForPack(student, pack).paid) ? 'unpaid' : 'paid';
}

export function lessonCheckPayNotes(student, session) {
  if (isHolidaySession(session)) return [];
  const notes = [];
  if (session.cycle === 4) notes.push('(결제 알리기)');
  const unpaid = paymentBoxesForSession(student, session).some((p) => !p.paid);
  if (unpaid) notes.push('(미결제)');
  return notes;
}

export function upsertPayment(payments, pack, paid, paidAt, paidSessionId) {
  const next = {
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
