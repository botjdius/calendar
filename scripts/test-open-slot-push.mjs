import assert from 'node:assert/strict';
import { matchPushSubscriptions } from '../server/pushStore.mjs';
import { openSlotWhenLabel, studentsEligibleForOpenSlot } from '../server/lib.mjs';

const list = [
  {
    uid: 'u-in',
    role: 'student',
    studentId: 'in',
    endpoint: 'https://web.push.apple.com/in',
    subscription: { endpoint: 'https://web.push.apple.com/in', keys: { p256dh: 'a', auth: 'b' } },
    updatedAt: '2026-09-18T00:00:00.000Z',
  },
  {
    uid: 'u-other',
    role: 'student',
    studentId: 'far',
    endpoint: 'https://web.push.apple.com/far',
    subscription: { endpoint: 'https://web.push.apple.com/far', keys: { p256dh: 'a', auth: 'b' } },
    updatedAt: '2026-09-18T00:00:00.000Z',
  },
  {
    uid: 'u-teacher',
    role: 'instructor',
    endpoint: 'https://web.push.apple.com/teacher',
    subscription: { endpoint: 'https://web.push.apple.com/teacher', keys: { p256dh: 'a', auth: 'b' } },
    updatedAt: '2026-09-18T00:00:00.000Z',
  },
];

const eligible = studentsEligibleForOpenSlot(
  [
    { id: 'in', linkedUid: 'u-in', sessions: [{ id: 'a', date: '2026-09-28', status: 'pending' }] },
    { id: 'far', linkedUid: 'u-other', sessions: [{ id: 'd', date: '2026-10-10', status: 'pending' }] },
  ],
  '2026-09-21',
  '2026-09-18'
);
assert.deepEqual(eligible.map((student) => student.id), ['in']);

const payload = {
  audience: 'students',
  studentIds: eligible.map((student) => student.id),
  linkedUids: eligible.map((student) => student.linkedUid).filter(Boolean),
  title: '새 보강 시간',
  body: `${openSlotWhenLabel({ date: '2026-09-21', startTime: '19:00', endTime: '20:00' })}에 보강 신청할 수 있습니다.`,
  url: '/board',
  tag: 'open-slot-slot-1',
};
const targets = matchPushSubscriptions(list, payload);
assert.deepEqual(targets.map((item) => item.studentId), ['in']);
console.log('ok open slot student push');
