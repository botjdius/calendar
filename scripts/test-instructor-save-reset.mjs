import { mergeStudents } from '../server/cloud.mjs';
import { normalizeMonthlyGoalsStore, prepareMonthlyGoals } from '../src/monthlyGoals.ts';

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

/** Mirrors hub poll: only apply hub student bodies when hub version is ahead of local. */
function hubPollStudentRefresh({ localVersion, dataVersionRef, hubVersion, incomplete }) {
  const localVer = Math.max(localVersion || 0, dataVersionRef || 0);
  const hubAhead = !incomplete && hubVersion > localVer;
  const hubBehind = !incomplete && hubVersion < localVer;
  return { hubAhead, hubBehind, localVer };
}

function testStaleHubMustNotRefreshStudents() {
  const { hubAhead, hubBehind } = hubPollStudentRefresh({
    localVersion: 12,
    dataVersionRef: 12,
    hubVersion: 9,
    incomplete: false,
  });
  assert(hubBehind, 'stale hub must be detected as behind local');
  assert(!hubAhead, 'stale hub must not count as ahead');
  console.log('ok stale hub does not trigger student refresh');
}

function testHubAheadRefreshesStudents() {
  const { hubAhead, hubBehind } = hubPollStudentRefresh({
    localVersion: 5,
    dataVersionRef: 5,
    hubVersion: 8,
    incomplete: false,
  });
  assert(hubAhead, 'newer hub must refresh students');
  assert(!hubBehind, 'newer hub is not behind');
  console.log('ok hub ahead triggers student refresh');
}

/** Mirrors applyCloudIfNewer keep-local guard when cloud.version < localVer. */
function keepLocalStudentsOnPoll({ cloudVersion, localVersion, dataVersionRef, dirty }) {
  const localVer = Math.max(localVersion || 0, dataVersionRef || 0);
  return dirty || (cloudVersion || 0) < localVer;
}

function simulatePollCycles(cycles, save) {
  let local = { ...save, dirty: true };
  const dataVersionRef = save.version;
  const staleCloudStudents = [
    {
      ...save.students[0],
      sessions: [{ ...save.students[0].sessions[0], makeup: null, updatedAt: '2026-10-01T11:00:00.000Z' }],
    },
  ];
  for (let i = 0; i < cycles; i += 1) {
    const cloudVersion = i < 2 ? save.version - 1 : save.version;
    const keepLocal = keepLocalStudentsOnPoll({
      cloudVersion,
      localVersion: local.version,
      dataVersionRef,
      dirty: local.dirty,
    });
    if (keepLocal) {
      if (local.dirty && cloudVersion >= save.version) {
        local = { ...local, dirty: false };
      }
      continue;
    }
    const merged = mergeStudents(save.students, staleCloudStudents, false)[0];
    assert(
      merged.sessions[0].makeup?.date === save.students[0].sessions[0].makeup?.date,
      'makeup must survive after cloud version ack with stale body'
    );
  }
  console.log(`ok single save survives ${cycles} poll cycles`);
}

function testSingleSaveSurvivesPollCycles() {
  const save = {
    version: 20,
    students: [
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
    ],
  };
  simulatePollCycles(5, save);
}

function testMonthlyGoalsRolloverStableAfterPersist() {
  const store = {
    '2026-09': [{ id: 'a', text: '스케일', checked: false, createdMonth: '2026-09' }],
  };
  const view = prepareMonthlyGoals(store, '2026-10');
  assert(view.changed, 'rollover should be pending before persist');
  const packed = normalizeMonthlyGoalsStore(view.store);
  const after = prepareMonthlyGoals(packed, '2026-10');
  assert(!after.changed, 'persisted rollover must not re-trigger save effect');
  console.log('ok monthly goals rollover stable after persist');
}

testStaleCloudDoesNotBeatLocalMakeupWhenLocalNewer();
testEqualVersionCloudTieKeepsLocalMakeup();
testStaleHubMustNotRefreshStudents();
testHubAheadRefreshesStudents();
testSingleSaveSurvivesPollCycles();
testMonthlyGoalsRolloverStableAfterPersist();
console.log('ok instructor save reset merge guards');
