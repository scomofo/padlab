import('playwright').then(async ({chromium}) => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--autoplay-policy=no-user-gesture-required'] });

  // Desktop gameplay
  let page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://127.0.0.1:8091/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Start 3 rounds/ }).click({ timeout: 8000 });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: 'docs/validation/gameplay-desktop.png' });
  await page.close();

  // Mobile gameplay
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:8091/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/validation/gameplay-mobile.png' });
  await page.close();

  // 16-pad jam studio desktop
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://127.0.0.1:8091/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const jamBtn = page.getByRole('button', { name: /jam/i });
  if (await jamBtn.count() > 0) {
    await jamBtn.first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/validation/gameplay-16-pads.png' });
  }
  await page.close();

  // 16-pad mobile
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:8091/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const jamBtn2 = page.getByRole('button', { name: /jam/i });
  if (await jamBtn2.count() > 0) {
    await jamBtn2.first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/validation/gameplay-16-pads-mobile.png' });
  }
  await page.close();

  await browser.close();
  console.log('screenshots refreshed');
}).catch(e => { console.error('FAIL:', e.message.split('\n')[0]); process.exit(1); });
