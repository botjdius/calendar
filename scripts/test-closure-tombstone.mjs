import { mergeClosures, mergeRemovedClosureIds, mergeStudio } from '../server/cloud.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const c1 = {
  id: 'closure-old',
  date: '2026-11-01',
  endDate: '2026-11-01',
  time: '',
  reason: 'test',
  scope: 'all',
};

const staleOlder = {
  version: 1,
  students: [],
  accounts: [],
  closures: [c1],
  removedClosureIds: [],
  openSlots: [],
  requests: [],
  announcements: [],
  feedback: [],
  removedFeedback: [],
  removedRequests: [],
  removedOpenSlots: [],
  removedStudents: [],
};

const newerDelete = {
  version: 2,
  students: [],
  accounts: [],
  closures: [],
  removedClosureIds: ['closure-old'],
  openSlots: [],
  requests: [],
  announcements: [],
  feedback: [],
  removedFeedback: [],
  removedRequests: [],
  removedOpenSlots: [],
  removedStudents: [],
};

const merged = mergeStudio(staleOlder, newerDelete);
assert(merged.closures.length === 0, 'tomstoned id must drop from merged closures');
assert(merged.removedClosureIds.includes('closure-old'), 'tombstone list must persist');

const revived = mergeStudio(merged, { ...staleOlder, version: 3 });
assert(!revived.closures.some((c) => c.id === 'closure-old'), 'stale snapshot cannot resurrect a tombstoned closure');

const list = mergeClosures([c1], [], false, mergeRemovedClosureIds([], ['closure-old']));
assert(list.length === 0, 'mergeClosures must filter tombstoned ids');

console.log('ok closure tombstones block resurrection across merges');
