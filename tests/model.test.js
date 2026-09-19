import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLibrary, normalizeItem, fromReddit, redditURL, filterItems, communities, mergeSync, parseBackup, mergeBackup, backupText } from '../extension/lib/model.js';
const item = (id, overrides = {}) => normalizeItem({ id: 't3_' + id, subreddit: 'books', title: 'A good book', body: 'Rainy weekend reading', author: 'reader', permalink: '/r/books/comments/' + id + '/title/', created: 1700000000, score: 20, ...overrides });
test('combines subreddit selections with multi-term search and reading/type filters', () => {
  const items = [item('a'), item('b', { subreddit: 'Design', title: 'Color theory', read: true }), item('c', { id: 't1_c', body: 'Rainy weekend coding', favorite: true })];
  assert.deepEqual(filterItems(items, { subs: ['BOOKS', 'Design'], query: 'RAINY u/reader', view: 'unread', kind: 'comment' }).map(p => p.id), ['t1_c']);
  assert.equal(filterItems(items, { query: 'r/books weekend' }).length, 2);
  assert.equal(filterItems(items, { view: 'favorites' }).length, 1);
  assert.equal(filterItems(items, { subs: ['cooking'] }).length, 0);
});
test('sorts creation dates independently of saved order without mutating the source', () => {
  const items = [item('a', { score: 1, created: 200 }), item('b', { score: 30, created: 100 })].map((p, order) => ({ ...p, order }));
  assert.equal(filterItems(items, { sort: 'score' })[0].id, 't3_b');
  assert.equal(filterItems(items, { sort: 'oldest' })[0].id, 't3_b');
  assert.equal(filterItems(items, { sort: 'newest' })[0].id, 't3_a');
  assert.equal(filterItems(items)[0].id, 't3_a'); assert.equal(items[0].id, 't3_a');
});
test('communities combine differently cased names', () => {
  assert.deepEqual(communities([item('a'), item('b', { subreddit: 'Books' })]), [{ name: 'books', count: 2 }]);
});
test('sync preserves annotations and cached items and deduplicates incoming IDs', () => {
  const current = { ...emptyLibrary(), account: 'reader', items: [item('a', { favorite: true, read: true }), item('b')] };
  const next = mergeSync(current, [item('c'), item('a', { score: 999 }), item('c')], 'Reader', '2026-09-12T10:00:00Z');
  assert.equal(next.items.length, 3); assert.equal(next.fetched, 2);
  assert.deepEqual(next.items.map(p => p.id), ['t3_c', 't3_a', 't3_b']);
  assert.equal(next.items[1].favorite, true); assert.equal(next.items[1].read, true);
  assert.equal(next.items[1].score, 999); assert.equal(next.items[2].cachedOnly, true);
  assert.equal(current.items[1].cachedOnly, false);
  assert.throws(() => mergeSync(current, [], 'different'), /belongs/);
});
test('backup round trip and merge preserve annotations without duplicating posts', () => {
  const current = { ...emptyLibrary(), account: 'reader', items: [item('a')] };
  const imported = parseBackup(backupText({ ...current, items: [item('a', { favorite: true }), item('b', { read: true })] }));
  const merged = mergeBackup(current, imported);
  assert.equal(merged.items.length, 2); assert.equal(merged.items[0].favorite, true);
  assert.equal(merged.items[1].cachedOnly, true); assert.equal(merged.items[1].read, true);
  assert.throws(() => mergeBackup(current, { ...imported, account: 'someone_else' }), /another account/);
});
test('invalid backups and unsafe links are rejected; untrusted markup remains plain text', () => {
  for (const url of ['javascript:alert(1)', 'https://evil.example/r/books/comments/x/', '//evil.example/comments/x', 'https://www.reddit.com.evil.example/comments/x', 'https://user@reddit.com/comments/x', '/login']) assert.equal(redditURL(url), '');
  assert.equal(redditURL('/r/books/comments/a/title/'), 'https://www.reddit.com/r/books/comments/a/title/');
  assert.throws(() => parseBackup('not json'), /valid JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'stash-for-reddit', version: 2, account: 'a', items: [] })), /version 1/);
  const bad = { ...emptyLibrary(), app: 'stash-for-reddit', account: 'reader', items: [item('a'), item('a')] };
  assert.throws(() => parseBackup(JSON.stringify(bad)), /duplicate/);
  bad.items = [{ ...item('a'), permalink: 'javascript:alert(1)' }];
  assert.throws(() => parseBackup(JSON.stringify(bad)), /invalid Reddit link/);
  assert.equal(item('x', { title: '<img src=x onerror=alert(1)>' }).title, '<img src=x onerror=alert(1)>');
});
test('saved comments use their parent post title and comment text', () => {
  const p = fromReddit({ kind: 't1', data: { name: 't1_a', subreddit: 'books', link_title: 'Parent post', body: 'Actual comment', permalink: '/r/books/comments/b/title/a/' } }, 3);
  assert.equal(p.kind, 'comment'); assert.equal(p.title, 'Parent post'); assert.equal(p.body, 'Actual comment'); assert.equal(p.order, 3);
});
test('profile saves with hyphenated usernames normalize, filter, and round-trip through backups', () => {
  const p = fromReddit({ kind: 't3', data: { name: 't3_profile1', subreddit: 'u_saved-author', title: 'A profile post', permalink: '/user/saved-author/comments/profile1/a_profile_post/' } }, 0);
  assert.equal(p.subreddit, 'u_saved-author');
  assert.equal(p.permalink, 'https://www.reddit.com/user/saved-author/comments/profile1/a_profile_post/');
  assert.equal(filterItems([p], { subs: ['u_saved-author'] }).length, 1);
  assert.deepEqual(parseBackup(backupText({ ...emptyLibrary(), account: 'reader', items: [p] })).items, [p]);
  assert.equal(redditURL('https://www.reddit.com/user/saved-author/settings'), '');
  assert.equal(redditURL('https://evil.example/user/saved-author/comments/profile1/'), '');
});
test('live Reddit normalization recovers omitted fullnames, community names, and permalinks from available fields', () => {
  const post = fromReddit({ kind: 't3', data: { id: 'abc123', subreddit_name_prefixed: 'r/books', title: 'A book' } }, 0);
  assert.equal(post.id, 't3_abc123');
  assert.equal(post.permalink, 'https://www.reddit.com/comments/abc123/');
  const comment = fromReddit({ kind: 't1', data: { id: 'def123', link_id: 't3_abc123', subreddit: 'books', body: 'A reply' } }, 1);
  assert.equal(comment.permalink, 'https://www.reddit.com/comments/abc123/_/def123/');
  const profile = fromReddit({ kind: 't3', data: { name: 't3_abc123', permalink: '/user/saved-author/comments/abc123/title/' } }, 0);
  assert.equal(profile.subreddit, 'u_saved-author');
});
test('community display names support legacy punctuation while links remain restricted to Reddit', () => {
  for (const subreddit of ['reddit.com', 'a:t5_archived1']) {
    const p = fromReddit({ kind: 't3', data: { name: 't3_legacy', subreddit, permalink: '/r/' + subreddit + '/comments/legacy/title/' } }, 0);
    assert.equal(p.subreddit, subreddit);
    assert.equal(p.permalink, 'https://www.reddit.com/r/' + subreddit + '/comments/legacy/title/');
  }
  assert.throws(() => normalizeItem({ ...item('a'), subreddit: '<script>' }), /invalid Reddit community/);
});
