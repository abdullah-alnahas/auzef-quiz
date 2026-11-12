import { chromium } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('https://lolonolo.com/auzef/ilkokula-hazirlik/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i=0;i<20;i++) {
  const btn = p.getByText('I am human', { exact: false });
  if (await btn.count()) { try { await btn.first().click(); } catch {} }
  await p.waitForTimeout(1500);
  const html = await p.content().catch(()=> '');
  if (!html.includes('HASHCASH_CONFIG') && !html.includes('Checking your browser')) break;
}
console.log('title', await p.title());
console.log('tables', await p.locator('table').count());
console.log('links 2022-23', await p.locator('a', { hasText: '2022-23 Vize' }).count());
console.log('vize links', (await p.locator('a', { hasText: 'Vize' }).allTextContents()).slice(0,20));
await p.screenshot({ path: '/tmp/course-live.png', fullPage: true });
await b.close();
