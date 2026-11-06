import { applyAllHolidays } from '../server/lib.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const closure = {
  id: 'c1',
  date: '2026-10-15',
  endDate: '2026-10-15',
  time: '14:00',
  reason: '학교 행사',
  scope: 'all',
};

const withHold = {
  id: 's1',
  name: '테스트',
  weekday: 3,
  time: '14:00',
  sessions: [
    {
      id: 'holiday:2026-10-15:14:00',
      cycle: 2,
      pack: 0,
      status: 'cancelled',
      date: '2026-10-15',
      time: '14:00',
      makeup: null,
      note: '',
      studentNote: '',
      attachments: [],
    },
    {
      id: 'lesson-1',
      cycle: 2,
      pack: 0,
      status: 'pending',
      date: '2026-10-22',
      time: '14:00',
      makeup: null,
      note: '',
      studentNote: '',
      attachments: [],
    },
  ],
};

const afterRemove = applyAllHolidays([withHold], []);
assert(
  !afterRemove[0].sessions.some((s) => String(s.id || '').startsWith('holiday:')),
  'removing all public closures must drop synthetic holiday holds from sessions'
);

console.log('ok closure remove clears synthetic holiday holds from student sessions');
