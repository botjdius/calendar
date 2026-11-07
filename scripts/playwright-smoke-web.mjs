import { chromium } from 'playwright';

const SITE = process.env.SITE_URL || 'https://jyangjyang.surge.sh';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(SITE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  const body = await page.locator('body').innerText();
  if (!body.includes('쟝쟝') && !body.includes('레슨') && !body.includes('가입')) {
    throw new Error(`unexpected landing text: ${body.slice(0, 200)}`);
  }

  // Auth screen (logged out)
  const hasRole =
    body.includes('레슨생') || body.includes('강사') || body.includes('이름') || body.includes('가입');
  if (!hasRole) throw new Error('auth/landing UI not detected');

  // Student checklist route loads app shell (may redirect to auth if logged out)
  await page.goto(`${SITE}/lesson-checklist`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const studentBody = await page.locator('body').innerText();
  const studentOk =
    studentBody.includes('레슨') ||
    studentBody.includes('숙제') ||
    studentBody.includes('체크') ||
    studentBody.includes('가입') ||
    studentBody.includes('이름');
  if (!studentOk) throw new Error(`lesson-checklist route failed: ${studentBody.slice(0, 200)}`);

  console.log('ok playwright smoke auth + lesson-checklist route');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
