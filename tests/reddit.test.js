import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RedditClient, pause } from '../extension/lib/reddit.js';
const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const child = id => ({ kind: 't3', data: { name: 't3_' + id, subreddit: 'books', title: 'Book', permalink: '/r/books/comments/' + id + '/' } });
const listing = (ids, after = null) => ({ kind: 'Listing', data: { children: ids.map(child), after } });
test('fetches all pages with credentials, cursors, deduplication, and progress', async () => {
  const calls = [], progress = [], waits = [];
  const client = new RedditClient({ sleep: async ms => waits.push(ms), fetchFn: async (url, options) => {
    calls.push({ url, options }); return reply(calls.length === 1 ? listing(['a', 'b'], 't3_b') : listing(['b', 'c']));
  } });
  const result = await client.saved('reader', { onProgress: n => progress.push(n) });
  assert.deepEqual(result.map(p => p.id), ['t3_a', 't3_b', 't3_c']);
  assert.deepEqual(progress, [2, 3]); assert.deepEqual(waits, [1100]);
  assert.match(calls[1].url, /after=t3_b/); assert.match(calls[1].url, /limit=100/);
  assert.equal(calls[0].options.credentials, 'include');
});
test('fails safely on repeated cursors and errors on later pages', async () => {
  const loop = new RedditClient({ sleep: async () => {}, fetchFn: async () => reply(listing(['a'], 't3_a')) });
  await assert.rejects(loop.saved('reader'), /repeated a page/);
  let n = 0;
  const partial = new RedditClient({ sleep: async () => {}, fetchFn: async () => ++n === 1 ? reply(listing(['a'], 't3_a')) : reply({}, 500) });
  await assert.rejects(partial.saved('reader'), /500/);
});
test('handles signed-out, forbidden, non-JSON, and malformed responses', async () => {
  const signedOut = new RedditClient({ fetchFn: async () => reply({ data: {} }) });
  await assert.rejects(signedOut.identity(), /Sign in/);
  const forbidden = new RedditClient({ fetchFn: async () => reply({}, 403) });
  await assert.rejects(forbidden.identity(), /did not allow/);
  const html = new RedditClient({ fetchFn: async () => new Response('<html>Log in</html>') });
  await assert.rejects(html.identity(), /web page/);
  const malformed = new RedditClient({ fetchFn: async () => reply({}) });
  await assert.rejects(malformed.saved('reader'), /unexpected/);
});
test('honors short Retry-After delays and stops rather than retrying indefinitely', async () => {
  let n = 0; const waits = [];
  const retry = new RedditClient({ sleep: async ms => waits.push(ms), fetchFn: async () => ++n < 3 ? reply({}, 429, { 'Retry-After': '2' }) : reply({ data: { name: 'reader' } }) });
  assert.equal((await retry.identity()).name, 'reader'); assert.deepEqual(waits, [2000, 2000]);
  const blocked = new RedditClient({ sleep: async () => {}, fetchFn: async () => reply({}, 429) });
  await assert.rejects(blocked.identity(), /limiting requests/);
  const longWait = new RedditClient({ sleep: async () => assert.fail('must not sleep'), fetchFn: async () => reply({}, 429, { 'Retry-After': '120' }) });
  await assert.rejects(longWait.identity(), /limiting requests/);
});
test('cancellation interrupts pagination and sleep', async () => {
  const controller = new AbortController();
  const client = new RedditClient({ fetchFn: async () => reply(listing(['a'], 't3_a')) });
  await assert.rejects(client.saved('reader', { signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' });
  const sleepController = new AbortController(); const waiting = pause(60000, sleepController.signal); sleepController.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
});
test('unsave checks the current account, uses the modhash, and reports API errors', async () => {
  const calls = [];
  const client = new RedditClient({ fetchFn: async (url, opts) => { calls.push({ url, opts }); return reply(url.includes('/api/me') ? { data: { name: 'reader', modhash: 'csrf-token' } } : { json: { errors: [] } }); } });
  await client.unsave('t3_a', 'Reader');
  assert.equal(calls[1].opts.method, 'POST'); assert.equal(calls[1].opts.body.get('uh'), 'csrf-token'); assert.equal(calls[1].opts.body.get('id'), 't3_a');
  calls.length = 0; await assert.rejects(client.unsave('t3_a', 'other'), /Sign in as/); assert.equal(calls.length, 1);
  const denied = new RedditClient({ fetchFn: async url => reply(url.includes('/api/me') ? { data: { name: 'reader', modhash: 'token' } } : { json: { errors: [['BAD_CSRF', 'invalid token']] } }) });
  await assert.rejects(denied.unsave('t3_a', 'reader'), /invalid token/);
});
test('one unreadable entry does not stop later pages; progress reports skips and pagination counts all entries', async () => {
  const pages = [
    { kind: 'Listing', data: { children: [child('a'), { kind: 't3', data: null }, { kind: 't3', data: { name: 't3_bad', subreddit: 'books', permalink: 'javascript:alert(1)' } }], after: 't3_bad' } },
    { kind: 'Listing', data: { children: [{ kind: 't3', data: { name: 't3_profile', subreddit: 'u_some-author', permalink: '/user/some-author/comments/profile/title/' } }, child('b')], after: null } }
  ];
  const calls = [], progress = [];
  const client = new RedditClient({ sleep: async () => {}, fetchFn: async url => { calls.push(url); return reply(pages.shift()); } });
  const result = await client.saved('reader', { onProgress: (count, details) => progress.push({ count, ...details }) });
  assert.deepEqual(result.map(p => p.id), ['t3_a', 't3_profile', 't3_b']);
  assert.match(calls[1], /count=3/);
  assert.deepEqual(progress.map(p => [p.count, p.skipped]), [[1, 2], [3, 2]]);
});
test('an entirely unreadable listing does not masquerade as a successful empty sync', async () => {
  const client = new RedditClient({ fetchFn: async () => reply({ kind: 'Listing', data: { children: [{ kind: 't3', data: null }], after: null } }) });
  await assert.rejects(client.saved('reader'), /none could be read.*unchanged/i);
});
