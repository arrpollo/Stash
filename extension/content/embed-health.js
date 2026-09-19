(() => {
  'use strict';
  // This observer runs only in RedGIFs /ifr/ pages and never reports standalone tabs.
  if (window.top === window) return;
  let reportedURL = '', timer, stopped = false;
  const videos = new WeakSet();

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
    try { chrome.runtime.onMessage.removeListener(receive); } catch {}
  }
  function runtimeAvailable() {
    if (stopped) return false;
    try { if (chrome.runtime?.id) return true; } catch {}
    stop();
    return false;
  }
  function handleRuntimeError(error) {
    if (/extension context invalidated/i.test(error?.message) || !runtimeAvailable()) stop();
    else reportedURL = ''; // Allow a later handshake to retry a temporary messaging failure.
  }
  async function reportFailure() {
    // An invalidated context may throw before returning a promise.
    try { await chrome.runtime.sendMessage({ type: 'stash:embed-failed' }); }
    catch (error) { handleRuntimeError(error); }
  }

  function check(force = false) {
    if (!runtimeAvailable()) return;
    const text = document.body?.innerText || '';
    if (/\b(?:confirm your age|verify your age|age verification|verify your identity)\b/i.test(text)) return;
    let failed = /\berror loading this gif\b/i.test(text);
    for (const video of document.querySelectorAll('video')) {
      if (!videos.has(video)) {
        videos.add(video);
        video.addEventListener('error', () => check());
      }
      if ([2, 3, 4].includes(video.error?.code)) failed = true;
    }
    // Paused videos, slow loads, cookie dialogs and age gates are not failures.
    if (!failed || (!force && reportedURL === location.href)) return;
    reportedURL = location.href;
    reportFailure();
  }
  const schedule = () => {
    if (!runtimeAvailable()) return;
    clearTimeout(timer); timer = setTimeout(() => check(), 150);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  function receive(message, sender) {
    if (runtimeAvailable() && sender.id === chrome.runtime.id && message?.type === 'stash:check-embed') check(true);
  }
  try { if (runtimeAvailable()) chrome.runtime.onMessage.addListener(receive); }
  catch (error) { handleRuntimeError(error); }
  check();
})();
