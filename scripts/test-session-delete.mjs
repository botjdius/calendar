import { mergeRemovedSessionIds, mergeStudents } from '../server/cloud.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const deleted = {
  id: 'student-1',
  name: '레슨생',
  sessions: [{ id: 'keep', date: '2026-10-01' }],
  removedSessionIds: ['gone'],
};

const staleDevice = {
  id: 'student-1',
  name: '레슨생',
  sessions: [
    { id: 'gone', date: '2026-09-24', updatedAt: '2026-09-29T08:00:00.000Z' },
    { id: 'keep', date: '2026-10-01' },
  ],
};

const mergedFromNewerStaleDevice = mergeStudents([deleted], [staleDevice], true)[0];
assert(
  !mergedFromNewerStaleDevice.sessions.some((session) => session.id === 'gone'),
  'a newer stale device must not restore a deleted session'
);
assert(
  mergedFromNewerStaleDevice.sessions.some((session) => session.id === 'keep'),
  'deleting one session must keep the other sessions'
);
assert(
  mergedFromNewerStaleDevice.removedSessionIds.includes('gone'),
  'the deleted session tombstone must survive the merge'
);

const mergedFromOlderStaleDevice = mergeStudents([staleDevice], [deleted], false)[0];
assert(
  !mergedFromOlderStaleDevice.sessions.some((session) => session.id === 'gone'),
  'an older deletion tombstone must still beat a stale session'
);

const ids = mergeRemovedSessionIds(['gone'], ['gone', 'other']);
assert(ids.join(',') === 'gone,other', 'session tombstones must merge without duplicates');

const duplicateHolidays = mergeStudents(
  [],
  [
    {
      id: 'student-holiday',
      name: '휴강 중복',
      sessions: [
        { id: 'old-hold-1', status: 'cancelled', date: '2026-09-17', time: '14:00' },
        { id: 'old-hold-2', status: 'cancelled', date: '2026-09-17', time: '14:00' },
        { id: 'lesson', status: 'pending', date: '2026-09-24', time: '14:00' },
      ],
    },
  ],
  true
)[0];
assert(
  duplicateHolidays.sessions.filter((session) => session.status === 'cancelled').length === 1,
  'duplicate holiday rows must collapse to one row per date'
);
assert(
  duplicateHolidays.sessions.some((session) => session.id === 'lesson'),
  'holiday cleanup must keep real lessons'
);

console.log('ok deleted sessions stay deleted across device and cloud merges');
