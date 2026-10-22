import {
  appendChecklistBlockTemplate,
  appendChecklistLineToNote,
  checklistMarkdownLine,
  lessonChecklistProgress,
  lessonReadingBlocks,
  mergeChecklistChecked,
  mergeCloudAndLocalChecklist,
  mergeSessionChecklistChecked,
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
assert(toggleChecklistChecked(['item-0', 'item-1'], 'item-0', false).join() === 'item-1', 'toggle off one of many');
assert(
  mergeCloudAndLocalChecklist(['item-0'], null).join() === 'item-0',
  'no local overlay uses cloud'
);
assert(mergeCloudAndLocalChecklist(['item-0'], []).length === 0, 'local overlay can uncheck all');
assert(
  mergeCloudAndLocalChecklist(['item-0', 'item-1'], ['item-1']).join() === 'item-1',
  'local overlay replaces cloud for uncheck'
);
assert(
  mergeSessionChecklistChecked(['item-1'], ['item-0', 'item-1']).join() === 'item-1',
  'session merge prefers newer checklist'
);
assert(
  mergeSessionChecklistChecked([], ['item-0']).length === 0,
  'session merge newer empty unchecks'
);
assert(checklistMarkdownLine('A') === '- [ ] A', 'markdown line');
assert(appendChecklistLineToNote('hello', 'B').endsWith('- [ ] B\n'), 'append line');
assert(appendChecklistBlockTemplate('').includes('연습 항목 1'), 'template');
const mixed = '# Goal\n- [ ] A\nplain';
const reading = lessonReadingBlocks(mixed);
assert(reading.length === 2 && reading.every((b) => b.type !== 'checkbox'), 'reading strips checkboxes');
assert(lessonReadingBlocks('only text').length === 1, 'plain note stays reading');
const emptyBox = parseLessonContent('- [ ] ');
assert(emptyBox.length === 1 && emptyBox[0].type === 'checkbox', 'empty checkbox line parses');
console.log('ok lesson checklist');
