import assert from 'node:assert/strict';
import {
  applyHoliday,
  applyLessonSetup,
  applyMakeupReplacement,
  appendContinuingSessions,
  insertSessionAfter,
  realignAfter,
  hideFromLessonCheck,
  isClosureActive,
  isPublicClosure,
  isPublicHolidayDate,
  lessonCheckHolidayDays,
  lessonCheckPayNotes,
  sortSessions,
  paymentBadge,
  paymentBoxesForSession,
  rebuildFromFirstDate,
  removeSessionById,
  retargetFollowing,
  sessionCoveredByClosure,
  studentsAffectedByClosure,
  closureWhenLabel,
  formatTime12,
  makeupRequestBlockReason,
  makeupRequestLocked,
  normalizeTime,
  slotInMakeupWindow,
  slotsForSessionMakeup,
  studentsEligibleForOpenSlot,
  openSlotWhenLabel,
  splitSessionsAroundToday,
  upsertPayment,
  applyAttendance,
} from './lib.mjs';

function sess(id, date, status = 'pending', pack = 0) {
  return { id, cycle: 1, pack, status, date, time: '14:00', makeup: null, note: '', studentNote: '', attachments: [] };
}

const rebuilt = rebuildFromFirstDate(
  [sess('a', '2026-09-02'), sess('b', '2026-09-09'), sess('c', '2026-09-16'), sess('d', '2026-09-23')],
  '2026-09-10'
);
assert.deepEqual(rebuilt.map((s) => s.date), ['2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01']);

const locked = rebuildFromFirstDate(
  [sess('a', '2026-09-02', 'attended'), sess('b', '2026-09-09'), sess('c', '2026-09-16'), sess('d', '2026-09-23')],
  '2026-09-03'
);
assert.equal(locked[0].date, '2026-09-02');
assert.deepEqual(locked.slice(1).map((s) => s.date), ['2026-09-09', '2026-09-16', '2026-09-23']);

const shifted = retargetFollowing(
  [
    { ...sess('a', '2026-09-02'), cycle: 1 },
    { ...sess('b', '2026-09-09'), cycle: 2 },
    { ...sess('c', '2026-09-16'), cycle: 3 },
  ],
  'a',
  '2026-09-16'
);
assert.deepEqual(shifted.map((s) => s.date), ['2026-09-16', '2026-09-09', '2026-09-16']);
assert.deepEqual(shifted.map((s) => s.cycle), [1, 2, 3]);

const closure = { id: 'h', date: '2026-09-15', endDate: '2026-09-19', time: '', reason: '', scope: 'all' };
assert.equal(isClosureActive(closure, '2026-09-19'), true);
assert.equal(isClosureActive(closure, '2026-09-20'), false);
assert.equal(isClosureActive({ ...closure, endDate: undefined }, '2026-09-16'), false);
const students = applyHoliday(
  [{
    id: 'st',
    name: 'ㄱ',
    weekday: 3,
    time: '14:00',
    sessions: [
      { ...sess('x', '2026-09-16'), cycle: 1 },
      { ...sess('y', '2026-09-23'), cycle: 2 },
      { ...sess('z', '2026-09-30'), cycle: 3 },
    ],
  }],
  closure
);
const firstHoliday = sortSessions(students[0].sessions);
assert.equal(firstHoliday.filter((s) => s.status === 'cancelled').length, 1);
assert.equal(firstHoliday[0].status, 'cancelled');
assert.equal(firstHoliday[0].cycle, 1);
assert.equal(firstHoliday[0].date, '2026-09-16');
assert.deepEqual(firstHoliday.filter((s) => s.status !== 'cancelled').map((s) => s.cycle), [1, 2, 3]);
assert.deepEqual(firstHoliday.filter((s) => s.status !== 'cancelled').map((s) => s.date), ['2026-09-23', '2026-09-30', '2026-10-07']);
assert.equal(isPublicClosure({ scope: undefined }), true);
assert.equal(sessionCoveredByClosure({ date: '2026-09-16', time: '14:00', status: 'pending' }, closure), true);

const closureHit = {
  id: 'hit',
  date: '2026-09-21',
  endDate: '2026-09-21',
  time: '14:00',
  reason: '공휴일',
  scope: 'all',
};
const closureHits = studentsAffectedByClosure(
  [
    { id: 'lesson', time: '14:00', sessions: [sess('a', '2026-09-21')] },
    {
      id: 'makeup',
      time: '10:00',
      sessions: [{ ...sess('b', '2026-09-16'), makeup: { date: '2026-09-21', time: '14:00', status: 'planned' } }],
    },
    { id: 'wrong-time', time: '19:00', sessions: [{ ...sess('c', '2026-09-21'), time: '19:00' }] },
    { id: 'other-day', time: '14:00', sessions: [sess('d', '2026-09-28')] },
    {
      id: 'moved',
      time: '14:00',
      sessions: [{ ...sess('e', '2026-09-21'), makeup: { date: '2026-09-28', time: '14:00', status: 'planned' } }],
    },
    { id: 'attended', time: '14:00', sessions: [sess('f', '2026-09-21', 'attended')] },
  ],
  closureHit
);
assert.deepEqual(closureHits.map((s) => s.id), ['lesson', 'makeup']);
assert.equal(closureWhenLabel(closureHit), '9/21(월) 오후 2시 · 공휴일');

const midHoliday = applyHoliday(
  [{
    id: 'st2',
    name: 'ㄴ',
    weekday: 3,
    time: '14:00',
    sessions: [
      { ...sess('a', '2026-09-16'), cycle: 1 },
      { ...sess('b', '2026-09-23'), cycle: 2 },
      { ...sess('c', '2026-09-30'), cycle: 3 },
      { ...sess('d', '2026-10-07'), cycle: 4 },
    ],
  }],
  { id: 'm', date: '2026-09-30', endDate: '2026-09-30', time: '', reason: '', scope: 'all' }
);
const mid = sortSessions(midHoliday[0].sessions);
assert.equal(mid[0].date, '2026-09-16');
assert.equal(mid[0].cycle, 1);
assert.equal(mid[1].date, '2026-09-23');
assert.equal(mid[1].cycle, 2);
assert.equal(mid[2].status, 'cancelled');
assert.equal(mid[2].cycle, 3);
assert.equal(mid[2].date, '2026-09-30');
assert.equal(mid[3].status, 'pending');
assert.equal(mid[3].cycle, 3);
assert.equal(mid[3].date, '2026-10-07');
assert.equal(mid[4].cycle, 4);
assert.equal(mid[4].date, '2026-10-14');

const twoHold = sortSessions(
  applyHoliday(
    [{
      id: 'ex',
      name: 'ㅂ',
      weekday: 3,
      time: '14:00',
      sessions: [
        { ...sess('e1', '2026-09-16'), cycle: 1 },
        { ...sess('e2', '2026-09-23'), cycle: 2 },
        { ...sess('e3', '2026-09-30'), cycle: 3 },
        { ...sess('e4', '2026-10-07'), cycle: 4 },
      ],
    }],
    { id: 'h2', date: '2026-09-23', endDate: '2026-09-23', time: '', reason: '', scope: 'all' }
  )[0].sessions
);
assert.equal(twoHold[0].cycle, 1);
assert.equal(twoHold[1].status, 'cancelled');
assert.equal(twoHold[1].cycle, 2);
assert.equal(twoHold[1].date, '2026-09-23');
assert.equal(twoHold[2].status, 'pending');
assert.equal(twoHold[2].cycle, 2);
assert.equal(twoHold[2].date, '2026-09-30');
assert.equal(twoHold[3].cycle, 3);
assert.equal(twoHold[3].date, '2026-10-07');
assert.equal(twoHold[4].cycle, 4);
assert.equal(twoHold[4].date, '2026-10-14');
assert.equal(twoHold.filter((s) => s.status === 'cancelled').length, 1);

const weekOnly = sortSessions(
  applyHoliday(
    [{
      id: 'messy',
      name: 'ㅅ',
      weekday: 4,
      time: '14:00',
      sessions: [
        { ...sess('a1', '2026-09-10', 'attended'), cycle: 1 },
        { ...sess('a2', '2026-09-17'), cycle: 2 },
        { ...sess('a3', '2026-09-24'), cycle: 3 },
        { ...sess('a4', '2026-10-01'), cycle: 4 },
        { ...sess('junk1', '2026-09-17', 'cancelled'), cycle: 3 },
        { ...sess('junk2', '2026-09-17', 'cancelled'), cycle: 4 },
        { ...sess('junk3', '2026-09-17', 'cancelled'), cycle: 1 },
      ],
    }],
    { id: 'w', date: '2026-09-15', endDate: '2026-09-19', time: '', reason: '', scope: 'all' }
  )[0].sessions
);
assert.equal(weekOnly.filter((s) => s.status === 'cancelled').length, 1);
assert.equal(weekOnly.find((s) => s.status === 'cancelled').date, '2026-09-17');
assert.equal(weekOnly.find((s) => s.status === 'cancelled').cycle, 2);
assert.equal(weekOnly.find((s) => s.status === 'cancelled').id, 'holiday:2026-09-17:14:00');
assert.deepEqual(weekOnly.filter((s) => s.status !== 'cancelled').map((s) => s.cycle), [1, 2, 3, 4]);
assert.deepEqual(weekOnly.filter((s) => s.status !== 'cancelled').map((s) => s.date), ['2026-09-10', '2026-09-24', '2026-10-01', '2026-10-08']);

const lockedAfterHoliday = sortSessions(
  applyHoliday(
    [{
      id: 'lk',
      name: 'ㅂ',
      weekday: 3,
      time: '20:00',
      sessions: [
        { ...sess('a', '2026-09-09', 'absent'), cycle: 4 },
        { ...sess('b', '2026-09-23', 'attended'), cycle: 1, pack: 1, makeup: { date: '2026-09-23', time: '22:00', status: 'done' } },
      ],
    }],
    { id: 'hlock', date: '2026-09-15', endDate: '2026-09-19', time: '', reason: '', scope: 'all' }
  )[0].sessions
);
assert.equal(lockedAfterHoliday.filter((s) => s.status === 'cancelled').length, 1);
assert.equal(lockedAfterHoliday.find((s) => s.status === 'cancelled').date, '2026-09-16');
assert.equal(lockedAfterHoliday.find((s) => s.status === 'cancelled').cycle, 1);

assert.equal(isPublicHolidayDate('2026-09-16', [closure]), true);
assert.equal(isPublicHolidayDate('2026-09-23', [closure]), false);
assert.equal(hideFromLessonCheck({ ...sess('hold', '2026-09-16'), status: 'cancelled' }, []), true);
assert.equal(hideFromLessonCheck(sess('closed-day', '2026-09-16'), [closure]), true);
assert.equal(hideFromLessonCheck(sess('next-week', '2026-09-23'), [closure]), false);
assert.equal(
  hideFromLessonCheck(
    { ...sess('makeup-on-holiday', '2026-09-09'), makeup: { date: '2026-09-16', time: '14:00', status: 'planned' } },
    [closure]
  ),
  true
);
assert.equal(
  hideFromLessonCheck(sess('timed-other', '2026-09-16', 'pending'), [
    { id: 't', date: '2026-09-16', endDate: '2026-09-16', time: '14:00', reason: '단축', scope: 'all' },
  ]),
  true
);
assert.equal(
  hideFromLessonCheck(sess('private', '2026-09-16'), [
    { id: 'p', date: '2026-09-16', endDate: '2026-09-16', time: '', reason: '개인', scope: 'student', studentId: 'st' },
  ]),
  false
);

const weekHolidayDays = lessonCheckHolidayDays(
  [{ id: 'w', date: '2026-09-15', endDate: '2026-09-19', time: '', reason: '명절', scope: 'all' }],
  [{ weekday: 3, sessions: firstHoliday }],
  '2026-09-16'
);
assert.deepEqual(weekHolidayDays.map((d) => d.date), ['2026-09-16']);
assert.equal(weekHolidayDays[0].reason, '명절');
assert.equal(weekHolidayDays[0].past, false);

const sundayNotice = lessonCheckHolidayDays(
  [{ id: 'sun', date: '2026-09-20', endDate: '2026-09-20', time: '', reason: '', scope: 'all' }],
  [{ weekday: 3, sessions: [] }],
  '2026-09-16'
);
assert.deepEqual(sundayNotice.map((d) => d.date), ['2026-09-20']);
assert.equal(sundayNotice[0].past, false);

const pastHoliday = lessonCheckHolidayDays(
  [{ id: 'old', date: '2026-09-09', endDate: '2026-09-09', time: '', reason: '휴강', scope: 'all' }],
  [{ weekday: 3, sessions: [] }],
  '2026-09-16'
);
assert.equal(pastHoliday[0].past, true);

const setup = applyLessonSetup(
  { id: 'new', name: 'ㄷ', weekday: 1, time: '10:00', startCycle: 1, sessions: [] },
  { weekday: 3, time: '14:00', startCycle: 3, firstDate: '2026-09-16' }
);
assert.deepEqual(setup.sessions.map((s) => s.cycle), [3, 4, 1, 2]);
assert.equal(setup.startCycle, 3);
assert.equal(setup.weekday, 3);
assert.equal(setup.sessions[0].date, '2026-09-16');
assert.equal(setup.sessions[1].date, '2026-09-23');

const retargeted = applyLessonSetup(
  {
    id: 'old',
    name: 'ㄹ',
    weekday: 3,
    time: '14:00',
    startCycle: 1,
    sessions: [
      { ...sess('p', '2026-09-16'), cycle: 1 },
      { ...sess('q', '2026-09-23'), cycle: 2 },
      { ...sess('r', '2026-09-30'), cycle: 3 },
      { ...sess('s', '2026-10-07'), cycle: 4 },
    ],
  },
  { weekday: 3, time: '14:00', startCycle: 2, firstDate: '2026-09-16' }
);
assert.deepEqual(retargeted.sessions.map((s) => s.cycle), [2, 3, 4, 1]);
assert.equal(retargeted.sessions[0].id, 'p');
assert.equal(retargeted.sessions[0].date, '2026-09-16');

const partial = applyLessonSetup(
  {
    id: 'mix',
    name: 'ㅁ',
    weekday: 3,
    time: '14:00',
    startCycle: 1,
    sessions: [
      { ...sess('done1', '2026-09-09', 'attended'), cycle: 2 },
      { ...sess('done2', '2026-09-16', 'attended'), cycle: 3 },
      { ...sess('open1', '2026-10-07'), cycle: 4 },
      { ...sess('open2', '2026-10-14'), cycle: 1 },
    ],
  },
  { weekday: 3, time: '14:00', startCycle: 2, firstDate: '2026-09-30' }
);
const open = partial.sessions.filter((s) => s.status === 'pending');
assert.equal(partial.sessions.find((s) => s.id === 'done1').date, '2026-09-09');
assert.equal(partial.sessions.find((s) => s.id === 'done1').cycle, 2);
assert.equal(open[0].id, 'open1');
assert.equal(open[0].cycle, 2);
assert.equal(open[0].date, '2026-09-30');
assert.equal(open[1].cycle, 3);
assert.equal(open[1].date, '2026-10-07');

function packStudent(sessions, payments = []) {
  return { sessions, payments };
}
const four = [
  sess('1', '2026-09-02'),
  sess('2', '2026-09-09'),
  { ...sess('3', '2026-09-16'), cycle: 3 },
  { ...sess('4', '2026-09-23'), cycle: 4 },
  { ...sess('5', '2026-09-30'), cycle: 1, pack: 1 },
];
four[0].cycle = 1;
four[1].cycle = 2;
assert.equal(paymentBadge(packStudent(four)), 'unpaid');
assert.equal(paymentBoxesForSession(packStudent(four), four[0]).length, 1);
assert.equal(paymentBoxesForSession(packStudent(four), four[0])[0].paid, false);
assert.equal(paymentBoxesForSession(packStudent(four), four[1]).length, 1);
assert.equal(paymentBoxesForSession(packStudent(four), four[2]).length, 1);
assert.equal(paymentBoxesForSession(packStudent(four), four[3]).length, 1);
assert.equal(paymentBoxesForSession(packStudent(four), four[3])[0].paid, false);
assert.equal(paymentBoxesForSession(packStudent(four), four[4]).length, 2);
assert.equal(paymentBoxesForSession(packStudent(four), four[4]).every((p) => !p.paid), true);
assert.deepEqual(lessonCheckPayNotes(packStudent(four), four[0]), ['(미결제)']);
assert.deepEqual(lessonCheckPayNotes(packStudent(four), four[3]), ['(결제 알리기)', '(미결제)']);
assert.deepEqual(lessonCheckPayNotes(packStudent(four), four[4]), ['(미결제)']);
const paidOnce = packStudent(four, upsertPayment([], 0, true, '2026-09-24', four[1].id));
assert.equal(paymentBadge(paidOnce), 'unpaid');
assert.equal(paymentBoxesForSession(paidOnce, four[0]).length, 1);
assert.equal(paymentBoxesForSession(paidOnce, four[0])[0].paid, false);
assert.equal(paymentBoxesForSession(paidOnce, four[1]).length, 1);
assert.equal(paymentBoxesForSession(paidOnce, four[1])[0].paid, true);
assert.equal(paymentBoxesForSession(paidOnce, four[1])[0].paidAt, '2026-09-24');
assert.equal(paymentBoxesForSession(paidOnce, four[2]).length, 0);
assert.equal(paymentBoxesForSession(paidOnce, four[3]).length, 0);
assert.equal(paymentBoxesForSession(paidOnce, four[4]).length, 1);
assert.equal(paymentBoxesForSession(paidOnce, four[4])[0].pack, 1);
assert.equal(paymentBoxesForSession(paidOnce, four[4])[0].paid, false);
assert.deepEqual(lessonCheckPayNotes(paidOnce, four[0]), ['(미결제)']);
assert.deepEqual(lessonCheckPayNotes(paidOnce, four[1]), []);
assert.deepEqual(lessonCheckPayNotes(paidOnce, four[4]), ['(미결제)']);
const nextFour = [...four, { ...sess('6', '2026-10-21'), cycle: 4, pack: 1 }];
assert.equal(paymentBadge(packStudent(nextFour, paidOnce.payments)), 'unpaid');
const nextPay = paymentBoxesForSession(packStudent(nextFour, paidOnce.payments), nextFour[5]);
assert.equal(nextPay.length, 1);
assert.equal(nextPay[0].pack, 1);
assert.equal(nextPay[0].paid, false);
assert.deepEqual(lessonCheckPayNotes(packStudent(nextFour, paidOnce.payments), nextFour[5]), ['(결제 알리기)', '(미결제)']);
assert.deepEqual(lessonCheckPayNotes(packStudent(nextFour), nextFour[5]), ['(결제 알리기)', '(미결제)']);
assert.deepEqual(
  lessonCheckPayNotes(packStudent([{ ...four[3], status: 'cancelled' }], []), { ...four[3], status: 'cancelled' }),
  []
);

const afterTwo = insertSessionAfter(
  [
    { ...sess('a', '2026-09-16'), cycle: 2 },
    { ...sess('b', '2026-09-23'), cycle: 3 },
  ],
  'a',
  { time: '14:00', weekday: 3, startCycle: 1 }
);
assert.equal(afterTwo.length, 3);
assert.equal(afterTwo[1].cycle, 3);
assert.equal(afterTwo[1].date, '2026-09-16');
assert.equal(afterTwo[1].id !== 'a' && afterTwo[1].id !== 'b', true);
assert.equal(afterTwo[2].id, 'b');
assert.equal(afterTwo[2].cycle, 4);
assert.equal(afterTwo[2].date, '2026-09-23');
const sameDayKept = sortSessions(
  applyHoliday(
    [{
      id: 'dbl',
      name: '같은날',
      weekday: 3,
      time: '14:00',
      sessions: [
        { ...sess('d1', '2026-09-16'), cycle: 1, time: '14:00' },
        { ...sess('d2', '2026-09-16'), cycle: 2, time: '16:00' },
        { ...sess('d3', '2026-09-23'), cycle: 3 },
      ],
    }],
    { id: 'later', date: '2026-09-30', endDate: '2026-09-30', time: '', reason: '', scope: 'all' }
  )[0].sessions
);
assert.deepEqual(sameDayKept.filter((s) => s.status !== 'cancelled').map((s) => s.date), [
  '2026-09-16',
  '2026-09-16',
  '2026-09-23',
]);
const timed = insertSessionAfter(
  [
    { ...sess('a', '2026-09-16'), cycle: 2, time: '14:00' },
    { ...sess('b', '2026-09-23'), cycle: 3, time: '14:00' },
  ],
  'a',
  { time: '16:30', weekday: 3 }
);
assert.equal(timed[1].time, '16:30');
assert.equal(timed[2].time, '14:00');
const afterFour = insertSessionAfter([{ ...sess('z', '2026-10-07'), cycle: 4, pack: 0 }], 'z', { time: '14:00' });
assert.equal(afterFour[1].cycle, 1);
assert.equal(afterFour[1].pack, 1);
assert.equal(afterFour[1].date, '2026-10-07');
const firstOnly = insertSessionAfter([], undefined, { time: '15:30', weekday: 3, startCycle: 2 });
assert.equal(firstOnly.length, 1);
assert.equal(firstOnly[0].cycle, 2);
assert.equal(firstOnly[0].pack, 0);
assert.equal(removeSessionById(afterTwo, afterTwo[1].id).map((s) => s.id).join(','), 'a,b');

const gapped = insertSessionAfter(
  [
    { ...sess('a', '2026-09-16'), cycle: 1 },
    { ...sess('b', '2026-09-23'), cycle: 2 },
    { ...sess('c', '2026-10-14'), cycle: 3 },
    { ...sess('d', '2026-10-21'), cycle: 4 },
  ],
  'b',
  { time: '14:00', weekday: 3 }
);
assert.deepEqual(gapped.map((s) => s.date), [
  '2026-09-16',
  '2026-09-23',
  '2026-09-23',
  '2026-09-30',
  '2026-10-07',
]);
const makeupAligned = realignAfter(
  [
    { ...sess('a', '2026-09-16'), cycle: 1 },
    { ...sess('b', '2026-09-23'), cycle: 2, makeup: { date: '2026-09-25', time: '14:00', status: 'planned' } },
    { ...sess('c', '2026-10-14'), cycle: 3 },
    { ...sess('d', '2026-10-21'), cycle: 4 },
  ],
  'b',
  { weekday: 3, time: '14:00' }
);
assert.equal(makeupAligned.find((s) => s.id === 'b').date, '2026-09-23');
assert.equal(makeupAligned.find((s) => s.id === 'c').date, '2026-09-30');
assert.equal(makeupAligned.find((s) => s.id === 'd').date, '2026-10-07');
const removed = realignAfter(
  removeSessionById(
    [
      { ...sess('a', '2026-09-16'), cycle: 1 },
      { ...sess('b', '2026-09-23'), cycle: 2 },
      { ...sess('c', '2026-09-30'), cycle: 3 },
      { ...sess('d', '2026-10-07'), cycle: 4 },
    ],
    'b'
  ),
  'a',
  { weekday: 3, time: '14:00' }
);
assert.deepEqual(removed.map((s) => s.date), ['2026-09-16', '2026-09-23', '2026-09-30']);

const appended = appendContinuingSessions(
  [
    { ...sess('a', '2026-09-16'), cycle: 2 },
    { ...sess('b', '2026-09-23'), cycle: 3 },
  ],
  1,
  { weekday: 3, time: '20:00' }
);
assert.equal(appended.length, 3);
assert.equal(appended[0].date, '2026-09-16');
assert.equal(appended[1].date, '2026-09-23');
assert.equal(appended[2].cycle, 4);
assert.equal(appended[2].date, '2026-09-30');
assert.equal(appended[2].time, '20:00');
const continued = appendContinuingSessions(
  [{ ...sess('z', '2026-10-07'), cycle: 2, pack: 0 }],
  4,
  { weekday: 3, time: '14:00' }
);
assert.deepEqual(continued.slice(1).map((s) => s.cycle), [3, 4, 1, 2]);
assert.deepEqual(continued.slice(1).map((s) => s.pack), [0, 0, 1, 1]);
assert.deepEqual(continued.slice(1).map((s) => s.date), ['2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04']);
const picked = appendContinuingSessions(
  [{ ...sess('z', '2026-10-07'), cycle: 2, pack: 0 }],
  1,
  { weekday: 3, time: '14:00', cycle: 1 }
);
assert.equal(picked[1].cycle, 1);
assert.equal(picked[1].pack, 1);
assert.equal(picked[1].date, '2026-10-14');
const samePackPick = appendContinuingSessions(
  [{ ...sess('z', '2026-10-07'), cycle: 2, pack: 0 }],
  1,
  { weekday: 3, time: '20:00', cycle: 4 }
);
assert.equal(samePackPick[1].cycle, 4);
assert.equal(samePackPick[1].pack, 0);
const explicitPack = appendContinuingSessions(
  [{ ...sess('z', '2026-10-07'), cycle: 2, pack: 0 }],
  1,
  { weekday: 3, time: '14:00', cycle: 1, pack: 0 }
);
assert.equal(explicitPack[1].cycle, 1);
assert.equal(explicitPack[1].pack, 0);
const afterMakeup = appendContinuingSessions(
  [
    {
      ...sess('late', '2026-09-23'),
      cycle: 3,
      makeup: { date: '2026-10-08', time: '19:00', status: 'done' },
    },
  ],
  1,
  { weekday: 3, time: '19:00' }
);
assert.equal(afterMakeup[1].date, '2026-09-30');

assert.equal(formatTime12('14:00'), '오후 2시');
assert.equal(formatTime12('20:00'), '오후 8시');
assert.equal(formatTime12('09:30'), '오전 9시 30분');
assert.equal(formatTime12('00:00'), '오전 12시');
assert.equal(formatTime12('12:00'), '오후 12시');
assert.equal(normalizeTime('오후 2시'), '14:00');
assert.equal(normalizeTime('오전 9시 30분'), '09:30');
assert.equal(normalizeTime('오후 12시'), '12:00');

assert.equal(slotInMakeupWindow('2026-09-16', '2026-09-23'), true);
assert.equal(slotInMakeupWindow('2026-09-15', '2026-09-23'), false);
assert.equal(slotInMakeupWindow('2026-09-30', '2026-09-23'), true);
assert.equal(slotInMakeupWindow('2026-10-01', '2026-09-23'), false);
assert.equal(makeupRequestLocked('2026-09-23', '2026-09-19'), false);
assert.equal(makeupRequestLocked('2026-09-23', '2026-09-20'), true);
assert.equal(
  makeupRequestBlockReason({ date: '2026-09-23', status: 'pending' }, '2026-09-15', '2026-09-13'),
  '이 시간은 해당 레슨일 기준 앞뒤 1주 안의 보강 시간이 아닙니다.'
);
assert.equal(
  makeupRequestBlockReason({ date: '2026-09-23', status: 'pending' }, '2026-09-20', '2026-09-20'),
  '레슨 3일 전부터는 보강 신청을 할 수 없습니다.'
);
assert.equal(
  slotsForSessionMakeup(
    [{ id: 'in', date: '2026-10-02' }, { id: 'out', date: '2026-09-17' }],
    { date: '2026-10-07', status: 'pending' },
    '2026-09-13'
  ).map((s) => s.id).join(','),
  'in'
);

const openSlotEligible = studentsEligibleForOpenSlot(
  [
    { id: 'in', sessions: [sess('a', '2026-09-28')] },
    { id: 'locked', sessions: [sess('b', '2026-09-20')] },
    { id: 'attended', sessions: [{ ...sess('c', '2026-09-28'), status: 'attended' }] },
    { id: 'far', sessions: [sess('d', '2026-10-10')] },
  ],
  '2026-09-21',
  '2026-09-18'
);
assert.deepEqual(openSlotEligible.map((s) => s.id), ['in']);
assert.equal(openSlotWhenLabel({ date: '2026-09-21', startTime: '19:00', endTime: '20:00' }), '9/21(월) 오후 7시–오후 8시');

const split = splitSessionsAroundToday(
  [
    { ...sess('old-pending', '2026-09-01'), time: '10:00', cycle: 1, pack: 0 },
    { ...sess('old-attended', '2026-09-02'), status: 'attended', time: '10:00', cycle: 1, pack: 0 },
    {
      ...sess('attended-future-makeup', '2026-09-09'),
      status: 'attended',
      time: '14:00',
      cycle: 2,
      pack: 0,
      makeup: { date: '2026-10-01', time: '17:00', status: 'planned' },
    },
    {
      ...sess('makeup-future', '2026-09-03'),
      time: '14:00',
      cycle: 2,
      pack: 0,
      makeup: { date: '2026-09-20', time: '19:00', status: 'planned' },
    },
    {
      ...sess('makeup-done', '2026-09-04'),
      status: 'absent',
      time: '14:00',
      cycle: 3,
      pack: 0,
      makeup: { date: '2026-09-10', time: '19:00', status: 'done' },
    },
    { ...sess('today-late', '2026-09-16'), time: '16:00', cycle: 3, pack: 0 },
    { ...sess('today-early', '2026-09-16'), time: '10:00', cycle: 2, pack: 0 },
    { ...sess('future', '2026-09-23'), time: '14:00', cycle: 4, pack: 0 },
  ],
  '2026-09-16'
);
assert.deepEqual(split.upcoming.map((s) => s.id), [
  'today-early',
  'today-late',
  'makeup-future',
  'future',
  'attended-future-makeup',
]);
assert.deepEqual(split.past.map((s) => s.id), ['makeup-done', 'old-attended', 'old-pending']);

const checkedToday = splitSessionsAroundToday(
  [
    { ...sess('today-attended', '2026-09-16'), status: 'attended', time: '10:00', cycle: 1, pack: 0 },
    { ...sess('today-absent', '2026-09-16'), status: 'absent', time: '11:00', cycle: 2, pack: 0 },
    { ...sess('today-makeup-done', '2026-09-10'), time: '12:00', cycle: 3, pack: 0, makeup: { date: '2026-09-16', time: '12:00', status: 'done' } },
    { ...sess('yest-pending', '2026-09-15'), time: '10:00', cycle: 1, pack: 0 },
    { ...sess('yest-attended', '2026-09-15'), status: 'attended', time: '10:00', cycle: 2, pack: 0 },
  ],
  '2026-09-16'
);
assert.deepEqual(checkedToday.upcoming.map((s) => s.id), ['today-attended', 'today-absent', 'today-makeup-done']);
assert.deepEqual(checkedToday.past.map((s) => s.id), ['yest-attended', 'yest-pending']);

const pastFromToday = splitSessionsAroundToday(
  [
    { ...sess('week-ago', '2026-09-09'), status: 'attended', time: '14:00', cycle: 1, pack: 0 },
    {
      ...sess('old-orig-recent-makeup', '2026-08-26'),
      time: '10:00',
      cycle: 2,
      pack: 0,
      makeup: { date: '2026-09-15', time: '10:00', status: 'done' },
    },
    { ...sess('two-weeks', '2026-09-02'), status: 'attended', time: '14:00', cycle: 3, pack: 0 },
  ],
  '2026-09-16'
);
assert.deepEqual(pastFromToday.past.map((s) => s.id), [
  'old-orig-recent-makeup',
  'week-ago',
  'two-weeks',
]);

const makeupSession = {
  ...sess('mk', '2026-09-09'),
  makeup: { date: '2026-10-01', time: '10:00', status: 'planned' },
};
assert.equal(applyAttendance(makeupSession, 'attended').makeup.status, 'done');
assert.equal(applyAttendance(makeupSession, 'absent').makeup.status, 'absent');
assert.equal(applyAttendance(makeupSession, 'pending').makeup.status, 'planned');
assert.equal(applyAttendance(makeupSession, 'attended').status, 'pending');
assert.equal(applyAttendance(sess('plain', '2026-09-09'), 'attended').status, 'attended');
assert.equal(applyAttendance(sess('plain', '2026-09-09'), 'attended').makeup, null);

const makeupStudent = {
  id: 'st',
  weekday: 3,
  time: '14:00',
  sessions: [
    { ...sess('a', '2026-09-16'), cycle: 1 },
    { ...sess('b', '2026-09-23'), cycle: 2 },
    { ...sess('c', '2026-09-30'), cycle: 3 },
    { ...sess('d', '2026-10-07'), cycle: 4 },
  ],
};
const firstFutureMakeup = applyMakeupReplacement(makeupStudent, 'b', {
  date: '2026-10-20',
  time: '10:00',
  status: 'planned',
});
assert.equal(firstFutureMakeup.sessions.find((s) => s.id === 'a').date, '2026-09-16');
assert.equal(firstFutureMakeup.sessions.find((s) => s.id === 'b').date, '2026-09-23');
assert.equal(firstFutureMakeup.sessions.find((s) => s.id === 'b').makeup.date, '2026-10-20');
assert.equal(firstFutureMakeup.sessions.find((s) => s.id === 'c').date, '2026-09-30');
assert.equal(firstFutureMakeup.sessions.find((s) => s.id === 'd').date, '2026-10-07');
assert.deepEqual(firstFutureMakeup.sessions.map((s) => s.cycle), [1, 2, 3, 4]);

const movedMakeupLater = applyMakeupReplacement(firstFutureMakeup, 'b', {
  date: '2026-11-03',
  time: '10:00',
  status: 'planned',
});
assert.equal(movedMakeupLater.sessions.find((s) => s.id === 'c').date, '2026-09-30');
assert.equal(movedMakeupLater.sessions.find((s) => s.id === 'd').date, '2026-10-07');
assert.equal(movedMakeupLater.sessions.find((s) => s.id === 'b').makeup.date, '2026-11-03');
assert.deepEqual(movedMakeupLater.sessions.map((s) => s.cycle), [1, 2, 3, 4]);

const nearMakeup = applyMakeupReplacement(makeupStudent, 'b', {
  date: '2026-09-25',
  time: '14:00',
  status: 'planned',
});
assert.equal(nearMakeup.sessions.find((s) => s.id === 'c').date, '2026-09-30');
assert.equal(nearMakeup.sessions.find((s) => s.id === 'd').date, '2026-10-07');
assert.deepEqual(nearMakeup.sessions.map((s) => s.cycle), [1, 2, 3, 4]);

const gappedMakeup = applyMakeupReplacement(
  {
    ...makeupStudent,
    sessions: [
      { ...sess('a', '2026-09-16'), cycle: 1 },
      { ...sess('b', '2026-09-23'), cycle: 2 },
      { ...sess('c', '2026-10-14'), cycle: 3 },
      { ...sess('d', '2026-10-21'), cycle: 4 },
    ],
  },
  'b',
  { date: '2026-09-25', time: '14:00', status: 'planned' }
);
assert.equal(gappedMakeup.sessions.find((s) => s.id === 'c').date, '2026-10-14');
assert.equal(gappedMakeup.sessions.find((s) => s.id === 'd').date, '2026-10-21');
assert.deepEqual(gappedMakeup.sessions.map((s) => s.cycle), [1, 2, 3, 4]);

const cancelledMakeup = applyMakeupReplacement(firstFutureMakeup, 'b', null);
assert.equal(cancelledMakeup.sessions.find((s) => s.id === 'b').makeup, null);
assert.equal(cancelledMakeup.sessions.find((s) => s.id === 'c').date, '2026-09-30');
assert.equal(cancelledMakeup.sessions.find((s) => s.id === 'd').date, '2026-10-07');
assert.deepEqual(cancelledMakeup.sessions.map((s) => s.cycle), [1, 2, 3, 4]);

const added = insertSessionAfter(makeupStudent.sessions, 'b', { time: '14:00', weekday: 3 });
assert.deepEqual(
  added.filter((s) => s.status !== 'cancelled').map((s) => s.cycle),
  [1, 2, 3, 4, 1]
);

console.log('schedule tests ok');
