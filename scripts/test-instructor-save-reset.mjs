import { mergeStudents } from '../server/cloud.mjs';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function testStaleCloudDoesNotBeatLocalMakeupWhenLocalNewer() {
  const local = [
    {
      id: 's1',
      name: '레슨생',
      sessions: [
        {
          id: 'x',
          date: '2026-10-01',
          time: '14:00',
          status: 'pending',
          makeup: { date: '2026-10-08', time: '14:00', status: 'planned' },
          updatedAt: '2026-10-01T12:00:00.000Z',
        },
      ],
    },
  ];
  const staleCloud = [
    {
      id: 's1',
      name: '레슨생',
      sessions: [
        {
          id: 'x',
          date: '2026-10-01',
          time: '14:00',
          status: 'pending',
          makeup: null,
          updatedAt: '2026-10-01T11:00:00.000Z',
        },
      ],
    },
  ];
  const merged = mergeStudents(local, staleCloud, false)[0];
  assert(merged.sessions[0].makeup?.date === '2026-10-08', 'local makeup must survive a stale cloud snapshot');
  console.log('ok stale cloud does not wipe newer local makeup');
}

function testEqualVersionCloudTieKeepsLocalMakeup() {
  const local = [
    {
      id: 's1',
      name: '레슨생',
      sessions: [
        {
          id: 'x',
          date: '2026-10-01',
          time: '14:00',
          status: 'pending',
          makeup: { date: '2026-10-08', time: '14:00', status: 'planned' },
        },
      ],
    },
  ];
  const cloud = [
    {
      id: 's1',
      name: '레슨생',
      sessions: [{ id: 'x', date: '2026-10-01', time: '14:00', status: 'pending', makeup: null }],
    },
  ];
  const merged = mergeStudents(local, cloud, false)[0];
  assert(merged.sessions[0].makeup?.date === '2026-10-08', 'equal-version tie must keep local makeup when cloud is not newer');
  console.log('ok equal-version merge keeps local makeup on tie');
}

testStaleCloudDoesNotBeatLocalMakeupWhenLocalNewer();
testEqualVersionCloudTieKeepsLocalMakeup();
console.log('ok instructor save reset merge guards');
