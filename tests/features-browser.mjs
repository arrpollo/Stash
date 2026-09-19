import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromReddit, emptyLibrary } from '../extension/lib/model.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stash-features-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: true, channel: 'chromium', viewport: { width: 1600, height: 1100 },
  args: ['--disable-extensions-except=' + path.join(root, 'extension'), '--load-extension=' + path.join(root, 'extension')]
});
const checks = [], errors = [], imageRequests = [];
const pass = value => { checks.push(value); console.log('PASS ' + value); };
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const base = 'chrome-extension://' + new URL(worker.url()).hostname + '/index.html';
  const children = Array.from({ length: 137 }, (_, i) => ({
    kind: 't3', data: { name: 't3_entry' + i, subreddit: i % 2 ? 'Design' : 'books', title: 'Saved media ' + i,
      selftext: 'A useful idea worth keeping. Sample text for reading and browsing checks.', author: 'test_author',
      permalink: '/r/books/comments/entry' + i + '/title/', created_utc: 1750000000, score: i, num_comments: i,
      ...(i < 9 ? { thumbnail: 'https://preview.redd.it/' + (i === 6 ? 'broken' : 'poster' + i) + '.jpg' } : {}),
      ...(i === 2 ? { is_video: true } : {}), ...(i === 3 ? { url: 'https://i.redd.it/animated.gif' } : {}),
      ...(i === 4 ? { is_gallery: true, gallery_data: { items: [{ media_id: 'a' }, { media_id: 'b' }] } } : {}),
      ...(i === 5 || i === 8 ? { over_18: true } : {}), ...(i === 7 || i === 8 ? { spoiler: true } : {})
    }
  }));
  const fresh = children.map(fromReddit);
  const legacy = fresh.map(({ media, spoiler, ...p }) => p);
  await context.route('https://www.reddit.com/**', route => {
    const url = new URL(route.request().url());
    const data = url.pathname.includes('/api/me') ? { data: { name: 'test_reader', modhash: 'test-token' } } :
      { kind: 'Listing', data: { children: url.searchParams.has('after') ? children.slice(100) : children.slice(0, 100), after: url.searchParams.has('after') ? null : 't3_entry99' } };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  const sample = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="#e8e8db"/><circle cx="490" cy="75" r="35" fill="#d87b4d"/><path d="M0 320 190 105 370 320M220 320 440 135 640 320" fill="#79927a"/><path d="m360 320 180-120 100 120" fill="#4e6b5c"/></svg>';
  await context.route('https://preview.redd.it/**', route => {
    imageRequests.push(route.request().url());
    return route.fulfill({ contentType: route.request().url().includes('broken') ? 'image/jpeg' : 'image/svg+xml', body: route.request().url().includes('broken') ? 'not an image' : sample });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base);
  await page.evaluate(library => chrome.storage.local.set({ library }), { ...emptyLibrary(), account: 'test_reader', items: legacy });
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 30);
  assert.equal(await page.locator('#posts img').count(), 0);
  assert.equal(imageRequests.length, 0);
  const initialLibrary = await page.evaluate(async () => (await chrome.storage.local.get('library')).library);
  const settings = async () => { await page.getByRole('button', { name: 'Display settings', exact: true }).click(); };
  const close = async () => { await page.getByRole('button', { name: 'Close dialog', exact: true }).click(); };
  await settings();
  assert.equal(await page.locator('#show-thumbnails').isChecked(), true);
  assert.equal(await page.locator('#show-nsfw-thumbnails').isChecked(), false);
  for (const [key, family] of [['atkinson', 'Atkinson Hyperlegible'], ['lexend', 'Lexend']]) {
    await page.getByLabel('Reading font', { exact: true }).selectOption(key);
    await page.waitForFunction(key => document.documentElement.dataset.readingFont === key, key);
    const loaded = await page.evaluate(async family => {
      const result = await document.fonts.load('16px "' + family + '"');
      return result.length > 0 && result.every(font => font.status === 'loaded');
    }, family);
    assert.equal(loaded, true);
    assert.ok((await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).includes(family));
  }
  await page.getByLabel('Post title font', { exact: true }).selectOption('atkinson');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.post-title')).fontFamily.includes('Atkinson'));
  await page.getByLabel('Posts per page or scroll batch', { exact: true }).selectOption('15');
  await close();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 15);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.post-card').dataset.id === 't3_entry15');
  await settings();
  await page.getByLabel('Posts per page or scroll batch', { exact: true }).selectOption('100');
  await close();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 100);
  assert.equal(await page.locator('.post-card').first().getAttribute('data-id'), 't3_entry0');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 37);
  pass('Bundled Atkinson and Lexend fonts load offline; page sizes change correctly and reset to the first page');

  await settings();
  await page.getByLabel('Posts per page or scroll batch', { exact: true }).selectOption('15');
  await page.getByLabel('Browsing style', { exact: true }).selectOption('scroll');
  await close();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 15);
  await page.evaluate(() => { window.firstRenderedCard = document.querySelector('.post-card'); });
  for (let i = 0; i < 12; i++) {
    const count = await page.locator('.post-card').count(); if (count === 137) break;
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(count => document.querySelectorAll('.post-card').length > count, count);
  }
  assert.equal(await page.locator('.post-card').count(), 137);
  assert.equal(await page.locator('#pagination').isVisible(), false);
  assert.equal(await page.locator('#load-more').isVisible(), false);
  assert.equal(await page.evaluate(() => window.firstRenderedCard === document.querySelector('.post-card')), true);
  assert.equal(await page.locator('.post-card').evaluateAll(nodes => new Set(nodes.map(n => n.dataset.id)).size), 137);
  await page.getByLabel('Search saved posts').fill('Saved media 136');
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 1);
  await page.getByLabel('Search saved posts').fill('');
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 15);
  assert.deepEqual(await page.evaluate(async () => (await chrome.storage.local.get('library')).library), initialLibrary);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 15);
  const persisted = await page.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  assert.equal(persisted.browsingMode, 'scroll'); assert.equal(persisted.pageSize, 15); assert.equal(persisted.readingFont, 'lexend'); assert.equal(persisted.titleFont, 'atkinson');
  pass('Continuous scrolling loads all 137 saves without duplicates or replacing existing cards; search resets the batch and preferences persist');

  assert.equal(await page.locator('#posts img').count(), 0);
  await page.getByRole('button', { name: 'Sync Reddit', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Fetched 137'));
  await page.locator('[data-id="t3_entry0"] .post-media').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-id="t3_entry0"] img');
    return img && img.complete && img.naturalWidth > 0;
  });
  assert.equal(await page.locator('[data-id="t3_entry2"] .media-badge').textContent(), 'Video');
  assert.equal(await page.locator('[data-id="t3_entry3"] .media-badge').textContent(), 'GIF');
  assert.equal(await page.locator('[data-id="t3_entry4"] .media-badge').textContent(), '2 images');
  assert.equal(await page.locator('[data-id="t3_entry5"] img').count(), 0);
  assert.equal(await page.locator('[data-id="t3_entry7"] img').count(), 0);
  assert.equal(await page.locator('[data-id="t3_entry8"] img').count(), 0);
  assert.equal(imageRequests.some(url => url.includes('poster5')), false);
  assert.equal(imageRequests.some(url => /poster[78]/.test(url)), false);
  await page.locator('[data-id="t3_entry5"] .post-media').click();
  await page.waitForFunction(() => document.querySelector('[data-id="t3_entry5"] img')?.naturalWidth > 0);
  await page.locator('[data-id="t3_entry6"] .post-media').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-id="t3_entry6"] .post-media').textContent === 'Preview unavailable');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(root, 'artifacts/stash-thumbnails.png') });
  const cache = await page.evaluate(async () => (await chrome.storage.local.get('library')).library);
  assert.ok(cache.items.find(p => p.id === 't3_entry2').media);
  await settings(); await page.locator('#show-nsfw-thumbnails').check(); await close();
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 15);
  await page.locator('[data-id="t3_entry5"] .post-media').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-id="t3_entry5"] img')?.naturalWidth > 0);
  assert.equal(await page.locator('[data-id="t3_entry7"] img').count(), 0);
  assert.equal(await page.locator('[data-id="t3_entry8"] img').count(), 0);
  assert.equal(await page.locator('[data-id="t3_entry8"] .preview-hidden').textContent(), 'Spoiler · Show preview');
  assert.equal(imageRequests.some(url => /poster[78]/.test(url)), false);
  await page.locator('[data-id="t3_entry5"] .post-title button').click();
  assert.equal(await page.locator('#modal .post-media img').count(), 1);
  await close();
  await settings(); await page.locator('#show-nsfw-thumbnails').uncheck(); await close();
  assert.equal(await page.locator('[data-id="t3_entry5"] img').count(), 0);
  await page.locator('[data-id="t3_entry5"] .post-title button').click();
  assert.equal(await page.locator('#modal .post-media img').count(), 0);
  await close();
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 15);
  assert.equal(await page.locator('[data-id="t3_entry5"] img').count(), 0);
  await settings(); await page.locator('#show-nsfw-thumbnails').check();
  await page.locator('#show-thumbnails').uncheck();
  assert.equal(await page.locator('#show-nsfw-thumbnails').isDisabled(), true);
  await close();
  assert.equal(await page.locator('#posts img').count(), 0);
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 15);
  assert.equal(await page.locator('#posts img').count(), 0);
  await settings();
  assert.equal(await page.locator('#show-thumbnails').isChecked(), false);
  assert.equal(await page.locator('#show-nsfw-thumbnails').isChecked(), true);
  assert.equal(await page.locator('#show-nsfw-thumbnails').isDisabled(), true);
  await page.locator('#show-thumbnails').check();
  assert.equal(await page.locator('#show-nsfw-thumbnails').isDisabled(), false);
  await page.locator('#show-nsfw-thumbnails').uncheck();
  await close();
  assert.equal(await page.locator('[data-id="t3_entry5"] img').count(), 0);
  pass('Thumbnails default on and NSFW previews default off; the NSFW switch persists, updates cards and details, respects spoilers, and follows the main thumbnail switch');
  await settings();
  await page.getByLabel('Show media thumbnails', { exact: false }).uncheck(); await close();
  assert.equal(await page.locator('#posts img').count(), 0);
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.post-card').length === 15);
  assert.equal(await page.locator('#posts img').count(), 0);
  await settings();
  await page.getByRole('button', { name: '200%', exact: true }).click();
  await page.setViewportSize({ width: 800, height: 900 });
  await page.locator('#browsing-mode').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#modal').evaluate(el => el.scrollWidth > el.clientWidth), false);
  await page.screenshot({ path: path.join(root, 'artifacts/stash-browsing-settings.png') });
  pass('Old saves acquire optional thumbnails after sync; video/GIF/gallery labels, reveal controls, broken-image fallback, disabling, and persistence work');
  assert.deepEqual(errors, []);
  pass('No JavaScript or content-security-policy errors');
  await fs.writeFile(path.join(root, 'artifacts/features-verification.json'), JSON.stringify({ checks, errors }, null, 2));
} finally {
  await context.close(); await fs.rm(profile, { recursive: true, force: true });
}
