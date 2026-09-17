import assert from 'node:assert/strict';
import { mergeFeedback, mergeStudio, sanitizeFeedback } from '../server/cloud.mjs';

const stripped = sanitizeFeedback({
  id: 'f1',
  body: '  레슨이 너무 빨라요\n한 번만 천천히  ',
  studentId: 's1',
  studentName: 'ㅂ',
  uid: 'u1',
  joinCode: 'C6FYJT',
  extra: 'nope',
});
assert.deepEqual(stripped, {
  id: 'f1',
  body: '레슨이 너무 빨라요\n한 번만 천천히',
  createdAt: '',
});
assert.equal(Object.keys(stripped).sort().join(','), 'body,createdAt,id');
assert.equal(sanitizeFeedback({ id: 'x', body: '   ' }), null);
assert.equal(sanitizeFeedback({ body: 'hello' }), null);

const merged = mergeFeedback(
  [{ id: 'old', body: '예전', createdAt: '2026-09-10T00:00:00.000Z' }],
  [
    { id: 'new', body: '오늘', createdAt: '2026-09-16T12:00:00.000Z' },
    { id: 'old', body: '예전', createdAt: '2026-09-10T00:00:00.000Z', studentName: 'ㅈ' },
  ]
);
assert.deepEqual(merged.map((item) => item.id), ['new', 'old']);
assert.equal(Object.keys(merged[0]).sort().join(','), 'body,createdAt,id');

const studio = mergeStudio(
  {
    version: 1,
    students: [{ id: 's1', name: 'ㅂ', joinCode: 'ABC123', linkedUid: 'u1', sessions: [] }],
    closures: [],
    openSlots: [],
    requests: [],
    feedback: [{ id: 'keep', body: '익명 유지', createdAt: '2026-09-15T00:00:00.000Z' }],
    accounts: [],
    bank: { bankName: '', accountNumber: '', accountHolder: '' },
    removedStudents: [],
  },
  {
    version: 2,
    students: [],
    closures: [],
    openSlots: [],
    requests: [],
    feedback: [{ id: 'later', body: '새 글', createdAt: '2026-09-16T00:00:00.000Z' }],
    accounts: [],
    bank: { bankName: '', accountNumber: '', accountHolder: '' },
    removedStudents: [{ id: 's1', linkedUid: 'u1', removedAt: '2026-09-16T00:00:00.000Z' }],
  }
);
assert.equal(studio.students.length, 0);
assert.deepEqual(studio.feedback.map((item) => item.id), ['later', 'keep']);
assert.ok(!studio.feedback.some((item) => 'studentId' in item || 'studentName' in item));

const afterDelete = mergeStudio(studio, {
  version: 3,
  students: [],
  closures: [],
  openSlots: [],
  requests: [],
  feedback: [{ id: 'later', body: '새 글', createdAt: '2026-09-16T00:00:00.000Z' }],
  accounts: [],
  bank: { bankName: '', accountNumber: '', accountHolder: '' },
  removedStudents: [{ id: 's1', linkedUid: 'u1', removedAt: '2026-09-16T00:00:00.000Z' }],
  removedFeedback: ['keep'],
});
assert.deepEqual(afterDelete.feedback.map((item) => item.id), ['later']);
assert.ok(afterDelete.removedFeedback.includes('keep'));

console.log('ok anonymous feedback merge keeps notes without identity');
