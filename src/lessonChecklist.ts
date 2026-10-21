export type LessonContentBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'checkbox'; itemId: string; label: string; teacherChecked: boolean };

const CHECKBOX_LINE = /^-\s*\[([ xX])\]\s*(.*)$/;

export function parseLessonContent(note: string): LessonContentBlock[] {
  const blocks: LessonContentBlock[] = [];
  let itemIndex = 0;
  for (const line of note.split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    const checkbox = trimmed.match(CHECKBOX_LINE);
    if (checkbox) {
      blocks.push({
        type: 'checkbox',
        itemId: `item-${itemIndex++}`,
        label: checkbox[2].trim(),
        teacherChecked: checkbox[1].toLowerCase() === 'x',
      });
      continue;
    }
    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      blocks.push({ type: 'heading', level: 1, text: h1[1].trim() });
      continue;
    }
    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      blocks.push({ type: 'heading', level: 2, text: h2[1].trim() });
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      blocks.push({ type: 'heading', level: 3, text: h3[1].trim() });
      continue;
    }
    blocks.push({ type: 'paragraph', text: trimmed });
  }
  return blocks;
}

export function lessonChecklistItems(note: string) {
  return parseLessonContent(note).filter((b): b is LessonContentBlock & { type: 'checkbox' } => b.type === 'checkbox');
}

export function lessonChecklistProgress(note: string, checkedIds: string[] | undefined) {
  const items = lessonChecklistItems(note);
  const checked = new Set(checkedIds || []);
  const done = items.filter((item) => checked.has(item.itemId)).length;
  return { done, total: items.length };
}

export function normalizeChecklistChecked(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))].sort();
}

export function mergeChecklistChecked(
  preferred: string[] | undefined,
  fallback: string[] | undefined
): string[] {
  return [...new Set([...(preferred || []), ...(fallback || [])])].sort();
}

export function toggleChecklistChecked(checked: string[] | undefined, itemId: string, on: boolean): string[] {
  const set = new Set(checked || []);
  if (on) set.add(itemId);
  else set.delete(itemId);
  return [...set].sort();
}

export function checklistMarkdownLine(itemText = '') {
  const body = itemText.trim();
  return body ? `- [ ] ${body}` : '- [ ] ';
}

export const LESSON_CHECKLIST_BLOCK_TEMPLATE = `## 이번 회차 체크
- [ ] 연습 항목 1
- [ ] 연습 항목 2`;

export function appendChecklistLineToNote(note: string, itemText = '') {
  const line = checklistMarkdownLine(itemText);
  const base = note.replace(/\s+$/, '');
  if (!base) return `${line}\n`;
  return `${base}\n${line}\n`;
}

export function appendChecklistBlockTemplate(note: string) {
  const trimmed = note.trim();
  if (!trimmed) return `${LESSON_CHECKLIST_BLOCK_TEMPLATE}\n`;
  return `${trimmed.replace(/\s+$/, '')}\n\n${LESSON_CHECKLIST_BLOCK_TEMPLATE}\n`;
}
