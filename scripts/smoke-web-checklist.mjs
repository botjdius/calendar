/**
 * Smoke test: deployed web bundle includes checklist UI modules.
 * Run: node scripts/smoke-web-checklist.mjs [baseUrl]
 */
const SITE = (process.argv[2] || 'https://jyangjyang.surge.sh').replace(/\/$/, '');

async function main() {
  const indexRes = await fetch(`${SITE}/`);
  if (!indexRes.ok) throw new Error(`index ${indexRes.status}`);
  const html = await indexRes.text();
  const entry = html.match(/entry-[a-f0-9]+\.js/)?.[0];
  if (!entry) throw new Error('no entry bundle in index.html');

  const jsRes = await fetch(`${SITE}/_expo/static/js/web/${entry}`);
  if (!jsRes.ok) throw new Error(`bundle ${jsRes.status}`);
  const js = await jsRes.text();

  const required = [
    'LessonNoteChecklist',
    'LessonHomeworkChecklist',
    'lesson-checklist',
    'lessonChecklist',
    'setChecklistItem',
  ];
  const missing = required.filter((s) => !js.includes(s));
  if (missing.length) throw new Error(`bundle missing: ${missing.join(', ')}`);

  const manifestRes = await fetch(`${SITE}/manifest.json`);
  if (!manifestRes.ok) throw new Error(`manifest ${manifestRes.status}`);
  const manifest = await manifestRes.json();
  if (manifest.short_name !== '쟝쟝') throw new Error('unexpected manifest');

  console.log(`ok smoke ${SITE} entry=${entry}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
