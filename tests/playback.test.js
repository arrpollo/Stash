import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const scope = { URL };
runInNewContext(readFileSync(new URL('../extension/content/playback-data.js', import.meta.url), 'utf8'), scope);
const { postId, videoURL, redgifsURL, previewFromListing, failureReport } = scope.StashRedditPlayback;
const src = 'https://v.redd.it/example123/CMAF_1080.mp4';
const listing = () => [{ data: { children: [{ kind: 't3', data: { id: 'abc123',
  url: 'https://www.redgifs.com/watch/example', preview: { reddit_video_preview: {
    fallback_url: src, is_gif: true, has_audio: false, transcoding_status: 'completed'
  } } } }] } }];

test('fallback only accepts an exact matching RedGIFs post with a completed Reddit video preview', () => {
  assert.equal(previewFromListing(listing(), 'abc123').src, src);
  assert.equal(previewFromListing(listing(), 'abc123', 'example').src, src);
  assert.equal(previewFromListing(listing(), 'abc123', 'differentgif'), null);
  assert.equal(previewFromListing(listing(), 'other123'), null);
  assert.equal(previewFromListing({ data: {} }, 'abc123'), null);
  for (const change of [d => d.preview = {}, d => d.preview.reddit_video_preview.transcoding_status = 'error',
    d => d.url = 'https://other.example/watch/example', d => d.preview.reddit_video_preview.fallback_url = 'https://evil.example/x.mp4']) {
    const data = listing(); change(data[0].data.children[0].data);
    assert.equal(previewFromListing(data, 'abc123'), null);
  }
});

test('media validation prevents credentials, other hosts, scripts, playlists, and encoded path traversal', () => {
  assert.equal(videoURL(src), src);
  assert.equal(videoURL(src + '?a=1&amp;b=2'), src + '?a=1&b=2');
  for (const bad of ['https://v.redd.it.evil.example/id/video.mp4', 'https://user:pass@v.redd.it/id/video.mp4',
    'https://v.redd.it:999/id/video.mp4', 'http://v.redd.it/id/video.mp4', 'javascript:alert(1)',
    'https://v.redd.it/id/HLSPlaylist.m3u8', 'https://v.redd.it/id/%2fsecret.mp4', 'https://evil.example/video.mp4']) {
    assert.equal(videoURL(bad), '', bad);
  }
  assert.equal(redgifsURL('https://redgifs.com/watch/example'), true);
  assert.equal(redgifsURL('https://redgifs.com.evil.example/watch/example'), false);
});

test('only Reddit post routes yield safe IDs; comment routes retain the parent post ID', () => {
  assert.equal(postId('/r/test/comments/abc123/title/'), 'abc123');
  assert.equal(postId('/comments/abc123/title/comment/xyz/'), 'abc123');
  for (const path of ['/', '/r/test/', '/user/reader/saved', '/comments/%2e%2e/', '/comments/abc.json']) assert.equal(postId(path), '');
});

test('automatic fallback accepts verified frames on Reddit posts and feeds, bound to the current page', () => {
  const sender = { id: 'stash-id', frameId: 4, documentLifecycle: 'active',
    url: 'https://www.redgifs.com/ifr/ExampleGif', tab: { id: 12, url: 'https://www.reddit.com/r/test/comments/abc123/title/' } };
  assert.equal(failureReport(sender, 'stash-id').pageURL, sender.tab.url);
  assert.equal(failureReport(sender, 'stash-id').gifId, 'examplegif');
  for (const path of ['/user/reader/saved/', '/r/test/', '/', '/search/?q=example']) {
    const url = `https://www.reddit.com${path}`;
    assert.equal(failureReport({ ...sender, tab: { id: 12, url } }, 'stash-id').pageURL, url);
  }
  for (const bad of [
    { ...sender, id: 'other-extension' }, { ...sender, frameId: 0 }, { ...sender, frameId: undefined },
    { ...sender, documentLifecycle: 'prerender' }, { ...sender, url: 'https://www.redgifs.com/watch/examplegif' },
    { ...sender, url: 'https://redgifs.com.evil.example/ifr/examplegif' },
    { ...sender, tab: { id: 12, url: 'https://other.example/comments/abc123/' } },
    { ...sender, tab: { id: 12, url: 'https://www.reddit.com.evil.example/user/reader/saved/' } },
    { ...sender, tab: { id: 12, url: 'https://user:pass@www.reddit.com/user/reader/saved/' } },
    { ...sender, tab: { url: sender.tab.url } }, { ...sender, tab: undefined }
  ]) assert.equal(failureReport(bad, 'stash-id'), null);
});

test('embed detection reports real errors once; paused/loading/gated players are left alone', () => {
  const script = readFileSync(new URL('../extension/content/embed-health.js', import.meta.url), 'utf8');
  function run({ text = '', code, standalone = false } = {}) {
    const sent = [], listeners = {};
    const window = {}; window.top = standalone ? window : {};
    const document = { body: { innerText: text }, documentElement: {},
      querySelectorAll: () => code ? [{ error: { code }, addEventListener() {} }] : [] };
    runInNewContext(script, { window, document, location: { href: 'https://www.redgifs.com/ifr/example' },
      WeakSet, clearTimeout, setTimeout, MutationObserver: class { observe() {} },
      chrome: { runtime: { id: 'stash-id', sendMessage: async m => { sent.push(m); },
        onMessage: { addListener: fn => { listeners.check = fn; } } } }
    });
    return { sent, listeners };
  }
  for (const text of ['', 'Loading…', 'Paused', 'Confirm your age', 'Allow cookies',
    'Error loading this gif. Verify your age to continue.']) assert.equal(run({ text }).sent.length, 0);
  assert.equal(run({ code: 1 }).sent.length, 0); // Aborted playback is not a load failure.
  for (const code of [2, 3, 4]) assert.equal(run({ code }).sent.length, 1);
  assert.equal(run({ text: 'Error loading this gif.', standalone: true }).sent.length, 0);
  const failed = run({ text: 'Error loading this gif.' });
  assert.equal(failed.sent.length, 1);
  failed.listeners.check({ type: 'stash:check-embed' }, { id: 'other-extension' });
  assert.equal(failed.sent.length, 1);
  failed.listeners.check({ type: 'stash:check-embed' }, { id: 'stash-id' });
  assert.equal(failed.sent.length, 2); // Ready handshake covers frame/parent initialization races.
});
