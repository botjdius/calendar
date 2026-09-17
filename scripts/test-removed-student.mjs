import {
  isStudentRemoved,
  joinCodeBlocked,
  mergeRemovedStudents,
  mergeStudio,
  resolveStudentJoin,
  studentSessionRevoked,
  unusedJoinCode,
} from '../server/cloud.mjs';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function testTombstoneHidesDeletedStudent() {
  const removed = mergeRemovedStudents(
    [],
    [{ id: 's1', joinCode: 'ABC123', linkedUid: 'u1', removedAt: '2026-09-16T00:00:00.000Z' }]
  );
  const current = {
    version: 1,
    students: [
      {
        id: 's1',
        name: 'ㅂ',
        joinCode: 'ABC123',
        linkedUid: 'u1',
        sessions: [{ id: 'x', note: '', studentNote: '', status: 'pending', attachments: [] }],
      },
    ],
    closures: [{ id: 'c1', date: '2026-09-20', scope: 'all', reason: '휴강', time: '' }],
    openSlots: [{ id: 'slot1', date: '2026-09-21', startTime: '19:00', endTime: '20:00', note: '' }],
    requests: [{ id: 'r1', studentId: 's1', status: 'pending' }],
    accounts: [{ uid: 'u1', name: 'ㅂ', role: 'student', studentId: 's1', password: 'ABC123' }],
    bank: { bankName: '', accountNumber: '', accountHolder: '' },
    removedStudents: [],
  };
  const incoming = {
    version: 2,
    students: [],
    closures: [
      { id: 'c1', date: '2026-09-20', scope: 'all', reason: '휴강', time: '' },
      { id: 'c2', date: '2026-09-27', scope: 'all', reason: '새 휴강', time: '' },
    ],
    openSlots: [
      { id: 'slot1', date: '2026-09-21', startTime: '19:00', endTime: '20:00', note: '' },
      { id: 'slot2', date: '2026-10-01', startTime: '19:00', endTime: '20:00', note: '' },
    ],
    requests: [],
    accounts: [{ uid: 'teach', name: '서연', role: 'instructor', passwordHash: 'x' }],
    bank: { bankName: '', accountNumber: '', accountHolder: '' },
    removedStudents: removed,
  };
  const merged = mergeStudio(current, incoming);
  assert(!merged.students.some((s) => s.id === 's1'), 'deleted student must not come back');
  assert(isStudentRemoved(merged.removedStudents, { id: 's1', uid: 'u1' }), 'tombstone kept');
  assert(joinCodeBlocked('ABC123', merged.students, merged.removedStudents), 'old join code blocked');
  assert(studentSessionRevoked('u1', current.accounts, merged.students, merged.removedStudents), 'session revoked');
  const live = liveStudents(current.students, merged.removedStudents);
  assert(!live.length, 'liveStudents drops tombstoned card');
  console.log('ok deleted student cannot return via merge');
}

function testInstructorKeepsOtherStudents() {
  const merged = mergeStudio(
    {
      version: 1,
      students: [
        { id: 'keep', name: 'ㅈ', joinCode: 'KEEP01', linkedUid: 'u2', sessions: [] },
        { id: 'gone', name: 'ㅂ', joinCode: 'GONE01', linkedUid: 'u1', sessions: [] },
      ],
      closures: [],
      openSlots: [],
      requests: [
        { id: 'r1', studentId: 'gone', status: 'pending' },
        { id: 'r2', studentId: 'keep', status: 'pending' },
      ],
      accounts: [],
      bank: { bankName: '', accountNumber: '', accountHolder: '' },
      removedStudents: [],
    },
    {
      version: 2,
      students: [{ id: 'keep', name: 'ㅈ', joinCode: 'KEEP01', linkedUid: 'u2', sessions: [] }],
      closures: [],
      openSlots: [],
      requests: [{ id: 'r2', studentId: 'keep', status: 'pending' }],
      accounts: [],
      bank: { bankName: '', accountNumber: '', accountHolder: '' },
      removedStudents: [{ id: 'gone', joinCode: 'GONE01', linkedUid: 'u1', removedAt: '2026-09-16T00:00:00.000Z' }],
    }
  );
  assert(merged.students.some((s) => s.id === 'keep'), 'other student remains');
  assert(!merged.students.some((s) => s.id === 'gone'), 'deleted student removed');
  assert(
    merged.requests.every((r) => r.studentId !== 'gone'),
    'deleted student requests removed'
  );
  console.log('ok other students stay after a delete');
}

function testRecreatedStudentCanJoinWithNewCode() {
  const neu = {
    id: 'new-b',
    name: 'ㅂ',
    joinCode: 'C6FYJT',
    linkedUid: null,
    sessions: [],
  };
  const other = {
    id: 'keep',
    name: '황도영',
    joinCode: 'TEF4NK',
    linkedUid: 'u2',
    sessions: [],
  };
  const removed = [
    {
      id: 'old-b',
      name: 'ㅂ',
      joinCode: 'Y6WMT7',
      linkedUid: 'old-uid',
      removedAt: '2026-09-16T13:04:14.865Z',
    },
  ];
  assert(!isStudentRemoved(removed, neu), 'new ㅂ must not be hidden by old join code or name');
  assert(
    !isStudentRemoved(removed, { joinCode: 'Y6WMT7', password: 'Y6WMT7', name: 'ㅂ' }),
    'tombstone matches identity only'
  );
  assert(isStudentRemoved(removed, { id: 'old-b', uid: 'old-uid' }), 'old ㅂ stays removed');

  const { card, roster, removed: mergedRemoved } = resolveStudentJoin(
    [],
    [other, neu],
    [],
    removed,
    'c6fyjt'
  );
  assert(card && card.id === 'new-b', 'new join code found even if local roster was emptied');
  assert(roster.some((s) => s.id === 'new-b'), 'recreated ㅂ stays in live roster');
  assert(roster.some((s) => s.id === 'keep'), 'other students stay while joining');
  assert(!joinCodeBlocked('C6FYJT', roster, mergedRemoved), 'live join code is not blocked');

  const oldJoin = resolveStudentJoin([], [other, neu], [], removed, 'Y6WMT7');
  assert(!oldJoin.card, 'deleted join code does not log in');
  assert(joinCodeBlocked('Y6WMT7', oldJoin.roster, oldJoin.removed), 'deleted join code stays blocked');

  const nextCode = unusedJoinCode([neu, other], removed);
  assert(nextCode !== 'Y6WMT7' && nextCode !== 'C6FYJT' && nextCode !== 'TEF4NK', 'new cards skip live and tombstone codes');
  console.log('ok recreated student can join with new code');
}

function testEmptyRevokedSnapshotDoesNotWipeRoster() {
  const merged = mergeStudio(
    {
      version: 697,
      students: [
        { id: 'new-b', name: 'ㅂ', joinCode: 'C6FYJT', linkedUid: null, sessions: [] },
        { id: 'keep', name: '황도영', joinCode: 'TEF4NK', linkedUid: 'u2', sessions: [] },
      ],
      closures: [],
      openSlots: [],
      requests: [],
      accounts: [],
      bank: { bankName: '', accountNumber: '', accountHolder: '' },
      removedStudents: [
        { id: 'old-b', name: 'ㅂ', joinCode: 'Y6WMT7', linkedUid: 'old-uid', removedAt: '2026-09-16T13:04:14.865Z' },
      ],
    },
    {
      version: 698,
      students: [],
      closures: [],
      openSlots: [],
      requests: [],
      accounts: [],
      bank: { bankName: '', accountNumber: '', accountHolder: '' },
      removedStudents: [
        { id: 'old-b', name: 'ㅂ', joinCode: 'Y6WMT7', linkedUid: 'old-uid', removedAt: '2026-09-16T13:04:14.865Z' },
      ],
    }
  );
  assert(merged.students.some((s) => s.id === 'new-b'), 'revoked empty snapshot must not delete the new ㅂ');
  assert(merged.students.some((s) => s.id === 'keep'), 'revoked empty snapshot must not delete other students');
  console.log('ok revoked empty snapshot keeps roster');
}

testTombstoneHidesDeletedStudent();
testInstructorKeepsOtherStudents();
testRecreatedStudentCanJoinWithNewCode();
testEmptyRevokedSnapshotDoesNotWipeRoster();
console.log('ok removed student tests');
