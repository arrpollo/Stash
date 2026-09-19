import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';

const script = readFileSync(new URL('../extension/content/embed-health.js', import.meta.url), 'utf8');
function harness(runtimeOverrides = {}) {
  const document = { body: { innerText: '' }, documentElement: {}, querySelectorAll: () => [video] };
  const timers = new Map(), sent = [];
  let connected = false, mutation, receive, videoError, timerId = 0;
  const video = { addEventListener: (_name, fn) => { videoError = fn; } };
  const runtime = { id: 'stash-id', sendMessage: async message => { sent.push(message); },
    onMessage: { addListener: fn => { receive = fn; }, removeListener: fn => { if (receive === fn) receive = null; } },
    ...runtimeOverrides };
  runInNewContext(script, { document, window: { top: {} }, location: { href: 'https://www.redgifs.com/ifr/example' },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    MutationObserver: class {
      constructor(fn) { mutation = fn; }
      observe() { connected = true; }
      disconnect() { connected = false; }
    }, chrome: { runtime }
  });
  return { document, runtime, sent, timers,
    get connected() { return connected; },
    mutate() { if (connected) mutation(); },
    flush() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    handshake() { receive?.({ type: 'stash:check-embed' }, { id: 'stash-id' }); },
    fail() { document.body.innerText = 'Error loading this gif.'; videoError?.(); }
  };
}

for (const asynchronous of [false, true]) {
  test(`embed invalidation ${asynchronous ? 'rejection' : 'throw'} stops observation, timers, and later reports`, async () => {
    let attempts = 0;
    const h = harness({ sendMessage() {
      attempts++;
      const error = new Error('Extension context invalidated.');
      if (asynchronous) return Promise.reject(error);
      throw error;
    } });
    h.mutate();
    assert.equal(h.timers.size, 1);
    assert.doesNotThrow(() => h.fail());
    await setImmediate();
    assert.equal(h.connected, false);
    assert.equal(h.timers.size, 0);
    h.handshake(); h.mutate(); h.flush(); h.fail();
    assert.equal(attempts, 1);
  });
}

test('embed stops when the runtime ID disappears or becomes inaccessible', () => {
  assert.equal(harness({ id: undefined }).connected, false);
  for (const inaccessible of [false, true]) {
    const h = harness();
    if (inaccessible) Object.defineProperty(h.runtime, 'id', { get() { throw new Error('Extension context invalidated.'); } });
    else delete h.runtime.id;
    assert.doesNotThrow(() => h.fail());
    assert.equal(h.connected, false);
    assert.equal(h.sent.length, 0);
  }
});

test('embed can retry a temporary messaging failure without disabling observation', async () => {
  for (const asynchronous of [false, true]) {
    const h = harness({ sendMessage() {
      const error = new Error('Could not establish connection. Receiving end does not exist.');
      if (asynchronous) return Promise.reject(error);
      throw error;
    } });
    h.fail();
    await setImmediate();
    assert.equal(h.connected, true);
    h.runtime.sendMessage = async message => { h.sent.push(message); };
    h.mutate(); h.flush();
    await setImmediate();
    assert.equal(h.sent.length, 1);
    h.mutate(); h.flush();
    assert.equal(h.sent.length, 1); // Successful reports are still deduplicated.
  }
});
