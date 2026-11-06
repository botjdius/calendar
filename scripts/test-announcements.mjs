import { announcementsForStudent, announcementsForInstructor, mergeAnnouncements, mergeStudio } from '../server/cloud.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const first = {
  id: 'notice-1',
  title: '전체 공지',
  body: '모두 확인',
  studentIds: ['student-a', 'student-b'],
  createdAt: '2026-09-30T12:00:00.000Z',
  expiresOn: '2026-10-02',
};
const second = {
  id: 'notice-2',
  title: '개별 공지',
  body: '한 명만 확인',
  studentIds: ['student-b'],
  createdAt: '2026-09-30T13:00:00.000Z',
  expiresOn: '2026-09-30',
};

const forA = announcementsForStudent([first, second], 'student-a');
const forB = announcementsForStudent([first, second], 'student-b');
assert(forA.length === 1 && forA[0].id === first.id, 'student A sees only notices addressed to A');
assert(forB.length === 2, 'student B sees all notices addressed to B');
assert(
  announcementsForStudent([first, second], 'student-b', '2026-10-01').map((item) => item.id).join(',') === first.id,
  'an announcement disappears after its display end date'
);
assert(
  announcementsForStudent(
    [{ ...second, expiresOn: undefined }],
    'student-b',
    '2026-10-01'
  ).length === 0,
  'older announcements without an end date expire on the sent date'
);

const base = {
  version: 1,
  students: [
    { id: 'student-a', sessions: [] },
    { id: 'student-b', sessions: [] },
  ],
  accounts: [],
  closures: [],
  openSlots: [],
  requests: [],
  announcements: [first],
  feedback: [],
  removedStudents: [],
};
const merged = mergeStudio(base, { ...base, version: 2, announcements: [second] });
assert(merged.announcements.length === 2, 'a later sync keeps earlier announcements');
assert(merged.announcements.some((item) => item.id === first.id), 'earlier announcement survives');
assert(merged.announcements.some((item) => item.id === second.id), 'new announcement is added');

const deleted = { ...first, deletedAt: '2026-09-30T14:00:00.000Z' };
const staleMerge = mergeAnnouncements([deleted], [first], true);
assert(staleMerge[0].deletedAt === deleted.deletedAt, 'a stale device cannot restore a deleted announcement');
assert(
  announcementsForStudent(staleMerge, 'student-a', '2026-09-30').length === 0,
  'deleted announcement immediately disappears from the student app'
);

assert(
  announcementsForInstructor([first, second], '2026-10-01').map((item) => item.id).join(',') === first.id,
  'instructor sees the same date window as students (expired notices hidden)'
);

const closureId = 'closure-x';
const holidayTop = {
  id: 'holiday-notice-1',
  title: '휴강 일정',
  body: '9/16(화) 종일 · 시험 레슨·보강이 휴강입니다.',
  studentIds: ['student-a'],
  createdAt: '2026-09-15T10:00:00.000Z',
  expiresOn: '2026-09-16',
  linkedClosureId: closureId,
};
assert(
  announcementsForStudent([holidayTop], 'student-a', '2026-09-15').length === 1,
  'linked 휴강 공지 shows before expiry'
);
const retiredHoliday = { ...holidayTop, deletedAt: '2026-09-15T11:00:00.000Z' };
const afterDelete = mergeAnnouncements([holidayTop], [retiredHoliday], true);
assert(
  announcementsForStudent(afterDelete, 'student-a', '2026-09-15').length === 0,
  'soft-delete removes linked 휴강 공지 when closure is removed'
);

console.log('ok announcements persist and filter by recipient');
