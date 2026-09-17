import {
  applyRemoveStudent,
  captureRosterContextMenu,
  requestsForLiveStudents,
  rosterDeletePrompt,
} from '../server/studentRoster.mjs';
import { isStudentRemoved, mergeRequests } from '../server/cloud.mjs';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function testRightClickOpensDeleteWindow() {
  let prevented = false;
  let stopped = false;
  captureRosterContextMenu({
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
  });
  assert(prevented, 'right-click must not open the browser menu');
  assert(stopped, 'right-click must stay on the roster row');
  const prompt = rosterDeletePrompt({ id: 'st-j', name: 'ㅈ' });
  assert(prompt.title === '레슨생 삭제', 'delete window title');
  assert(prompt.confirmLabel === '삭제', 'delete window confirm label');
  assert(prompt.studentId === 'st-j', 'delete window keeps the selected student');
  assert(prompt.message.includes('ㅈ'), 'delete window names the student');
  console.log('ok right-click opens delete window');
}

function testSettingsRosterDeleteFlow() {
  const roster = [
    { id: 'keep', name: 'ㅂ', joinCode: 'KEEP01', linkedUid: 'u2', weekday: 3, time: '14:00', sessions: [] },
    { id: 'gone', name: 'ㅈ', joinCode: 'GONE01', linkedUid: 'u1', weekday: 1, time: '10:00', sessions: [] },
  ];
  let askDelete = null;
  const event = {
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    prevented: false,
    stopped: false,
  };
  captureRosterContextMenu(event);
  askDelete = roster.find((s) => s.name === 'ㅈ');
  const prompt = rosterDeletePrompt(askDelete);
  assert(event.prevented && event.stopped, 'settings roster right-click is captured');
  assert(prompt.title === '레슨생 삭제', 'settings shows the delete window');
  const next = applyRemoveStudent(
    {
      students: roster,
      accounts: [
        { uid: 'u2', name: 'ㅂ', role: 'student', studentId: 'keep' },
        { uid: 'u1', name: 'ㅈ', role: 'student', studentId: 'gone' },
      ],
      requests: [{ id: 'r-gone', studentId: 'gone', status: 'pending' }],
      closures: [],
      removedStudents: [],
    },
    askDelete.id,
    '2026-09-16T12:00:00.000Z'
  );
  assert(!next.students.some((s) => s.id === 'gone'), 'confirming delete removes the student from settings');
  assert(next.students.some((s) => s.id === 'keep'), 'other students remain in settings');
  console.log('ok settings roster right-click delete flow');
}

function testRemoveKeepsOtherStudentsAndHidesDeleted() {
  const state = {
    students: [
      { id: 'keep', name: 'ㅂ', joinCode: 'KEEP01', linkedUid: 'u2', weekday: 3, time: '14:00', sessions: [] },
      { id: 'gone', name: 'ㅈ', joinCode: 'GONE01', linkedUid: 'u1', weekday: 1, time: '10:00', sessions: [] },
    ],
    accounts: [
      { uid: 'u2', name: 'ㅂ', role: 'student', studentId: 'keep' },
      { uid: 'u1', name: 'ㅈ', role: 'student', studentId: 'gone' },
    ],
    requests: [
      { id: 'r-keep', studentId: 'keep', status: 'pending' },
      { id: 'r-gone', studentId: 'gone', status: 'pending' },
    ],
    closures: [
      { id: 'c-all', date: '2026-09-20', scope: 'all' },
      { id: 'c-gone', date: '2026-09-21', scope: 'student', studentId: 'gone' },
    ],
    removedStudents: [],
  };
  const next = applyRemoveStudent(state, 'gone', '2026-09-16T09:00:00.000Z');
  assert(next.students.some((s) => s.id === 'keep'), 'other student remains on the roster');
  assert(!next.students.some((s) => s.id === 'gone'), 'deleted student leaves the roster');
  assert(!next.accounts.some((a) => a.studentId === 'gone'), 'deleted student account is removed');
  assert(!next.requests.some((r) => r.studentId === 'gone'), 'deleted student makeup requests are removed');
  assert(next.requests.some((r) => r.studentId === 'keep'), 'other makeup requests stay');
  assert(!next.closures.some((c) => c.studentId === 'gone'), 'deleted student closures are removed');
  assert(next.closures.some((c) => c.id === 'c-all'), 'studio closures stay');
  assert(isStudentRemoved(next.removedStudents, { id: 'gone', uid: 'u1', joinCode: 'GONE01' }), 'tombstone recorded');
  console.log('ok delete drops only the selected student');
}

function testMergedRequestsDoNotBringDeletedStudentBack() {
  const local = [{ id: 'r-gone', studentId: 'gone', status: 'pending', createdAt: '2026-09-16T01:00:00.000Z' }];
  const incoming = [{ id: 'r-keep', studentId: 'keep', status: 'pending', createdAt: '2026-09-16T02:00:00.000Z' }];
  const merged = mergeRequests(local, incoming);
  assert(merged.some((r) => r.studentId === 'gone'), 'plain merge would keep the deleted request');
  const cleaned = requestsForLiveStudents(merged, [{ id: 'keep' }]);
  assert(!cleaned.some((r) => r.studentId === 'gone'), 'live-student filter hides deleted requests');
  assert(cleaned.some((r) => r.studentId === 'keep'), 'live-student filter keeps remaining requests');
  console.log('ok deleted-student requests cannot return after roster delete');
}

testRightClickOpensDeleteWindow();
testSettingsRosterDeleteFlow();
testRemoveKeepsOtherStudentsAndHidesDeleted();
testMergedRequestsDoNotBringDeletedStudentBack();
console.log('ok roster delete');
