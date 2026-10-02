import { mergeOpenSlots, mergeRemovedOpenSlots, dropRemovedOpenSlots, mergeRequests, mergeStudio } from '../server/cloud.mjs';
import {
  applyDecideToRequests,
  applyDecideToSlots,
  applyDecideToStudents,
  applyInstructorAck,
  applyInstructorDecide,
  applyRemoveHistoryMakeup,
  applyReviseToRequests,
  applyReviseToSlots,
  applyReviseToStudents,
  applyStudentChange,
  applyStudentWithdraw,
  findReusableMakeup,
  historyMakeupRequests,
  instructorMakeupEntries,
  instructorMakeupLine,
  isDecidedMakeup,
  isUnackedDecision,
  makeupWithdrawBlockReason,
  reviseMakeupBlockReason,
  slotsHiddenFromStudents,
} from '../server/makeup.mjs';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const slot = { id: 'slot-10', date: '2026-09-21', startTime: '10:00', endTime: '11:00', note: '보강 가능' };
const otherSlot = { id: 'slot-14', date: '2026-09-22', startTime: '14:00', endTime: '15:00', note: '' };

const req = {
  id: 'req-1',
  studentId: 'st-j',
  studentName: 'ㅈ',
  sessionId: 'ses-7',
  sessionDate: '2026-09-07',
  sessionCycle: 1,
  slotId: slot.id,
  date: slot.date,
  time: slot.startTime,
  endTime: slot.endTime,
  status: 'pending',
  intent: 'apply',
  createdAt: '2026-09-16T00:00:00.000Z',
};

const otherReq = {
  ...req,
  id: 'req-2',
  studentId: 'st-b',
  studentName: 'ㅂ',
  sessionId: 'ses-b',
  sessionDate: '2026-09-08',
};

const student = {
  id: 'st-j',
  name: 'ㅈ',
  weekday: 1,
  time: '14:00',
  sessions: [
    {
      id: 'ses-7',
      cycle: 1,
      pack: 0,
      status: 'pending',
      date: '2026-09-07',
      time: '14:00',
      makeup: null,
      note: '',
      studentNote: '',
      attachments: [],
    },
  ],
};

function testAcceptUnpublishesSlotAndConfirms() {
  const decided = applyInstructorDecide(req, true);
  assert(decided.status === 'accepted', 'accept should mark accepted');
  assert(decided.decidedBy === 'instructor', 'accept should be an instructor decision');
  assert(isUnackedDecision(decided), 'accepted request should sit in confirmed inbox');

  const requests = applyDecideToRequests([req, otherReq], req, true);
  const accepted = requests.find((r) => r.id === req.id);
  const declined = requests.find((r) => r.id === otherReq.id);
  assert(accepted.status === 'accepted', 'target accepted');
  assert(declined.status === 'declined' && declined.decidedBy === 'instructor', 'same-slot pending should auto-decline');

  const slots = applyDecideToSlots([slot, otherSlot], req, true);
  assert(!slots.some((s) => s.id === slot.id), 'accepted slot must be unpublished');
  assert(slots.some((s) => s.id === otherSlot.id), 'other slots stay');

  const students = applyDecideToStudents([student], req, true, []);
  const makeup = students[0].sessions[0].makeup;
  assert(makeup?.date === '2026-09-21' && makeup?.time === '10:00', 'session should move onto the makeup slot');

  const visible = slotsHiddenFromStudents([slot, otherSlot], requests);
  assert(!visible.some((s) => s.id === slot.id), 'students must not see the accepted slot even if it remains in storage');
  assert(visible.some((s) => s.id === otherSlot.id), 'students still see other open slots');

  const acked = applyInstructorAck(accepted);
  assert(acked.acknowledgedAt, 'ack should stamp acknowledgedAt');
  assert(!isUnackedDecision(acked), 'acked item leaves the confirmed inbox');
  console.log('ok accept unpublishes slot and fills confirmed inbox');
}

function testDeclineKeepsSlot() {
  const requests = applyDecideToRequests([req], req, false);
  const declined = requests[0];
  assert(declined.status === 'declined' && declined.decidedBy === 'instructor', 'decline is an instructor decision');
  assert(isUnackedDecision(declined), 'declined request should sit in confirmed inbox');
  const slots = applyDecideToSlots([slot], req, false);
  assert(slots.some((s) => s.id === slot.id), 'declined slot stays public');
  const visible = slotsHiddenFromStudents(slots, requests);
  assert(visible.some((s) => s.id === slot.id), 'students still see declined slot');
  console.log('ok decline keeps slot public');
}

function testInstructorCalendarLabel() {
  const label = instructorMakeupLine('ㅈ', '10:00', '2026-09-07', '2026-09-21');
  assert(label === '오전 10시 ㅈ님 7일차 (9월 7일) 보강', `unexpected label: ${label}`);
  const sameDay = instructorMakeupLine('ㅈ', '10:00', '2026-09-07', '2026-09-07');
  assert(
    sameDay === '오전 10시 ㅈ님 7일차 (9월 7일) 보강 (당일 시간 변경)',
    `unexpected same-day label: ${sameDay}`
  );
  const students = applyDecideToStudents([student], req, true, []);
  const rows = instructorMakeupEntries(students);
  assert(rows.length === 1, 'accepted makeup should appear on instructor calendar');
  assert(rows[0].date === '2026-09-21', 'makeup is listed on replacement day');
  assert(rows[0].label === label, `calendar row should match: ${rows[0].label}`);
  console.log('ok instructor calendar makeup label');
}

function testHistoryCollectsDecidedOnly() {
  const accepted = applyInstructorDecide(req, true);
  const declined = applyInstructorDecide(otherReq, false);
  const history = historyMakeupRequests([req, accepted, declined]);
  assert(history.length === 2, 'pending stay out of history tab');
  assert(!history.some((r) => r.status === 'pending'), 'history has no live requests');
  assert(isDecidedMakeup(accepted) && isDecidedMakeup(declined), 'accepted and declined belong in history');
  assert(!isDecidedMakeup(req), 'pending is not history');
  console.log('ok history tab collects accepted and declined');
}

function testReviseAcceptedToDeclinedRestoresSlot() {
  const accepted = applyInstructorDecide(req, true);
  const afterSlots = applyDecideToSlots([slot, otherSlot], req, true);
  const afterStudents = applyDecideToStudents([student], req, true, []);
  assert(!afterSlots.some((s) => s.id === slot.id), 'accepted slot unpublished');
  assert(afterStudents[0].sessions[0].makeup?.date === '2026-09-21', 'makeup applied');

  const revised = applyReviseToRequests([accepted], accepted, 'decline')[0];
  assert(revised.status === 'declined', 'accept can be changed to decline');
  const slots = applyReviseToSlots(afterSlots, [accepted], accepted, 'decline');
  assert(
    slots.some((s) => s.id === slot.id && s.startTime === '10:00'),
    'declining republishes the open slot'
  );
  const students = applyReviseToStudents(afterStudents, accepted, 'decline', []);
  assert(!students[0].sessions[0].makeup, 'makeup is cleared when changed to decline');
  console.log('ok revise accept to decline restores slot');
}

function testReviseDeclinedToAccepted() {
  const declined = applyInstructorDecide(req, false);
  const slots = applyReviseToSlots([slot, otherSlot], [declined], declined, 'accept');
  assert(!slots.some((s) => s.id === slot.id), 'accepting unpublishes the slot');
  const students = applyReviseToStudents([student], declined, 'accept', []);
  assert(students[0].sessions[0].makeup?.date === '2026-09-21', 'declined request can be accepted later');
  console.log('ok revise decline to accept applies makeup');
}

function testWithdrawAcceptedMakeup() {
  const accepted = applyInstructorDecide(req, true);
  const afterSlots = applyDecideToSlots([slot], req, true);
  const afterStudents = applyDecideToStudents([student], req, true, []);
  const next = applyReviseToRequests([accepted], accepted, 'withdraw')[0];
  assert(next.status === 'withdrawn', 'withdraw marks withdrawn');
  const slots = applyReviseToSlots(afterSlots, [accepted], accepted, 'withdraw');
  assert(slots.some((s) => s.id === slot.id), 'withdraw republishes the slot');
  const students = applyReviseToStudents(afterStudents, accepted, 'withdraw', []);
  assert(!students[0].sessions[0].makeup, 'withdraw clears makeup');
  const visible = slotsHiddenFromStudents(slots, [next]);
  assert(visible.some((s) => s.id === slot.id), 'students see the slot again after withdraw');
  console.log('ok withdraw accepted makeup');
}

function testAcceptedMakeupWithdrawLocksThreeDaysBeforeReplacement() {
  const accepted = { ...applyInstructorDecide(req, true), date: '2026-09-21' };
  assert(
    makeupWithdrawBlockReason(accepted, '2026-09-18') ===
      '보강으로 대체하는 날 3일 전부터는 철회할 수 없습니다.',
    'replacement day minus 3 days locks withdraw'
  );
  assert(makeupWithdrawBlockReason(accepted, '2026-09-17') === '', 'four days before still allows withdraw');
  assert(
    makeupWithdrawBlockReason({ ...accepted, status: 'pending', intent: 'apply' }, '2026-09-18') === '',
    'pending apply is not locked by replacement day'
  );
  let locked = false;
  try {
    applyStudentWithdraw(accepted, '2026-09-18');
  } catch (err) {
    locked = String(err.message || err).includes('3일 전');
  }
  assert(locked, 'accepted makeup cannot be withdrawn 3 days before replacement day');
  const requested = applyStudentWithdraw(accepted, '2026-09-17');
  assert(requested.status === 'pending' && requested.intent === 'withdraw', 'withdraw request is created before lock');
  const pendingApply = { ...req, status: 'pending', intent: 'apply', date: '2026-09-21' };
  const cancelled = applyStudentWithdraw(pendingApply, '2026-09-18');
  assert(cancelled.status === 'withdrawn', 'pending apply can still be cancelled inside the lock window');
  console.log('ok accepted makeup withdraw locks 3 days before replacement');
}

function testCannotAcceptTakenSlot() {
  const accepted = applyInstructorDecide(req, true);
  const otherDeclined = { ...applyInstructorDecide(otherReq, false), slotId: slot.id };
  const reason = reviseMakeupBlockReason([accepted, otherDeclined], otherDeclined, 'accept');
  assert(reason.includes('이미'), 'cannot accept a slot another student already has');
  console.log('ok cannot double-accept the same slot');
}

function testWithdrawThenReapplyShowsPending() {
  const pending = {
    ...req,
    status: 'pending',
    intent: 'apply',
    updatedAt: '2026-09-16T12:00:00.000Z',
  };
  const withdrawn = { ...applyStudentWithdraw(pending), updatedAt: '2026-09-16T12:00:00.000Z' };
  assert(withdrawn.status === 'withdrawn', 'pending apply withdraws immediately');
  assert(!isDecidedMakeup(withdrawn), 'student withdraw is not instructor history');

  const reused = findReusableMakeup([withdrawn], req.studentId, req.sessionId);
  assert(reused && reused.id === req.id, 'withdrawn request can be reused');
  const again = applyStudentChange(withdrawn, slot, {
    id: req.sessionId,
    date: req.sessionDate,
    cycle: req.sessionCycle,
  });
  assert(again.status === 'pending' && again.intent === 'apply', 'reapply becomes live pending');
  assert(again.slotId === slot.id, 'reapply keeps the chosen slot');

  const mergedSameId = mergeRequests([withdrawn], [{ ...again, updatedAt: '2026-09-16T12:01:00.000Z' }]);
  assert(
    mergedSameId.some((r) => r.id === req.id && r.status === 'pending'),
    'newer pending must beat withdrawn on the same request'
  );

  const mergedEqualStamp = mergeRequests(
    [{ ...withdrawn, updatedAt: '2026-09-16T12:00:00.000Z' }],
    [{ ...again, updatedAt: '2026-09-16T12:00:00.000Z' }]
  );
  assert(
    mergedEqualStamp.some((r) => r.id === req.id && r.status === 'pending'),
    'pending must not lose to withdrawn when timestamps match'
  );

  const instructorPending = mergedSameId.filter((r) => r.status === 'pending');
  assert(instructorPending.length === 1, 'instructor inbox shows the reapplied request');
  console.log('ok withdraw then reapply returns to instructor inbox');
}

function testAcceptHidesSlotAndWithdrawRestoresIt() {
  const afterAcceptSlots = applyDecideToSlots([slot, otherSlot], req, true);
  assert(!afterAcceptSlots.some((s) => s.id === slot.id), 'accepted slot is removed from the calendar');
  assert(afterAcceptSlots.some((s) => s.id === otherSlot.id), 'other empty slots stay');

  const accepted = applyInstructorDecide(req, true);
  const withdrawReq = { ...accepted, status: 'pending', intent: 'withdraw' };
  const afterWithdrawRequests = applyDecideToRequests([withdrawReq], withdrawReq, true);
  assert(afterWithdrawRequests[0].status === 'withdrawn', 'instructor accept of withdraw completes it');
  const restored = applyDecideToSlots(afterAcceptSlots, withdrawReq, true, afterWithdrawRequests);
  assert(
    restored.some((s) => s.id === slot.id && s.startTime === '10:00' && s.endTime === '11:00'),
    'withdrawed time opens again as an empty slot'
  );
  assert(restored.some((s) => s.id === otherSlot.id), 'other empty slots still stay after withdraw');
  const visible = slotsHiddenFromStudents(restored, afterWithdrawRequests);
  assert(visible.some((s) => s.id === slot.id), 'students can see the restored empty slot');
  console.log('ok accept hides slot and withdraw restores it');
}

function testRemoveAcceptedHistoryRestoresSlot() {
  const accepted = applyInstructorDecide(req, true);
  const afterSlots = applyDecideToSlots([slot, otherSlot], req, true);
  const afterStudents = applyDecideToStudents([student], req, true, []);
  const next = applyRemoveHistoryMakeup([accepted], afterSlots, afterStudents, accepted, []);
  assert(!next.requests.some((r) => r.id === req.id), 'deleted request is gone from history');
  assert(next.openSlots.some((s) => s.id === slot.id && s.startTime === '10:00'), 'deleting accepted history restores the empty slot');
  assert(!next.students[0].sessions[0].makeup, 'deleting accepted history clears makeup');
  const visible = slotsHiddenFromStudents(next.openSlots, next.requests);
  assert(visible.some((s) => s.id === slot.id), 'students see the restored empty slot');
  console.log('ok remove accepted history restores slot');
}

function testRemoveDeclinedHistoryKeepsSlot() {
  const declined = applyInstructorDecide(req, false);
  const other = { ...applyInstructorDecide(otherReq, false) };
  const next = applyRemoveHistoryMakeup([declined, other], [slot, otherSlot], [student], declined, []);
  assert(!next.requests.some((r) => r.id === req.id), 'declined request is dropped');
  assert(next.requests.some((r) => r.id === otherReq.id), 'other history stays');
  assert(next.openSlots.length === 2, 'declined delete does not change empty slots');
  assert(!next.students[0].sessions[0].makeup, 'declined delete leaves student makeup empty');
  console.log('ok remove declined history keeps slots');
}

function testCannotRemovePendingFromHistory() {
  try {
    applyRemoveHistoryMakeup([req], [slot], [student], req, []);
    assert(false, 'pending delete should throw');
  } catch (err) {
    assert(String(err.message).includes('달력'), 'pending stays on the calendar tab');
  }
  console.log('ok pending cannot be deleted from history');
}

function testRemovedHistoryStaysDroppedAfterMerge() {
  const accepted = applyInstructorDecide(req, true);
  const current = {
    version: 2,
    students: [student],
    closures: [],
    openSlots: [],
    requests: [],
    removedRequests: ['req-1'],
    accounts: [],
  };
  const incoming = {
    version: 1,
    students: [student],
    closures: [],
    openSlots: [slot],
    requests: [accepted],
    accounts: [],
  };
  const merged = mergeStudio(current, incoming);
  assert(!merged.requests.some((r) => r.id === 'req-1'), 'tombstone keeps deleted makeup history dropped');
  assert((merged.removedRequests || []).includes('req-1'), 'removedRequests is remembered');
  assert(!historyMakeupRequests(merged.requests).some((r) => r.id === 'req-1'), 'history list hides the deleted request');
  console.log('ok removed history stays dropped after merge');
}

function persistSharedSlots(blob, cloud, patch, incomingNewer) {
  const removedOpenSlots = mergeRemovedOpenSlots(
    blob.removedOpenSlots,
    mergeRemovedOpenSlots(cloud?.removedOpenSlots, patch.removedOpenSlots)
  );
  const base = dropRemovedOpenSlots(
    cloud ? mergeOpenSlots(blob.openSlots, cloud.openSlots, incomingNewer) : blob.openSlots,
    removedOpenSlots
  );
  return dropRemovedOpenSlots(
    patch.openSlots !== undefined ? mergeOpenSlots(base, patch.openSlots, true) : base,
    mergeRemovedOpenSlots(removedOpenSlots, patch.removedOpenSlots)
  );
}

function testInstructorOpenSlotDeleteReachesStudent() {
  const oldSlot = { id: 'slot-old', date: '2026-09-21', startTime: '19:00', endTime: '20:00', note: '' };
  const newSlot = { id: 'slot-new', date: '2026-09-22', startTime: '10:00', endTime: '11:00', note: '' };
  const instructor = {
    version: 10,
    students: [],
    closures: [],
    openSlots: [newSlot],
    removedOpenSlots: ['slot-old'],
    requests: [],
    accounts: [],
  };
  const studentStale = {
    version: 11,
    students: [],
    closures: [],
    openSlots: [oldSlot],
    requests: [],
    accounts: [],
  };
  const afterStudentWrite = mergeStudio(instructor, studentStale);
  assert(!afterStudentWrite.openSlots.some((s) => s.id === 'slot-old'), 'student put does not restore a deleted empty slot');
  assert(afterStudentWrite.openSlots.some((s) => s.id === 'slot-new'), 'instructor add still unions after student merge');
  assert((afterStudentWrite.removedOpenSlots || []).includes('slot-old'), 'removedOpenSlots is remembered');

  const afterStudentPull = mergeStudio(studentStale, instructor);
  assert(!afterStudentPull.openSlots.some((s) => s.id === 'slot-old'), 'student pull drops the deleted empty slot');
  assert(afterStudentPull.openSlots.some((s) => s.id === 'slot-new'), 'student pull receives the replacement empty slot');

  const pulledWhileLocalNewer = persistSharedSlots(studentStale, instructor, {}, false);
  assert(!pulledWhileLocalNewer.some((s) => s.id === 'slot-old'), 'local newer student persist still drops tombstoned slot');
  assert(pulledWhileLocalNewer.some((s) => s.id === 'slot-new'), 'local newer student persist still receives new slot');

  const instructorRemoved = persistSharedSlots(
    { openSlots: [oldSlot, newSlot], removedOpenSlots: [] },
    { openSlots: [oldSlot, newSlot], removedOpenSlots: [] },
    { openSlots: [newSlot], removedOpenSlots: ['slot-old'] },
    true
  );
  assert(!instructorRemoved.some((s) => s.id === 'slot-old'), 'instructor delete patch drops the slot');
  assert(instructorRemoved.some((s) => s.id === 'slot-new'), 'instructor delete keeps the remaining slot');
  console.log('ok instructor empty-slot delete/change reaches student merge');
}

function testOpenSlotTimeChangeWinsWhenNewer() {
  const current = {
    version: 1,
    students: [],
    closures: [],
    openSlots: [{ id: 's1', date: '2026-09-21', startTime: '19:00', endTime: '20:00', note: '' }],
    requests: [],
    accounts: [],
  };
  const incoming = {
    version: 2,
    students: [],
    closures: [],
    openSlots: [{ id: 's1', date: '2026-09-21', startTime: '10:00', endTime: '11:00', note: 'changed' }],
    requests: [],
    accounts: [],
  };
  const merged = mergeStudio(current, incoming);
  assert(merged.openSlots[0].startTime === '10:00', 'newer instructor time overwrites the same empty slot');
  assert(merged.openSlots[0].note === 'changed', 'newer instructor note overwrites the same empty slot');
  console.log('ok newer empty-slot change overwrites same id');
}

function testMakeupHideDoesNotTombstoneSlot() {
  const current = {
    version: 3,
    students: [student],
    closures: [],
    openSlots: [otherSlot],
    requests: [],
    accounts: [],
  };
  const incoming = {
    version: 2,
    students: [student],
    closures: [],
    openSlots: [slot, otherSlot],
    requests: [],
    accounts: [],
  };
  const merged = mergeStudio(current, incoming);
  assert(merged.openSlots.some((s) => s.id === slot.id), 'makeup hide without tombstone still unions the slot for withdraw restore');
  console.log('ok makeup hide does not tombstone empty slots');
}

testAcceptUnpublishesSlotAndConfirms();
testDeclineKeepsSlot();
testInstructorCalendarLabel();
testHistoryCollectsDecidedOnly();
testReviseAcceptedToDeclinedRestoresSlot();
testReviseDeclinedToAccepted();
testWithdrawAcceptedMakeup();
testAcceptedMakeupWithdrawLocksThreeDaysBeforeReplacement();
testCannotAcceptTakenSlot();
testWithdrawThenReapplyShowsPending();
testAcceptHidesSlotAndWithdrawRestoresIt();
testRemoveAcceptedHistoryRestoresSlot();
testRemoveDeclinedHistoryKeepsSlot();
testCannotRemovePendingFromHistory();
testRemovedHistoryStaysDroppedAfterMerge();
testInstructorOpenSlotDeleteReachesStudent();
testOpenSlotTimeChangeWinsWhenNewer();
testMakeupHideDoesNotTombstoneSlot();
console.log('ok makeup decide');
