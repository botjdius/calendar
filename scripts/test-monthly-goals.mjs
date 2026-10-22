import {
  applyRolloversToMonth,
  currentMonthKey,
  mergeMonthlyGoals,
  monthKeyFromIso,
  nextMonthKey,
  prepareMonthlyGoals,
  rollMonthForward,
  toggleMonthlyGoalItem,
} from '../src/monthlyGoals.ts';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(monthKeyFromIso('2026-10-22') === '2026-10', 'month key from iso');
assert(nextMonthKey('2026-12') === '2027-01', 'year rollover');

const sep = '2026-09';
const oct = '2026-10';
const store = {
  [sep]: [
    { id: 'a', text: '스케일', checked: false, createdMonth: sep },
    { id: 'b', text: '코드', checked: true, createdMonth: sep },
  ],
};
const rolled = rollMonthForward(store, sep, oct);
assert(rolled[sep].length === 1 && rolled[sep][0].id === 'b', 'checked stays in prev month');
assert(rolled[oct].length === 1 && rolled[oct][0].id === 'a', 'unchecked moves to next month');

const chain = applyRolloversToMonth(store, oct);
assert(chain[oct].some((item) => item.id === 'a'), 'chain rollover lands in target month');

const view = prepareMonthlyGoals(store, oct);
assert(view.changed, 'prepare detects rollover change');
assert(view.monthItems.some((item) => item.id === 'a'), 'prepare exposes month items');

const toggled = toggleMonthlyGoalItem(chain, oct, 'a', true);
assert(toggled[oct].find((item) => item.id === 'a')?.checked === true, 'toggle checked');

const merged = mergeMonthlyGoals(
  { '2026-10': [{ id: 'x', text: 'A', checked: false, createdMonth: '2026-10', updatedAt: 't1' }] },
  { '2026-10': [{ id: 'x', text: 'A', checked: true, createdMonth: '2026-10', updatedAt: 't2' }] },
  true
);
assert(merged['2026-10'][0].checked === true, 'merge prefers newer incoming');

assert(currentMonthKey('2026-10-01').length === 7, 'current month key shape');

console.log('ok monthly goals');
