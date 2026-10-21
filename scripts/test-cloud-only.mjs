import { fetchCloud, mergeRequests, mergeStudents, pushCloud } from '../server/cloud.mjs';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function testMergeStudentsKeepsBothNotes() {
  const current = [
    {
      id: 's1',
      name: 'ㅂ',
      sessions: [{ id: 'x', note: '강사메모', studentNote: '', status: 'pending', attachments: [] }],
    },
  ];
  const incoming = [
    {
      id: 's1',
      name: 'ㅂ',
      sessions: [
        {
          id: 'x',
          note: '',
          studentNote: '레슨생메모',
          status: 'absent',
          attachments: [],
          updatedAt: '2026-09-15T10:00:00.000Z',
        },
      ],
    },
  ];
  const merged = mergeStudents(current, incoming, false);
  const session = merged[0].sessions[0];
  assert(session.note === '강사메모', 'instructor note must survive a student write');
  assert(session.studentNote === '레슨생메모', 'student note must survive an older instructor snapshot');
  assert(session.status === 'absent', 'newer session stamp must win status');
  console.log('ok merge students keeps notes and newer status');
}

function testMergeStudentsKeepsChecklist() {
  const current = [
    {
      id: 's1',
      name: 'ㅂ',
      sessions: [
        {
          id: 'x',
          note: '- [ ] A',
          studentNote: '',
          checklistChecked: ['item-0'],
          status: 'pending',
          attachments: [],
        },
      ],
    },
  ];
  const incoming = [
    {
      id: 's1',
      name: 'ㅂ',
      sessions: [
        {
          id: 'x',
          note: '- [ ] A\n- [ ] B',
          studentNote: '',
          checklistChecked: ['item-1'],
          status: 'pending',
          attachments: [],
          updatedAt: '2026-09-15T10:00:00.000Z',
        },
      ],
    },
  ];
  const merged = mergeStudents(current, incoming, false);
  const session = merged[0].sessions[0];
  assert(session.note.includes('B'), 'instructor note merge keeps newer text');
  assert(session.checklistChecked.includes('item-0') && session.checklistChecked.includes('item-1'), 'checklist merges');
  console.log('ok merge students keeps checklist');
}

function testAttachmentAddAndDelete() {
  const base = [
    {
      id: 's1',
      name: 'ㅂ',
      sessions: [{ id: 'x', note: '', studentNote: '', status: 'pending', attachments: [] }],
    },
  ];
  const added = mergeStudents(
    base,
    [
      {
        id: 's1',
        name: 'ㅂ',
        sessions: [
          {
            id: 'x',
            note: '',
            studentNote: '',
            status: 'pending',
            attachments: [{ id: 'f1', name: '악보.pdf', uri: 'data:application/pdf;base64,YQ==' }],
            updatedAt: '2026-09-17T03:00:00.000Z',
          },
        ],
      },
    ],
    true
  );
  assert(added[0].sessions[0].attachments.length === 1, 'newer session keeps added attachment');
  assert(added[0].sessions[0].attachments[0].id === 'f1', 'added attachment id is kept');
  const removed = mergeStudents(
    added,
    [
      {
        id: 's1',
        name: 'ㅂ',
        sessions: [
          {
            id: 'x',
            note: '',
            studentNote: '',
            status: 'pending',
            attachments: [],
            updatedAt: '2026-09-17T03:01:00.000Z',
          },
        ],
      },
    ],
    true
  );
  assert(removed[0].sessions[0].attachments.length === 0, 'newer session delete must drop attachment');

  const localHasFile = mergeStudents(
    [
      {
        id: 's1',
        name: 'ㅂ',
        sessions: [
          {
            id: 'x',
            note: '',
            studentNote: '',
            status: 'pending',
            attachments: [{ id: 'f1', name: '악보.pdf', uri: 'rentryfile:abc' }],
            updatedAt: '2026-09-17T04:00:00.000Z',
          },
        ],
      },
    ],
    [
      {
        id: 's1',
        name: 'ㅂ',
        sessions: [{ id: 'x', note: '', studentNote: '', status: 'pending', attachments: [] }],
      },
    ],
    false
  );
  assert(localHasFile[0].sessions[0].attachments.length === 1, 'student login must keep newer local attachment');

  const studentKeepsStaleFile = mergeStudents(
    [
      {
        id: 's1',
        name: 'ㅂ',
        sessions: [
          {
            id: 'x',
            note: '',
            studentNote: '메모',
            status: 'pending',
            attachments: [{ id: 'f1', name: '악보.pdf', uri: 'rentryfile:abc' }],
            updatedAt: '2026-09-17T05:00:00.000Z',
          },
        ],
      },
    ],
    [
      {
        id: 's1',
        name: 'ㅂ',
        sessions: [
          {
            id: 'x',
            note: '',
            studentNote: '',
            status: 'pending',
            attachments: [],
            removedAttachmentIds: ['f1'],
            updatedAt: '2026-09-17T04:50:00.000Z',
          },
        ],
      },
    ],
    false
  );
  assert(
    studentKeepsStaleFile[0].sessions[0].attachments.length === 0,
    'instructor delete tombstone must drop student-local file even if student session stamp is newer'
  );
  assert(
    (studentKeepsStaleFile[0].sessions[0].removedAttachmentIds || []).includes('f1'),
    'delete tombstone must survive a newer student write'
  );
  console.log('ok merge students add and delete attachments');
}

function testMergeRequestsKeepsPending() {
  const merged = mergeRequests(
    [{ id: 'a', status: 'pending', createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z' }],
    []
  );
  assert(merged.some((item) => item.id === 'a' && item.status === 'pending'), 'empty incoming must keep pending');
  console.log('ok merge requests keeps pending');
}

async function rentryRoundtrip() {
  const before = await fetchCloud();
  assert(before && Array.isArray(before.students) && before.students.length, 'cloud has students without hub');
  const joinCodes = (before.students || []).map((s) => s.joinCode).filter(Boolean);
  assert(joinCodes.length, 'students have join codes for hub-off login');
  const instructor = (before.accounts || []).find((a) => a.role === 'instructor');
  assert(instructor?.passwordHash, 'instructor hash is on the public cloud');

  const marker = `cloud-only-${Date.now()}`;
  const item = {
    id: marker,
    studentId: before.students[0].id,
    studentName: before.students[0].name,
    sessionId: 'test-session',
    slotId: 'test-slot',
    date: '2099-01-01',
    time: '19:00',
    status: 'pending',
    intent: 'apply',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const pushed = await pushCloud({
    ...before,
    version: (before.version || 0) + 1,
    requests: [item, ...(before.requests || [])],
  });
  assert(pushed, 'rentry write must succeed without hub or extendsclass PUT');

  const after = await fetchCloud();
  assert(
    (after.requests || []).some((req) => req.id === marker && req.status === 'pending'),
    'instructor cloud fetch must see the student request'
  );

  const cleaned = await pushCloud({
    ...after,
    version: (after.version || 0) + 1,
    requests: (after.requests || []).map((req) =>
      req.id === marker
        ? { ...req, status: 'withdrawn', intent: 'withdraw', updatedAt: new Date().toISOString() }
        : req
    ),
  });
  assert(cleaned, 'cleanup write must succeed');
  const done = await fetchCloud();
  const leftover = (done.requests || []).find((req) => req.id === marker);
  assert(!leftover || leftover.status === 'withdrawn', 'test request withdrawn');
  console.log('ok rentry makeup roundtrip', `students=${before.students.length}`, `version=${done.version}`);
}

testMergeStudentsKeepsBothNotes();
testMergeStudentsKeepsChecklist();
testAttachmentAddAndDelete();
testMergeRequestsKeepsPending();
await rentryRoundtrip();
console.log('ok cloud-only without hub');
