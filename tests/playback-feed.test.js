import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';

const dataScript = readFileSync(new URL('../extension/content/playback-data.js', import.meta.url), 'utf8');
const playbackScript = readFileSync(new URL('../extension/content/reddit-playback.js', import.meta.url), 'utf8');

// Small DOM/event doubles exercise the real content script's asynchronous lifecycle.
// Rendering, actual iframe reports and media decoding are checked in Chrome separately.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = {};
    this.paused = true;
    this.hidden = false;
    this.textContent = '';
    const properties = new Map();
    this.style = {
      setProperty: (name, value, priority = '') => properties.set(name, { value, priority }),
      getPropertyValue: name => properties.get(name)?.value || '',
      getPropertyPriority: name => properties.get(name)?.priority || '',
      removeProperty: name => properties.delete(name)
    };
  }
  get isConnected() { return this.tag === 'document' || !!this.parent?.isConnected; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  insertBefore(child, next) { child.parent = this; this.children.splice(this.children.indexOf(next), 0, child); }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'src') this.src = ''; }
  closest(selector) {
    for (let node = this; node; node = node.parent) {
      if (selector === node.tag || (selector === '[data-aspect-ratio-container]' && node.attributes.has('data-aspect-ratio-container'))) return node;
    }
    return null;
  }
  attachShadow() { this.shadowRoot = new Element('shadow'); this.shadowRoot.parent = this; return this.shadowRoot; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(listener => listener !== fn); }
  emit(name) { for (const fn of this.listeners[name] || []) fn({ stopPropagation() {} }); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  focus() {}
}

function harness(initial = [], path = '/user/reader/saved/', runtimeOverrides = {}) {
  const document = new Element('document');
  document.documentElement = document;
  document.hidden = false;
  document.createElement = tag => new Element(tag);
  const embeds = [];
  document.querySelectorAll = () => embeds.filter(e => e.isConnected);
  function card(id, gif = `gif${id}`) {
    const post = new Element('shreddit-post');
    post.id = `t3_${id}`;
    post.setAttribute('permalink', `/r/test/comments/${id}/title/`);
    post.setAttribute('content-href', `https://www.redgifs.com/watch/${gif}`);
    const ratio = new Element('div'); ratio.setAttribute('data-aspect-ratio-container', '');
    const original = new Element('shreddit-async-loader');
    const embed = new Element('shreddit-embed');
    original.append(embed); ratio.append(original); post.append(ratio); document.append(post); embeds.push(embed);
    return { id, gif, post, ratio, original, embed,
      host: () => ratio.children.find(c => c.dataset.stashPlayback),
      video: () => ratio.children.find(c => c.dataset.stashPlayback)?.shadowRoot.children.find(c => c.tag === 'video'),
      button: text => ratio.children.find(c => c.dataset.stashPlayback)?.shadowRoot.children.find(c => c.className === 'toolbar').children.find(c => c.textContent === text),
      status: () => ratio.children.find(c => c.dataset.stashPlayback)?.shadowRoot.children.find(c => c.className === 'toolbar').children.find(c => c.className === 'status').textContent
    };
  }
  const cards = initial.map(id => card(id));
  const requests = [], sent = [], timers = new Map(), events = {}, observations = new Set();
  let mutation, intersection, receive, timerId = 0, mutationConnected = false;
  const location = { href: `https://www.reddit.com${path}` };
  const scope = { URL, AbortController, AbortSignal, document, location,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
    addEventListener: (name, fn) => { events[name] = fn; },
    removeEventListener: (name, fn) => { if (events[name] === fn) delete events[name]; },
    MutationObserver: class {
      constructor(fn) { mutation = fn; }
      observe() { mutationConnected = true; }
      disconnect() { mutationConnected = false; }
    },
    IntersectionObserver: class {
      constructor(fn) { intersection = fn; }
      observe(el) { observations.add(el); }
      unobserve(el) { observations.delete(el); }
      disconnect() { observations.clear(); }
    },
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
    chrome: { runtime: { id: 'stash-id', sendMessage: async message => { sent.push(message); },
      onMessage: { addListener: fn => { receive = fn; }, removeListener: fn => { if (receive === fn) receive = null; } },
      ...runtimeOverrides } }
  };
  runInNewContext(dataScript, scope);
  runInNewContext(playbackScript, scope);
  return { cards, card, requests, sent, observations, document, location, runtime: scope.chrome.runtime, timers, events,
    get mutationConnected() { return mutationConnected; },
    mutate() { if (mutationConnected) mutation(); for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    visible(c, value = true) { intersection([{ target: c.host(), isIntersecting: value, intersectionRatio: value ? 1 : 0 }]); },
    fail(gif, pageURL = location.href, sender = 'stash-id') {
      receive?.({ type: 'stash:use-reddit-preview', gifId: gif, pageURL }, { id: sender });
    },
    event(name) { events[name]?.(); },
    async respond(index, { noCopy = false, status = 200, gif } = {}) {
      const request = requests[index];
      const id = /comments\/(\w+)/.exec(request.url)[1];
      request.resolve({ ok: status === 200, status, json: async () => [{ data: { children: [{ kind: 't3', data: {
        id, url: `https://www.redgifs.com/watch/${gif || `gif${id}`}`,
        preview: noCopy ? {} : { reddit_video_preview: { transcoding_status: 'completed',
          fallback_url: `https://v.redd.it/${id}/CMAF_1080.mp4`, is_gif: true, has_audio: false } }
      } }] } }] });
      await setImmediate();
    }
  };
}

test('multiple failed feed cards use their own copies, leave working cards alone, and bound concurrent requests', async () => {
  const h = harness(['aaa111', 'bbb222', 'ccc333', 'ddd444']);
  const [a, b, c, working] = h.cards;
  for (const card of h.cards) h.visible(card);
  for (const card of [a, b, c]) h.fail(card.gif);
  assert.equal(h.requests.length, 2);
  assert.match(h.requests[0].url, /aaa111/);
  assert.match(h.requests[1].url, /bbb222/);
  await h.respond(1); // Out-of-order results must not cross-wire the players.
  assert.equal(h.requests.length, 3);
  assert.match(b.video().src, /bbb222/);
  assert.equal(a.video(), undefined);
  await h.respond(0);
  await h.respond(2);
  for (const card of [a, b, c]) {
    assert.match(card.video().src, new RegExp(card.id));
    assert.equal(card.video().paused, false);
    assert.equal(card.video().muted, true);
    assert.equal(card.original.style.getPropertyValue('display'), 'none');
  }
  assert.equal(working.video(), undefined);
  for (const card of [a, b, c]) h.fail(card.gif);
  h.mutate();
  assert.equal(h.requests.length, 3);
  assert.equal(h.observations.size, 4);
});

test('offscreen and dynamically appended feed cards wait for visibility and recover early frame reports', async () => {
  const h = harness(['aaa111']);
  const [a] = h.cards;
  h.fail(a.gif);
  assert.equal(h.requests.length, 0);
  h.visible(a);
  await h.respond(0);
  h.visible(a, false);
  assert.equal(a.video().paused, true);
  h.visible(a);
  assert.equal(a.video().paused, false);
  a.video().pause(); // A deliberate pause must survive scrolling away and back.
  h.visible(a, false); h.visible(a);
  assert.equal(a.video().paused, true);
  h.fail('gifbbb222');
  const b = h.card('bbb222');
  h.mutate();
  assert.ok(b.host());
  assert.ok(h.sent.length >= 2); // New mounts ask already-initialized frames to report again.
  assert.equal(h.requests.length, 1);
  h.visible(b);
  await h.respond(1);
  assert.match(b.video().src, /bbb222/);
  h.document.hidden = true; h.document.emit('visibilitychange');
  assert.equal(b.video().paused, true);
  h.document.hidden = false; h.document.emit('visibilitychange');
  assert.equal(b.video().paused, false);
});

test('Original player affects one card and remains respected after its embed is remounted', async () => {
  const h = harness(['aaa111', 'bbb222']);
  const [a, b] = h.cards;
  a.original.style.setProperty('display', 'block', 'important');
  for (const card of h.cards) { h.visible(card); h.fail(card.gif); }
  await h.respond(0); await h.respond(1);
  a.button('Original player').emit('click');
  assert.equal(a.video(), undefined);
  assert.equal(a.original.style.getPropertyValue('display'), 'block');
  assert.equal(a.original.style.getPropertyPriority('display'), 'important');
  assert.equal(b.video().paused, false);
  h.fail(a.gif);
  a.host().remove(); h.mutate(); h.visible(a); h.fail(a.gif);
  assert.equal(h.requests.length, 2);
  a.button('Play Reddit copy').emit('click');
  assert.equal(h.requests.length, 3);
  await h.respond(2);
  assert.ok(a.video());
  a.host().remove(); h.mutate(); h.visible(a); h.fail(a.gif);
  assert.equal(h.requests.length, 4); // Explicitly selecting the copy cancels the original-player preference.
  await h.respond(3);
  assert.ok(a.video());
});

test('removed/recycled cards and old-page reports cannot install a stale video', async () => {
  const h = harness(['aaa111', 'bbb222']);
  const [a, b] = h.cards;
  h.visible(a); h.visible(b);
  h.fail(a.gif, 'https://www.reddit.com/r/previous/');
  h.fail(a.gif, h.location.href, 'other-extension');
  assert.equal(h.requests.length, 0);
  h.fail(a.gif); h.fail(b.gif);
  const oldHost = a.host();
  a.post.remove();
  b.post.id = 't3_ccc333';
  b.post.setAttribute('permalink', '/r/test/comments/ccc333/title/');
  b.post.setAttribute('content-href', 'https://www.redgifs.com/watch/gifccc333');
  h.mutate();
  assert.equal(oldHost.isConnected, false);
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.requests[1].options.signal.aborted, true);
  await h.respond(0); await h.respond(1);
  assert.equal(b.video(), undefined);
  assert.equal(b.host().dataset.stashPlayback, 'ccc333');
  h.visible(b); h.fail('gifccc333'); await h.respond(2);
  assert.match(b.video().src, /ccc333/);
  h.event('pagehide');
  assert.equal(h.observations.size, 0);
  assert.equal(b.video(), undefined);
  h.event('pageshow'); h.mutate();
  assert.ok(b.host());
});

test('missing copies and source mismatches preserve the original and allow a manual retry', async () => {
  const h = harness(['aaa111', 'bbb222']);
  const [a, b] = h.cards;
  for (const card of h.cards) { h.visible(card); h.fail(card.gif); }
  await h.respond(0, { noCopy: true });
  await h.respond(1, { gif: 'unrelatedgif' });
  for (const card of h.cards) {
    assert.equal(card.video(), undefined);
    assert.equal(card.original.style.getPropertyValue('display'), '');
    assert.match(card.status(), /no playable copy/);
    assert.equal(card.button('Play Reddit copy').disabled, false);
    h.fail(card.gif);
  }
  assert.equal(h.requests.length, 2);
  a.button('Play Reddit copy').emit('click');
  await h.respond(2);
  assert.ok(a.video());
  assert.equal(b.video(), undefined);
});

test('opened posts still work and navigation discards reports from the previous route', async () => {
  const h = harness(['aaa111'], '/r/test/comments/aaa111/title/');
  const [a] = h.cards;
  h.visible(a); h.fail(a.gif);
  await h.respond(0);
  assert.ok(a.video());
  const previousURL = h.location.href;
  h.location.href = 'https://www.reddit.com/user/reader/saved/';
  h.mutate(); h.visible(a);
  h.fail(a.gif, previousURL);
  assert.equal(h.requests.length, 1);
  h.fail(a.gif);
  await h.respond(1);
  assert.ok(a.video());
});

for (const asynchronous of [false, true]) {
  test(`context invalidation ${asynchronous ? 'rejection' : 'throw'} stops playback and pending work permanently`, async () => {
    const h = harness(['aaa111', 'bbb222']);
    const [a, b] = h.cards;
    for (const card of h.cards) { h.visible(card); h.fail(card.gif); }
    await h.respond(0);
    const player = a.video();
    const oldButton = b.button('Play Reddit copy');
    assert.equal(a.original.style.getPropertyValue('display'), 'none');
    let attempts = 0;
    h.runtime.sendMessage = () => {
      attempts++;
      const error = new Error('Extension context invalidated.');
      if (asynchronous) return Promise.reject(error);
      throw error;
    };
    h.card('ccc333');
    assert.doesNotThrow(() => h.mutate());
    await setImmediate();
    assert.equal(attempts, 1);
    assert.equal(h.mutationConnected, false);
    assert.equal(h.observations.size, 0);
    assert.equal(h.timers.size, 0);
    assert.equal(Object.keys(h.events).length, 0);
    assert.equal(h.document.listeners.visibilitychange.length, 0);
    assert.equal(h.requests[1].options.signal.aborted, true);
    assert.equal(player.paused, true);
    assert.equal(player.src, '');
    assert.equal(a.original.style.getPropertyValue('display'), '');
    assert.equal(a.host(), undefined);
    assert.equal(b.host(), undefined);
    await h.respond(1); // A response already in flight cannot recreate a player.
    h.event('pageshow'); h.event('popstate'); h.mutate(); h.fail(a.gif);
    h.document.emit('visibilitychange'); oldButton.emit('click');
    assert.equal(attempts, 1);
    assert.equal(h.requests.length, 2);
    assert.equal(a.host(), undefined);
    assert.equal(b.host(), undefined);
  });
}

test('a missing runtime ID shuts down before messaging, including before initial injection', () => {
  const empty = harness(['aaa111'], '/', { id: undefined });
  assert.equal(empty.cards[0].host(), undefined);
  assert.equal(empty.sent.length, 0);
  assert.equal(empty.mutationConnected, false);
  const h = harness(['aaa111']);
  const oldButton = h.cards[0].button('Play Reddit copy');
  delete h.runtime.id;
  oldButton.emit('click');
  assert.equal(h.cards[0].host(), undefined);
  assert.equal(h.requests.length, 0);
  assert.equal(h.sent.length, 1);
  assert.equal(h.mutationConnected, false);
});

test('temporary messaging failures keep the valid playback script available', async () => {
  for (const asynchronous of [false, true]) {
    const h = harness(['aaa111'], '/', { sendMessage() {
      const error = new Error('Could not establish connection. Receiving end does not exist.');
      if (asynchronous) return Promise.reject(error);
      throw error;
    } });
    await setImmediate();
    assert.equal(h.mutationConnected, true);
    const [a] = h.cards;
    h.visible(a); h.fail(a.gif);
    await h.respond(0);
    assert.ok(a.video());
  }
});
