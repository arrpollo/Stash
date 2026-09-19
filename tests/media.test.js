import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaFromReddit, thumbnailURL } from '../extension/lib/media.js';
import { fromReddit, normalizeItem, backupText, parseBackup, emptyLibrary } from '../extension/lib/model.js';
const thumb = 'https://b.thumbs.redditmedia.com/example.jpg';
test('preview extraction prefers a modest resolution and decodes Reddit HTML entities', () => {
  const media = mediaFromReddit({ preview: { images: [{ resolutions: [
    { width: 108, url: 'https://preview.redd.it/small.jpg' },
    { width: 320, url: 'https://preview.redd.it/medium.jpg?width=320&amp;crop=smart' },
    { width: 1080, url: 'https://preview.redd.it/large.jpg' }
  ], source: { url: 'https://i.redd.it/full.jpg' } }] } });
  assert.equal(media.thumbnail, 'https://preview.redd.it/medium.jpg?width=320&crop=smart');
  assert.equal(media.type, 'image');
});
test('video and GIF posts use still poster images rather than their playable URLs', () => {
  assert.deepEqual(mediaFromReddit({ is_video: true, thumbnail: thumb, media: { reddit_video: { fallback_url: 'https://v.redd.it/id/DASH_720.mp4' } } }), { thumbnail: thumb, type: 'video', count: 1 });
  assert.equal(mediaFromReddit({ thumbnail: thumb, preview: { images: [{ variants: { gif: { source: { url: 'https://i.redd.it/animated.gif' } } } }] } }).type, 'gif');
  assert.equal(mediaFromReddit({ is_video: true, url: 'https://v.redd.it/id/video.mp4' }), null);
});
test('gallery and crosspost previews are recovered, including missing first-gallery metadata', () => {
  const gallery = mediaFromReddit({ is_gallery: true, gallery_data: { items: [{ media_id: 'missing' }, { media_id: 'photo' }] },
    media_metadata: { photo: { status: 'valid', p: [{ x: 320, u: 'https://preview.redd.it/gallery.png' }] } } });
  assert.deepEqual(gallery, { thumbnail: 'https://preview.redd.it/gallery.png', type: 'gallery', count: 2 });
  assert.equal(mediaFromReddit({ crosspost_parent_list: [{ is_video: true, thumbnail: thumb }] }).type, 'video');
});
test('thumbnail URLs reject unknown hosts, unsafe schemes, video files, and animated originals', () => {
  for (const url of ['self', 'nsfw', 'default', 'javascript:alert(1)', 'data:image/png;base64,AAA', 'http://i.redd.it/x.jpg', 'https://evil.example/p.jpg', 'https://i.redd.it.evil.example/p.jpg', 'https://user@i.redd.it/p.jpg', 'https://i.redd.it:8080/p.jpg', 'https://i.redd.it/p.gif', 'https://i.redd.it/p.mp4', 'https://i.redd.it/p.svg']) assert.equal(thumbnailURL(url), '', url);
  assert.equal(thumbnailURL(thumb), thumb);
  assert.equal(mediaFromReddit({ thumbnail: 'nsfw' }), null);
});
test('old backups stay compatible, new previews round-trip, and comments do not get post thumbnails', () => {
  const p = fromReddit({ kind: 't3', data: { name: 't3_abc', subreddit: 'books', permalink: '/r/books/comments/abc/title/', thumbnail: thumb, spoiler: true } }, 0);
  assert.equal(p.spoiler, true);
  const library = parseBackup(backupText({ ...emptyLibrary(), account: 'reader', items: [p] }));
  assert.deepEqual(library.items[0].media, p.media);
  const { media, spoiler, ...old } = p;
  assert.equal(normalizeItem(old).media, null);
  assert.equal(normalizeItem({ ...p, media: { thumbnail: 'https://evil.example/track.jpg' } }).media, null);
  assert.equal(normalizeItem({ ...p, id: 't1_abc' }).media, null);
});
