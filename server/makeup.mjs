import { applyMakeupReplacement, formatTime12, makeupRequestLocked, normalizeTime, parseIso, todayIso } from './lib.mjs';

export function makeupIntent(req) {
  return req?.intent || 'apply';
}

export function nowIso() {
  return new Date().toISOString();
}

function clearPrevious(req) {
  const next = { ...req, intent: 'apply' };
  delete next.previousSlotId;
  delete next.previousDate;
  delete next.previousTime;
  delete next.previousEndTime;
  delete next.previousSessionId;
  delete next.previousSessionDate;
  delete next.previousSessionCycle;
  return next;
}

function snapshotPrevious(req) {
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

export function restorePrevious(req, at = nowIso()) {
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

export function makeupWithdrawBlockReason(req, today = todayIso()) {
  if (!req || req.status !== 'accepted') return '';
  if (!makeupRequestLocked(req.date, today)) return '';
  return '보강으로 대체하는 날 3일 전부터는 철회할 수 없습니다.';
}

export function applyStudentWithdraw(req, today = todayIso()) {
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

export function applyStudentChange(req, slot, session) {
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

export function applyStudentReapply(req, slot, session) {
  if (req.status !== 'withdrawn' && req.status !== 'declined') {
    throw new Error('다시 신청할 내역이 없습니다.');
  }
  const next = {
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

export function applyInstructorDecide(req, accepted) {
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

export function applyInstructorAck(req) {
  if (req.status === 'pending' || req.acknowledgedAt) return req;
  const at = nowIso();
  return { ...req, acknowledgedAt: at, updatedAt: at };
}

export function isUnackedDecision(req) {
  return req.decidedBy === 'instructor' && req.status !== 'pending' && !req.acknowledgedAt;
}

export function isDecidedMakeup(req) {
  if (req.status === 'accepted' || req.status === 'declined') return true;
  return req.status === 'withdrawn' && req.decidedBy === 'instructor';
}

export function historyMakeupRequests(requests) {
  return (requests || [])
    .filter(isDecidedMakeup)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

export function slotFromRequest(req) {
  if (!req.slotId || !req.date || !req.time) return null;
  return {
    id: req.slotId,
    date: req.date,
    startTime: req.time,
    endTime: req.endTime || '',
    note: '',
  };
}

export function applyReviseToRequest(req, action) {
  if (!req || req.status === 'pending') {
    throw new Error('대기 중인 신청은 달력 탭에서 처리하세요.');
  }
  if (action !== 'accept' && action !== 'decline' && action !== 'withdraw') {
    throw new Error('수정할 수 없는 요청입니다.');
  }
  const next = {
    ...req,
    status: action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'withdrawn',
    intent: 'apply',
    updatedAt: nowIso(),
    decidedBy: 'instructor',
  };
  delete next.acknowledgedAt;
  return next;
}

export function reviseMakeupBlockReason(requests, req, action) {
  if (action !== 'accept' || !req.slotId) return '';
  const taken = (requests || []).find(
    (item) => item.id !== req.id && item.status === 'accepted' && item.slotId === req.slotId
  );
  if (!taken) return '';
  return `${taken.studentName} 학생 보강이 이미 이 시간에 수락되어 있습니다. 그 내역을 먼저 철회하세요.`;
}

export function applyReviseToRequests(requests, req, action) {
  const revised = applyReviseToRequest(req, action);
  const taken = action === 'accept' && req.slotId ? new Set([req.slotId]) : new Set();
  return (requests || []).map((item) => {
    if (item.id === req.id) return revised;
    if (taken.has(item.slotId) && item.status === 'pending' && makeupIntent(item) !== 'withdraw') {
      return applyInstructorDecide(item, false);
    }
    return item;
  });
}

export function applyReviseToSlots(openSlots, requests, req, action) {
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

export function applyReviseToStudents(students, req, action, closures) {
  const willAccept = action === 'accept';
  const wasAccepted = req.status === 'accepted';
  if (wasAccepted === willAccept) return students || [];
  return (students || []).map((student) => {
    if (student.id !== req.studentId) return student;
    if (willAccept) {
      return applyMakeupReplacement(student, req.sessionId, { date: req.date, time: req.time, status: 'planned' }, closures);
    }
    return applyMakeupReplacement(student, req.sessionId, null, closures);
  });
}

export function applyRemoveHistoryMakeup(requests, openSlots, students, req, closures = []) {
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

export function slotIdsToUnpublish(req, accepted) {
  const intent = makeupIntent(req);
  if (!accepted || intent === 'withdraw' || !req.slotId) return [];
  return [req.slotId];
}

export function slotsToRestore(req, accepted) {
  const intent = makeupIntent(req);
  const restored = [];
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

export function applyDecideToSlots(openSlots, req, accepted, requestsAfter) {
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

export function applyDecideToRequests(requests, req, accepted) {
  const decided = applyInstructorDecide(req, accepted);
  const taken = new Set(slotIdsToUnpublish(req, accepted));
  return (requests || []).map((item) => {
    if (item.id === req.id) return decided;
    if (taken.has(item.slotId) && item.status === 'pending' && makeupIntent(item) !== 'withdraw') {
      return applyInstructorDecide(item, false);
    }
    return item;
  });
}

export function claimedSlotIds(requests) {
  const ids = new Set();
  for (const req of requests || []) {
    const intent = makeupIntent(req);
    if (req.status === 'accepted' && req.slotId) ids.add(req.slotId);
    if (req.status === 'pending' && intent === 'withdraw' && req.slotId) ids.add(req.slotId);
    if (req.status === 'pending' && intent === 'change' && req.previousSlotId) ids.add(req.previousSlotId);
  }
  return ids;
}

export function slotsHiddenFromStudents(openSlots, requests) {
  const claimed = claimedSlotIds(requests);
  return (openSlots || []).filter((slot) => !claimed.has(slot.id));
}

export function hourClock(time) {
  return formatTime12(time);
}

export function originalLessonStamp(iso) {
  if (!iso) return '기존레슨날';
  const d = parseIso(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function instructorMakeupLine(studentName, makeupTime, originalDate, makeupDate) {
  const day = originalDate ? parseIso(originalDate).getDate() : '';
  const sameDay = Boolean(makeupDate && originalDate && makeupDate === originalDate);
  const tag = sameDay ? ' (당일 시간 변경)' : '';
  return `${hourClock(makeupTime)} ${studentName}님 ${day}일차 (${originalLessonStamp(originalDate)}) 보강${tag}`;
}

export function instructorMakeupEntries(students) {
  const rows = [];
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

export function applyDecideToStudents(students, req, accepted, closures) {
  const intent = makeupIntent(req);
  return (students || []).map((student) => {
    if (student.id !== req.studentId) return student;
    if (intent === 'withdraw') {
      return accepted ? applyMakeupReplacement(student, req.sessionId, null, closures) : student;
    }
    if (intent === 'change') {
      if (!accepted) return student;
      let next = student;
      if (req.previousSessionId && req.previousSessionId !== req.sessionId) {
        next = applyMakeupReplacement(next, req.previousSessionId, null, closures);
      }
      return applyMakeupReplacement(next, req.sessionId, { date: req.date, time: req.time, status: 'planned' }, closures);
    }
    if (accepted) {
      return applyMakeupReplacement(student, req.sessionId, { date: req.date, time: req.time, status: 'planned' }, closures);
    }
    return student;
  });
}

export function findOpenMakeup(requests, studentId, sessionId) {
  return (requests || []).find(
    (req) =>
      req.studentId === studentId &&
      (req.status === 'pending' || req.status === 'accepted') &&
      (!sessionId || req.sessionId === sessionId)
  );
}

export function findReusableMakeup(requests, studentId, sessionId) {
  const open = findOpenMakeup(requests, studentId, sessionId);
  if (open) return open;
  const closed = (requests || [])
    .filter(
      (req) =>
        req.studentId === studentId &&
        (!sessionId || req.sessionId === sessionId) &&
        (req.status === 'withdrawn' || req.status === 'declined')
    )
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  return closed[0] || null;
}
