import { mergeRequests } from '../server/cloud.mjs';
import { applyStudentWithdraw } from '../server/makeup.mjs';

const HUB = process.env.JYANG_HUB_URL || 'http://127.0.0.1:8787';
const STUDENT_UID = 'mtyk5hfn6yg8hr';
const INSTRUCTOR_UID = 'mtybfbnosk1x20';
const SESSION_ID = 'mtyjzvumfx8628';
const SLOT_ID = 'mtyqve6ur9nhus';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function testMergeKeepsLocalPending() {
  const local = [
    {
      id: 'new-pending',
      studentId: 's1',
      studentName: 'ㅂ',
      status: 'pending',
      intent: 'apply',
      createdAt: '2026-09-13T00:00:01.000Z',
      updatedAt: '2026-09-13T00:00:01.000Z',
    },
    {
      id: 'old-accepted',
      studentId: 's2',
      studentName: 'ㅈ',
      status: 'accepted',
      createdAt: '2026-09-12T18:55:54.217Z',
    },
  ];
  const stale = [
    {
      id: 'old-accepted',
      studentId: 's2',
      studentName: 'ㅈ',
      status: 'accepted',
      createdAt: '2026-09-12T18:55:54.217Z',
    },
  ];
  const merged = mergeRequests(local, stale);
  assert(
    merged.some((r) => r.id === 'new-pending' && r.status === 'pending'),
    'stale snapshot must keep the new pending request'
  );
  const wiped = mergeRequests([], stale);
  assert(
    !wiped.some((r) => r.id === 'new-pending'),
    'empty local + stale incoming loses the new request (this is the bug we guard in applyShared)'
  );
  const guarded = mergeRequests(local, []);
  assert(
    guarded.some((r) => r.id === 'new-pending'),
    'empty incoming must not erase local pending'
  );
  console.log('ok merge keeps local pending');
}

async function auth(action, extra = {}) {
  const res = await fetch(`${HUB}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `${action} failed`);
  return body;
}

function pendingOf(view, studentName) {
  return (view.requests || []).filter((r) => r.status === 'pending' && (!studentName || r.studentName === studentName));
}

async function testLiveHubRoundtrip() {
  const health = await fetch(`${HUB}/health`).then((r) => r.json());
  assert(health.ok, 'hub health');

  const created = await auth('request-makeup', {
    uid: STUDENT_UID,
    slotId: SLOT_ID,
    sessionId: SESSION_ID,
  });
  const studentPending = pendingOf(created.view, 'ㅂ');
  assert(studentPending.length >= 1, `student view missing pending: ${JSON.stringify(created.view.requests)}`);

  const instructor = await fetch(`${HUB}/view?uid=${INSTRUCTOR_UID}`).then((r) => r.json());
  const instructorPending = pendingOf(instructor, 'ㅂ');
  assert(
    instructorPending.some((r) => r.sessionId === SESSION_ID && r.slotId === SLOT_ID),
    `instructor view missing pending: ${JSON.stringify(instructor.requests)}`
  );

  await new Promise((resolve) => setTimeout(resolve, 4500));
  const later = await fetch(`${HUB}/view?uid=${INSTRUCTOR_UID}`).then((r) => r.json());
  assert(
    pendingOf(later, 'ㅂ').some((r) => r.sessionId === SESSION_ID && r.slotId === SLOT_ID),
    'pending disappeared from instructor view after poll window'
  );

  const req = instructorPending.find((r) => r.sessionId === SESSION_ID && r.slotId === SLOT_ID);
  await auth('withdraw-makeup', { uid: STUDENT_UID, requestId: req.id });
  const after = await fetch(`${HUB}/view?uid=${INSTRUCTOR_UID}`).then((r) => r.json());
  assert(
    !pendingOf(after, 'ㅂ').some((r) => r.id === req.id),
    'withdraw did not clear the test pending request'
  );
  applyStudentWithdraw(req);
  console.log('ok live hub request stays on instructor, then withdraws');
}

testMergeKeepsLocalPending();
await testLiveHubRoundtrip();
console.log('ok makeup sync');
