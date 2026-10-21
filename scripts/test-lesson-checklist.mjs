import {
  lessonChecklistProgress,
  mergeChecklistChecked,
  parseLessonContent,
  toggleChecklistChecked,
} from '../src/lessonChecklist.ts';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const note = `# 이번 주\n- [ ] C 메이저 코드\n- [x] 스케일\n일반 메모`;
const blocks = parseLessonContent(note);
assert(blocks.length === 4, 'expected heading + 2 checkboxes + paragraph');
assert(blocks[1].type === 'checkbox' && blocks[1].itemId === 'item-0', 'first checkbox id');
assert(blocks[2].type === 'checkbox' && blocks[2].teacherChecked === true, 'teacher x in note');
const progress = lessonChecklistProgress(note, ['item-0']);
assert(progress.done === 1 && progress.total === 2, 'progress counts student checks only');
assert(mergeChecklistChecked(['item-0'], ['item-1']).join() === 'item-0,item-1', 'merge unions checks');
assert(toggleChecklistChecked(['item-0'], 'item-0', false).length === 0, 'toggle off');
console.log('ok lesson checklist');
