import type { Closure, MakeupRequest, OpenSlot, Student } from './types';
import { applyMakeupReplacement, formatTime12, makeupRequestLocked, normalizeStudent, normalizeTime, parseIso, todayIso } from './schedule';

export type MakeupIntent = 'apply' | 'withdraw' | 'change';
export type MakeupReviseAction = 'accept' | 'decline' | 'withdraw';

export function nowIso() {
  return new Date().toISOString();
}

export function makeupIntent(req?: Pick<MakeupRequest, 'intent'> | null): MakeupIntent {
  return req?.intent || 'apply';
}

export function isActiveMakeup(req: MakeupRequest) {
  return req.status === 'pending' || req.status === 'accepted';
}

export function requestStamp(req: Pick<MakeupRequest, 'updatedAt' | 'createdAt'>) {
  return String(req.updatedAt || req.createdAt || '');
}

function clearPrevious(req: MakeupRequest): MakeupRequest {
  const next = { ...req, intent: 'apply' as const };
  delete next.previousSlotId;
  delete next.previousDate;
  delete next.previousTime;
  delete next.previousEndTime;
  delete next.previousSessionId;
  delete next.previousSessionDate;
  delete next.previousSessionCycle;
  return next;
}

function snapshotPrevious(req: MakeupRequest) {
  return {
    previousSlotId: req.slotId,
    previousDate: req.date,
    previousTime: req.time,
    previousEndTime: req.endTime,
    previousSessionId: req.sessionId,
    previousSessionDate: req.sessionDate,
    previousSessionCycle: req.sessionCycle,
  };
}

export function restorePrevious(req: MakeupRequest, at = nowIso()): MakeupRequest {
  return clearPrevious({
    ...req,
    slotId: req.previousSlotId || req.slotId,
    date: req.previousDate || req.date,
    time: req.previousTime || req.time,
    endTime: req.previousEndTime || req.endTime,
    sessionId: req.previousSessionId || req.sessionId,
    sessionDate: req.previousSessionDate || req.sessionDate,
    sessionCycle: req.previousSessionCycle ?? req.sessionCycle,
    status: 'accepted',
    updatedAt: at,
  });
}

export function makeupWithdrawBlockReason(
  req: Pick<MakeupRequest, 'status' | 'date'> | undefined,
  today = todayIso()
) {
  if (!req || req.status !== 'accepted') return '';
  if (!makeupRequestLocked(req.date, today)) return '';
  return '보강으로 대체하는 날 3일 전부터는 철회할 수 없습니다.';
}

export function applyStudentWithdraw(req: MakeupRequest, today = todayIso()): MakeupRequest {
  const blocked = makeupWithdrawBlockReason(req, today);
  if (blocked) throw new Error(blocked);
  const at = nowIso();
  const intent = makeupIntent(req);
  if (req.status === 'pending' && intent === 'apply') {
    return { ...req, status: 'withdrawn', updatedAt: at };
  }
  if (req.status === 'pending' && intent === 'withdraw') {
    return { ...req, status: 'accepted', intent: 'apply', updatedAt: at };
  }
  if (req.status === 'pending' && intent === 'change') {
    return restorePrevious(req, at);
  }
  if (req.status === 'accepted') {
    return { ...req, status: 'pending', intent: 'withdraw', updatedAt: at };
  }
  throw new Error('철회할 신청이 없습니다.');
}

export function applyStudentChange(
  req: MakeupRequest,
  slot: Pick<OpenSlot, 'id' | 'date' | 'startTime' | 'endTime'>,
  session: Pick<Student['sessions'][number], 'id' | 'date' | 'cycle'>
): MakeupRequest {
  const at = nowIso();
  const nextFields = {
    sessionId: session.id,
    sessionDate: session.date || '',
    sessionCycle: Number(session.cycle || 1),
    slotId: slot.id,
    date: slot.date,
    time: slot.startTime,
    endTime: slot.endTime,
    updatedAt: at,
  };
  const intent = makeupIntent(req);
  if (req.status === 'pending' && (intent === 'apply' || intent === 'change')) {
    return { ...req, ...nextFields };
  }
  if (req.status === 'accepted') {
    return {
      ...req,
      ...snapshotPrevious(req),
      ...nextFields,
      status: 'pending',
      intent: 'change',
    };
  }
  if (req.status === 'withdrawn' || req.status === 'declined') {
    return applyStudentReapply(req, slot, session);
  }
  throw new Error('지금 바꿀 수 있는 신청이 없습니다.');
}

export function applyStudentReapply(
  req: MakeupRequest,
  slot: Pick<OpenSlot, 'id' | 'date' | 'startTime' | 'endTime'>,
  session: Pick<Student['sessions'][number], 'id' | 'date' | 'cycle'>
): MakeupRequest {
  if (req.status !== 'withdrawn' && req.status !== 'declined') {
    throw new Error('다시 신청할 내역이 없습니다.');
  }
  const next: MakeupRequest = {
    ...clearPrevious(req),
    sessionId: session.id,
    sessionDate: session.date || '',
    sessionCycle: Number(session.cycle || 1),
    slotId: slot.id,
    date: slot.date,
    time: slot.startTime,
    endTime: slot.endTime,
    status: 'pending',
    intent: 'apply',
    updatedAt: nowIso(),
  };
  delete next.decidedBy;
  delete next.acknowledgedAt;
  return next;
}

export function applyInstructorDecide(req: MakeupRequest, accepted: boolean): MakeupRequest {
  const at = nowIso();
  const intent = makeupIntent(req);
  if (req.status !== 'pending') return req;
  if (intent === 'withdraw') {
    return accepted
      ? clearPrevious({ ...req, status: 'withdrawn', updatedAt: at, decidedBy: 'instructor' })
      : { ...req, status: 'accepted', intent: 'apply', updatedAt: at, decidedBy: 'instructor' };
  }
  if (intent === 'change') {
    return accepted
      ? clearPrevious({ ...req, status: 'accepted', updatedAt: at, decidedBy: 'instructor' })
      : { ...restorePrevious(req, at), decidedBy: 'instructor' };
  }
  return {
    ...req,
    status: accepted ? 'accepted' : 'declined',
    intent: 'apply',
    updatedAt: at,
    decidedBy: 'instructor',
  };
}

export function applyInstructorAck(req: MakeupRequest): MakeupRequest {
  if (req.status === 'pending' || req.acknowledgedAt) return req;
  const at = nowIso();
  return { ...req, acknowledgedAt: at, updatedAt: at };
}

export function isUnackedDecision(req: MakeupRequest) {
  return req.decidedBy === 'instructor' && req.status !== 'pending' && !req.acknowledgedAt;
}

export function isDecidedMakeup(req: MakeupRequest) {
  if (req.status === 'accepted' || req.status === 'declined') return true;
  return req.status === 'withdrawn' && req.decidedBy === 'instructor';
}

export function historyMakeupRequests(requests: MakeupRequest[] | undefined) {
  return (requests || [])
    .filter(isDecidedMakeup)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

export function slotFromRequest(req: MakeupRequest): OpenSlot | null {
  if (!req.slotId || !req.date || !req.time) return null;
  return {
    id: req.slotId,
    date: req.date,
    startTime: req.time,
    endTime: req.endTime || '',
    note: '',
  };
}

export function applyReviseToRequest(req: MakeupRequest, action: MakeupReviseAction): MakeupRequest {
  if (!req || req.status === 'pending') {
    throw new Error('대기 중인 신청은 달력 탭에서 처리하세요.');
  }
  if (action !== 'accept' && action !== 'decline' && action !== 'withdraw') {
    throw new Error('수정할 수 없는 요청입니다.');
  }
  const next: MakeupRequest = {
    ...req,
    status: action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'withdrawn',
    intent: 'apply',
    updatedAt: nowIso(),
    decidedBy: 'instructor',
  };
  delete next.acknowledgedAt;
  return next;
}

export function reviseMakeupBlockReason(
  requests: MakeupRequest[] | undefined,
  req: MakeupRequest,
  action: MakeupReviseAction
) {
  if (action !== 'accept' || !req.slotId) return '';
  const taken = (requests || []).find(
    (item) => item.id !== req.id && item.status === 'accepted' && item.slotId === req.slotId
  );
  if (!taken) return '';
  return `${taken.studentName} 학생 보강이 이미 이 시간에 수락되어 있습니다. 그 내역을 먼저 철회하세요.`;
}

export function applyReviseToRequests(
  requests: MakeupRequest[],
  req: MakeupRequest,
  action: MakeupReviseAction
): MakeupRequest[] {
  const revised = applyReviseToRequest(req, action);
  const taken = action === 'accept' && req.slotId ? new Set([req.slotId]) : new Set<string>();
  return (requests || []).map((item) => {
    if (item.id === req.id) return revised;
    if (taken.has(item.slotId) && item.status === 'pending' && makeupIntent(item) !== 'withdraw') {
      return applyInstructorDecide(item, false);
    }
    return item;
  });
}

export function applyReviseToSlots(
  openSlots: OpenSlot[],
  requests: MakeupRequest[],
  req: MakeupRequest,
  action: MakeupReviseAction
): OpenSlot[] {
  const nextRequests = applyReviseToRequests(requests, req, action);
  let slots = [...(openSlots || [])];
  if (action === 'accept') {
    return slots.filter((slot) => slot.id !== req.slotId);
  }
  if (req.slotId && !claimedSlotIds(nextRequests).has(req.slotId) && !slots.some((slot) => slot.id === req.slotId)) {
    const restored = slotFromRequest(req);
    if (restored) slots = [restored, ...slots];
  }
  return slots;
}

export function applyReviseToStudents(
  students: Student[],
  req: MakeupRequest,
  action: MakeupReviseAction,
  closures: Closure[]
): Student[] {
  const willAccept = action === 'accept';
  const wasAccepted = req.status === 'accepted';
  if (wasAccepted === willAccept) return students || [];
  return (students || []).map((student) => {
    if (student.id !== req.studentId) return student;
    const current = normalizeStudent(student);
    if (willAccept) {
      return applyMakeupReplacement(
        current,
        req.sessionId,
        { date: req.date, time: req.time, status: 'planned' },
        closures
      );
    }
    return applyMakeupReplacement(current, req.sessionId, null, closures);
  });
}

export function applyRemoveHistoryMakeup(
  requests: MakeupRequest[],
  openSlots: OpenSlot[],
  students: Student[],
  req: MakeupRequest,
  closures: Closure[] = []
) {
  if (!req || req.status === 'pending') {
    throw new Error('대기 중인 신청은 달력 탭에서 처리하세요.');
  }
  let nextRequests = requests || [];
  let nextSlots = openSlots || [];
  let nextStudents = students || [];
  if (req.status === 'accepted') {
    nextRequests = applyReviseToRequests(nextRequests, req, 'withdraw');
    nextSlots = applyReviseToSlots(openSlots || [], requests || [], req, 'withdraw');
    nextStudents = applyReviseToStudents(students || [], req, 'withdraw', closures);
  }
  return {
    requests: nextRequests.filter((item) => item.id !== req.id),
    openSlots: nextSlots,
    students: nextStudents,
  };
}

export function slotIdsToUnpublish(req: MakeupRequest, accepted: boolean) {
  const intent = makeupIntent(req);
  if (!accepted || intent === 'withdraw' || !req.slotId) return [] as string[];
  return [req.slotId];
}

export function slotsToRestore(req: MakeupRequest, accepted: boolean): OpenSlot[] {
  const intent = makeupIntent(req);
  const restored: OpenSlot[] = [];
  if (accepted && intent === 'withdraw') {
    const slot = slotFromRequest(req);
    if (slot) restored.push(slot);
  }
  if (accepted && intent === 'change' && req.previousSlotId) {
    restored.push({
      id: req.previousSlotId,
      date: req.previousDate || req.date,
      startTime: req.previousTime || req.time,
      endTime: req.previousEndTime || '',
      note: '',
    });
  }
  return restored.filter((slot) => slot.id && slot.date && slot.startTime);
}

export function applyDecideToSlots(
  openSlots: OpenSlot[],
  req: MakeupRequest,
  accepted: boolean,
  requestsAfter?: MakeupRequest[]
): OpenSlot[] {
  const hide = new Set(slotIdsToUnpublish(req, accepted));
  let slots = (openSlots || []).filter((slot) => !hide.has(slot.id));
  const nextRequests = requestsAfter || applyDecideToRequests([req], req, accepted);
  const claimed = claimedSlotIds(nextRequests);
  for (const restored of slotsToRestore(req, accepted)) {
    if (claimed.has(restored.id)) continue;
    if (!slots.some((slot) => slot.id === restored.id)) slots = [restored, ...slots];
  }
  return slots;
}

export function applyDecideToRequests(requests: MakeupRequest[], req: MakeupRequest, accepted: boolean): MakeupRequest[] {
  const decided = applyInstructorDecide(req, accepted);
  const taken = new Set(slotIdsToUnpublish(req, accepted));
  return (requests || []).map((item) => {
    if (item.id === req.id) return decided;
    if (
      taken.has(item.slotId) &&
      item.status === 'pending' &&
      makeupIntent(item) !== 'withdraw'
    ) {
      return applyInstructorDecide(item, false);
    }
    return item;
  });
}

export function claimedSlotIds(requests: MakeupRequest[] | undefined) {
  const ids = new Set<string>();
  for (const req of requests || []) {
    const intent = makeupIntent(req);
    if (req.status === 'accepted' && req.slotId) ids.add(req.slotId);
    if (req.status === 'pending' && intent === 'withdraw' && req.slotId) ids.add(req.slotId);
    if (req.status === 'pending' && intent === 'change' && req.previousSlotId) ids.add(req.previousSlotId);
  }
  return ids;
}

export function slotsHiddenFromStudents(openSlots: OpenSlot[] | undefined, requests: MakeupRequest[] | undefined) {
  const claimed = claimedSlotIds(requests);
  return (openSlots || []).filter((slot) => !claimed.has(slot.id));
}

export function hourClock(time: string) {
  return formatTime12(time);
}

export function originalLessonStamp(iso: string) {
  if (!iso) return '기존레슨날';
  const d = parseIso(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function instructorMakeupLine(
  studentName: string,
  makeupTime: string,
  originalDate: string,
  makeupDate?: string
) {
  const day = originalDate ? parseIso(originalDate).getDate() : '';
  const sameDay = Boolean(makeupDate && originalDate && makeupDate === originalDate);
  const tag = sameDay ? ' (당일 시간 변경)' : '';
  return `${hourClock(makeupTime)} ${studentName}님 ${day}일차 (${originalLessonStamp(originalDate)}) 보강${tag}`;
}

export function instructorMakeupEntries(students: Student[] | undefined) {
  const rows: { date: string; time: string; label: string; studentId: string; sessionId: string }[] = [];
  for (const student of students || []) {
    for (const session of student.sessions || []) {
      if (!session.makeup?.date) continue;
      rows.push({
        date: session.makeup.date,
        time: session.makeup.time || '',
        label: instructorMakeupLine(student.name, session.makeup.time, session.date, session.makeup.date),
        studentId: student.id,
        sessionId: session.id,
      });
    }
  }
  return rows.sort((a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label, 'ko'));
}

export function applyDecideToStudents(
  students: Student[],
  req: MakeupRequest,
  accepted: boolean,
  closures: Closure[]
): Student[] {
  const intent = makeupIntent(req);
  return students.map((student) => {
    if (student.id !== req.studentId) return student;
    const current = normalizeStudent(student);
    if (intent === 'withdraw') {
      return accepted ? applyMakeupReplacement(current, req.sessionId, null, closures) : current;
    }
    if (intent === 'change') {
      if (!accepted) return current;
      let next = current;
      if (req.previousSessionId && req.previousSessionId !== req.sessionId) {
        next = applyMakeupReplacement(next, req.previousSessionId, null, closures);
      }
      return applyMakeupReplacement(
        next,
        req.sessionId,
        { date: req.date, time: req.time, status: 'planned' },
        closures
      );
    }
    if (accepted) {
      return applyMakeupReplacement(
        current,
        req.sessionId,
        { date: req.date, time: req.time, status: 'planned' },
        closures
      );
    }
    return current;
  });
}

export function findOpenMakeup(
  requests: MakeupRequest[] | undefined,
  studentId: string,
  sessionId?: string
) {
  return (requests || []).find(
    (req) =>
      req.studentId === studentId &&
      isActiveMakeup(req) &&
      (!sessionId || req.sessionId === sessionId)
  );
}

export function findReusableMakeup(
  requests: MakeupRequest[] | undefined,
  studentId: string,
  sessionId?: string
) {
  const open = findOpenMakeup(requests, studentId, sessionId);
  if (open) return open;
  const closed = (requests || [])
    .filter(
      (req) =>
        req.studentId === studentId &&
        (!sessionId || req.sessionId === sessionId) &&
        (req.status === 'withdrawn' || req.status === 'declined')
    )
    .sort((a, b) => requestStamp(b).localeCompare(requestStamp(a)));
  return closed[0] || null;
}

export function studentRequestLabel(req: MakeupRequest) {
  const intent = makeupIntent(req);
  if (req.status === 'pending' && intent === 'withdraw') return '철회 요청함 · 강사 확인 대기';
  if (req.status === 'pending' && intent === 'change') return '변경 요청함 · 강사 확인 대기';
  if (req.status === 'pending') return '신청됨 · 강사 확인 대기';
  if (req.status === 'accepted') return '수락됨 · 보강으로 등록';
  if (req.status === 'withdrawn') return '철회됨';
  return '거절됨 · 다시 신청할 수 있습니다';
}

export function instructorRequestLabel(req: MakeupRequest) {
  const intent = makeupIntent(req);
  if (req.status === 'pending' && intent === 'withdraw') return '철회 확인 대기';
  if (req.status === 'pending' && intent === 'change') return '변경 확인 대기';
  if (req.status === 'pending') return '확인 대기';
  if (req.status === 'accepted') return '수락됨';
  if (req.status === 'withdrawn') return '철회됨';
  return '거절됨';
}
