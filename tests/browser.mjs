import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const extension = path.join(root, 'extension');
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stash-extension-test-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: true, channel: 'chromium',
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
  viewport: { width: 1440, height: 1050 },
  acceptDownloads: true
});
const errors = [], checks = [];
const record = message => { checks.push(message); console.log('PASS ' + message); };
try {
  let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  const page = await context.newPage();
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const base = 'chrome-extension://' + id + '/index.html';
  await page.goto(base);
  await page.getByRole('button', { name: 'Explore a sample library' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 18);
  await page.screenshot({ path: path.join(artifacts, 'stash-desktop.png') });
  // Verify the user's large-monitor reading controls in the actual extension.
  await page.setViewportSize({ width: 2560, height: 1440 });
  const baseTextSize = await page.locator('.post-excerpt').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  const baseButtonSize = await page.locator('#sync-btn').evaluate(el => el.getBoundingClientRect().height);
  await page.getByRole('button', { name: 'Display settings', exact: true }).click();
  await page.getByRole('button', { name: '150%', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.style.fontSize === '24px');
  await page.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.displayScale === 150);
  assert.equal(await page.locator('.post-excerpt').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize)), baseTextSize * 1.5);
  assert.ok(await page.locator('#sync-btn').evaluate(el => el.getBoundingClientRect().height) >= baseButtonSize * 1.45);
  await page.getByLabel('Post title font', { exact: true }).selectOption('sans');
  await page.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.titleFont === 'sans');
  assert.match(await page.locator('.post-title').first().evaluate(el => getComputedStyle(el).fontFamily), /StashSystem/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(artifacts, 'stash-display-settings.png') });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.screenshot({ path: path.join(artifacts, 'stash-large-display.png') });
  await page.goto(base + '?demo=1');
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 18);
  assert.equal(await page.evaluate(() => document.documentElement.style.fontSize), '24px');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.titleFont), 'sans');
  await page.getByRole('button', { name: 'Display settings', exact: true }).click();
  await page.getByRole('slider', { name: 'Display size', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.displayScale === 155);
  await page.getByRole('button', { name: '200%', exact: true }).click();
  await page.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.displayScale === 200);
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('#modal').evaluate(el => el.scrollWidth > el.clientWidth), false);
  await page.screenshot({ path: path.join(artifacts, 'stash-display-200.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('#modal').evaluate(el => el.scrollWidth > el.clientWidth), false);
  await page.getByRole('button', { name: 'Reset display settings', exact: true }).click();
  await page.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings?.displayScale === 100);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.titleFont), 'serif');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  record('Display size and font preview immediately, persist on reload, support keyboard adjustment, fit at 200%, and reset without touching the library');
  await page.getByRole('button', { name: 'Filter r/Design', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 3);
  await page.getByRole('button', { name: 'Filter r/books', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 6);
  await page.screenshot({ path: path.join(artifacts, 'stash-filtered.png') });
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#posts').classList.contains('list'));
  await page.screenshot({ path: path.join(artifacts, 'stash-list.png') });
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile overflow');
  await page.screenshot({ path: path.join(artifacts, 'stash-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole('button', { name: 'Leave preview', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#welcome').hidden);
  assert.equal(await page.evaluate(async () => (await chrome.storage.local.get('library')).library), undefined);
  await page.screenshot({ path: path.join(artifacts, 'stash-welcome.png') });
  record('Actual Manifest V3 extension loads; demo, combined subreddit filters, layouts, and responsive screen work without persisting sample data');

  let mode = 'success', account = 'test_reader', unsaves = [], calls = [], identityCalls = 0;
  const all = Array.from({ length: 36 }, (_, i) => ({
    kind: i % 5 === 0 ? 't1' : 't3',
    data: { name: (i % 5 === 0 ? 't1_' : 't3_') + 'test' + i, subreddit: ['books', 'Design', 'LearnProgramming'][i % 3], title: 'Item ' + i, link_title: 'Item ' + i,
      selftext: i === 1 ? '<img src=x onerror="window.__unsafe=true">' : 'A thoughtful saved post number ' + i, body: 'A helpful saved comment number ' + i,
      author: 'author_' + i, permalink: '/r/books/comments/test' + i + '/example/', created_utc: 1750000000 + i * 10000, score: i * 11, num_comments: i * 2 }
  }));
  await context.route('https://www.reddit.com/**', async route => {
    const url = new URL(route.request().url()); calls.push(url.pathname);
    let body, status = 200;
    if (url.pathname === '/api/me.json') { identityCalls++; body = { data: { name: account, modhash: 'test-csrf' } }; }
    else if (url.pathname.endsWith('/saved.json')) {
      const second = url.searchParams.has('after');
      if (mode === 'partial-failure' && second) { status = 500; body = {}; }
      else if (mode === 'forbidden') { status = 403; body = {}; }
      else {
        const children = second ? all.slice(20) : all.slice(0, 20);
        if (mode === 'irregular') {
          if (second) children.push({ kind: 't1', data: { id: 'recovered', link_id: 't3_test0', subreddit_name_prefixed: 'r/books', body: 'Recovered saved comment' } });
          else children.push({ kind: 't3', data: { name: 't3_profile', subreddit: 'u_some-author', title: 'A profile save', permalink: '/user/some-author/comments/profile/title/' } }, { kind: 't3', data: null });
        }
        body = { kind: 'Listing', data: { children, after: second ? null : 't3_test19' } };
      }
    } else if (url.pathname === '/api/unsave') { unsaves.push(new URLSearchParams(route.request().postData())); body = { json: { errors: [] } }; }
    else throw new Error('Unexpected Reddit request: ' + url.pathname);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const sync = async () => {
    await page.getByRole('button', { name: 'Sync Reddit', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Fetched 36'));
  };
  await sync();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 30);
  assert.equal(identityCalls, 2);
  assert.equal(await page.locator('#all-count').textContent(), '36');
  assert.equal(await page.locator('#posts img').count(), 0);
  assert.equal(await page.evaluate(() => window.__unsafe), undefined);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 6);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 30);
  record('Paginated Reddit responses become 36 persisted items, UI paginates at 30, and untrusted HTML stays text');

  await page.getByRole('button', { name: 'Filter r/books', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 12);
  await page.getByRole('button', { name: 'Filter r/Design', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 24);
  await page.getByRole('searchbox', { name: 'Search saved posts' }).fill('Item 10');
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 1);
  await page.getByRole('button', { name: 'Favorite: Item 10', exact: true }).click();
  await page.getByRole('button', { name: 'Unfavorite: Item 10', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Mark as read: Item 10', exact: true }).click();
  await page.getByRole('button', { name: 'Mark as unread: Item 10', exact: true }).waitFor();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#favorite-count').textContent === '1');
  assert.equal(await page.locator('#read-count').textContent(), '1');
  await page.locator('[data-view="favorites"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 1);
  assert.match(await page.locator('.post-title').textContent(), /Item 10/);
  await page.locator('[data-view="all"]').click();
  await page.getByLabel('Filter by content type').selectOption('comment');
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 8);
  await page.getByLabel('Filter by content type').selectOption('all');
  await page.getByLabel('Sort saved posts').selectOption('score');
  await page.waitForFunction(() => document.querySelector('.post-title').textContent === 'Item 35');
  record('Search intersects multi-subreddit selection; favorites and reading survive reload; comment filters and score sort work');

  const before = await page.evaluate(async () => (await chrome.storage.local.get('library')).library);
  mode = 'partial-failure';
  await page.getByRole('button', { name: 'Sync Reddit', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('(500)'));
  assert.deepEqual(await page.evaluate(async () => (await chrome.storage.local.get('library')).library), before);
  account = 'different_reader'; mode = 'success';
  await page.getByRole('button', { name: 'Sync Reddit', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('belongs to'));
  assert.deepEqual(await page.evaluate(async () => (await chrome.storage.local.get('library')).library), before);
  account = 'test_reader';
  await page.getByRole('button', { name: 'Sync Reddit', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel sync', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel sync', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Sync canceled'));
  assert.deepEqual(await page.evaluate(async () => (await chrome.storage.local.get('library')).library), before);
  record('Partial sync failure, account changes, and cancellation leave the existing library byte-for-byte intact');

  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const download = await downloadWait;
  const backupFile = path.join(profile, 'backup.json'); await download.saveAs(backupFile);
  const exported = JSON.parse(await fs.readFile(backupFile, 'utf8'));
  assert.equal(exported.items.length, 36); assert.equal(exported.items.find(p => p.id === 't1_test10').favorite, true);
  await page.getByRole('button', { name: 'Clear local library', exact: true }).click();
  await page.getByRole('button', { name: 'Clear local library', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#welcome').hidden);
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await page.locator('#import-file').setInputFiles(backupFile);
  await page.waitForFunction(() => document.querySelector('#all-count').textContent === '36');
  const restored = await page.evaluate(async () => (await chrome.storage.local.get('library')).library);
  assert.equal(restored.items.filter(p => p.cachedOnly).length, 36);
  assert.equal(restored.items.find(p => p.id === 't1_test10').read, true);
  assert.equal(unsaves.length, 0);
  record('Backup downloads, clear, and import restore every item and annotation without sending any Reddit write');

  await page.getByLabel('Search saved posts').fill('Item 0');
  await page.getByRole('button', { name: 'Item 0', exact: true }).click();
  await page.getByRole('button', { name: 'Unsave', exact: true }).click();
  await page.getByRole('button', { name: 'Keep it', exact: true }).click();
  assert.equal(unsaves.length, 0);
  await page.getByRole('button', { name: 'Unsave', exact: true }).click();
  await page.getByRole('button', { name: 'Unsave from Reddit', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#all-count').textContent === '35');
  assert.equal(unsaves.length, 1); assert.equal(unsaves[0].get('id'), 't1_test0'); assert.equal(unsaves[0].get('uh'), 'test-csrf');
  record('Unsave requires explicit confirmation, sends the correct account-checked request, and updates storage');
  await page.getByLabel('Search saved posts').fill('');
  mode = 'irregular';
  await page.getByRole('button', { name: 'Sync Reddit', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Fetched 38'));
  assert.match(await page.locator('#notice').textContent(), /Skipped 1 entries/);
  const repaired = await page.evaluate(async () => (await chrome.storage.local.get('library')).library);
  assert.equal(repaired.items.length, 38);
  assert.equal(repaired.lastSyncSkipped, 1);
  assert.equal(repaired.items.find(p => p.id === 't3_profile').subreddit, 'u_some-author');
  assert.equal(repaired.items.find(p => p.id === 't1_recovered').permalink, 'https://www.reddit.com/comments/test0/_/recovered/');
  await page.getByRole('button', { name: 'Filter r/u_some-author', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 1);
  assert.equal(await page.locator('.post-title').textContent(), 'A profile save');
  await page.screenshot({ path: path.join(artifacts, 'stash-sync-fix.png') });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Last sync skipped 1'));
  record('Regression: profile saves and recoverable comments sync successfully past malformed entries, with a persisted skipped-entry summary');
  // Chromium reports the intentionally simulated HTTP 500 to its console.
  const expectedErrors = ['Failed to load resource: the server responded with a status of 500 (Internal Server Error)'];
  assert.deepEqual(errors, expectedErrors);
  record('No unexpected browser JavaScript or content-security-policy errors; only the intentionally simulated HTTP 500 was logged');
  await fs.writeFile(path.join(artifacts, 'browser-verification.json'), JSON.stringify({ extensionId: id, checks, unexpectedErrors: [], expectedNetworkErrors: errors, liveRedditVerified: false }, null, 2));
} finally {
  await context.close(); await fs.rm(profile, { recursive: true, force: true });
}
