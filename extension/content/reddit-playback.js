(() => {
  'use strict';
  const { postId, previewFromListing, gifId, redditPageURL } = globalThis.StashRedditPlayback;
  const active = new Map();
  const observed = new Map();
  const failures = new Set();
  const manualOnly = new Set();
  let route = redditPageURL(location.href);
  let timer, pendingRequests = 0, suspended = false, stopped = false;

  function runtimeAvailable() {
    if (stopped) return false;
    try { if (chrome.runtime?.id) return true; } catch {}
    stop();
    return false;
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    mutations.disconnect();
    visibility.disconnect();
    suspend();
    manualOnly.clear();
    removeEventListener('popstate', schedule);
    removeEventListener('pagehide', suspend);
    removeEventListener('pageshow', resume);
    document.removeEventListener('visibilitychange', updateVisibility);
    try { chrome.runtime.onMessage.removeListener(receive); } catch {}
  }
  function handleRuntimeError(error) {
    if (/extension context invalidated/i.test(error?.message) || !runtimeAvailable()) stop();
  }
  async function notifyReady() {
    if (!runtimeAvailable()) return;
    // Reloads can throw synchronously, before sendMessage returns its promise.
    try { await chrome.runtime.sendMessage({ type: 'stash:playback-ready' }); }
    catch (error) { handleRuntimeError(error); }
  }

  function cardFor(embed) {
    const post = embed.closest('shreddit-post');
    const id = postId(post?.getAttribute('permalink') || '');
    const gif = gifId(post?.getAttribute('content-href'));
    const ratio = embed.closest('[data-aspect-ratio-container]');
    if (!id || post.id !== `t3_${id}` || !gif || !ratio || ratio.closest('shreddit-post') !== post) return null;
    return { post, id, gif, ratio };
  }
  function pump() {
    if (!runtimeAvailable() || suspended || document.hidden) return;
    for (const controller of active.values()) {
      if (pendingRequests >= 2) break;
      if (failures.has(controller.gif)) controller.tryAutomatic();
    }
  }
  const visibility = new IntersectionObserver(entries => {
    if (!runtimeAvailable()) return;
    for (const entry of entries) observed.get(entry.target)?.setVisible(entry.isIntersecting && entry.intersectionRatio > 0);
    pump();
  }, { threshold: [0, 0.01] });

  function attach(embed, { post, id, gif, ratio }) {
    const original = embed.closest('shreddit-async-loader') || embed;
    const host = document.createElement('div');
    host.dataset.stashPlayback = id;
    host.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { font: 14px/1.4 system-ui, sans-serif; color: #fff; }
      * { box-sizing: border-box; }
      .toolbar { position:absolute;top:12px;left:12px;right:12px;display:flex;align-items:center;
        flex-wrap:wrap;gap:8px;pointer-events:none; }
      button { font:600 14px/1.3 system-ui,sans-serif;color:#172d25;background:#f7fbf8;
        border:1px solid #becfc5;border-radius:20px;padding:10px 14px;cursor:pointer;pointer-events:auto; }
      button:hover { background:#deeee3; }
      button:focus-visible { outline:3px solid #ff9c65;outline-offset:3px; }
      button:disabled { cursor:wait;opacity:.8; }
      [hidden] { display:none!important; }
      .status { padding:7px 10px;border-radius:8px;background:rgba(0,0,0,.82);max-width:100%; }
      .status:empty { display:none; }
      video { position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;
        pointer-events:auto; }
    `;
    const bar = document.createElement('div');
    bar.className = 'toolbar';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Play Reddit copy';
    button.title = 'Stash: try Reddit’s retained video if the original player does not load.';
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = 'Original player';
    restore.hidden = true;
    const status = document.createElement('span');
    status.className = 'status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    bar.append(button, restore, status);
    root.append(style, bar);
    ratio.append(host);
    const key = `${id}:${gif}`;
    let request, video, previousDisplay, autoAttempted = false, destroyed = false;
    let inViewport = false, resumeWhenVisible = false;
    const visible = () => inViewport && !document.hidden;
    function current() {
      const card = cardFor(embed);
      return runtimeAvailable() && !destroyed && embed.isConnected && host.isConnected && card?.post === post &&
        card.id === id && card.gif === gif && card.ratio === ratio && redditPageURL(location.href) === route;
    }
    function startVideo(player) {
      player.play().catch(error => {
        if (video === player && !player.error && error.name !== 'AbortError') {
          status.textContent = 'Press play to watch Reddit’s video copy.';
        }
      });
    }
    function updateVisibility() {
      if (!video) return;
      if (!visible()) {
        if (!video.paused) { resumeWhenVisible = true; video.pause(); }
      } else if (resumeWhenVisible) {
        resumeWhenVisible = false;
        startVideo(video);
      }
    }

    function reset() {
      request?.abort();
      request = null;
      resumeWhenVisible = false;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
        video = null;
      }
      if (previousDisplay) {
        if (previousDisplay.value) original.style.setProperty('display', previousDisplay.value, previousDisplay.priority);
        else original.style.removeProperty('display');
        previousDisplay = null;
      }
      button.hidden = false;
      button.disabled = false;
      restore.hidden = true;
      status.textContent = '';
    }
    restore.addEventListener('click', event => {
      event.stopPropagation();
      autoAttempted = true; // Honor this choice until the page is reloaded or the post changes.
      manualOnly.add(key);
      reset();
      button.focus();
    });
    async function playCopy(automatic = false) {
      if (request || video || !current()) return;
      request = new AbortController();
      const attempt = request;
      pendingRequests++;
      button.disabled = true;
      status.textContent = 'Looking for Reddit’s video copy…';
      try {
        // Construct the endpoint from a validated post ID, never an arbitrary page URL.
        const response = await fetch(`/comments/${id}.json?raw_json=1&limit=1`, {
          credentials: 'same-origin', headers: { Accept: 'application/json' },
          signal: AbortSignal.any([attempt.signal, AbortSignal.timeout(20000)])
        });
        if (!response.ok) throw new Error(response.status === 429 ? 'Reddit is limiting requests. Try again shortly.' :
          'Could not read this post from Reddit. Try again.');
        let listing;
        try { listing = await response.json(); } catch { throw new Error('Reddit did not return post data. Refresh the page and try again.'); }
        const preview = previewFromListing(listing, id, gif);
        if (!preview) throw new Error('Reddit has no playable copy for this post.');
        if (attempt.signal.aborted || !current()) return;
        video = document.createElement('video');
        const player = video;
        player.controls = true;
        player.playsInline = true;
        player.loop = preview.isGif;
        player.muted = automatic || preview.isGif;
        player.preload = 'metadata';
        player.setAttribute('aria-label', 'Reddit video copy');
        player.addEventListener('click', e => e.stopPropagation());
        player.addEventListener('error', () => {
          if (video === player) status.textContent = 'Reddit’s video copy could not load. You can return to the original player.';
        });
        previousDisplay = { value: original.style.getPropertyValue('display'), priority: original.style.getPropertyPriority('display') };
        original.style.setProperty('display', 'none', 'important');
        root.insertBefore(player, bar);
        button.hidden = true;
        restore.hidden = false;
        status.textContent = preview.hasAudio ? 'Reddit copy · audio may be unavailable' : 'Reddit video copy';
        player.src = preview.src;
        if (visible()) startVideo(player);
        else resumeWhenVisible = true;
        if (!automatic) restore.focus({ preventScroll: true });
      } catch (error) {
        if (!attempt.signal.aborted && current()) {
          status.textContent = error.name === 'TimeoutError' ? 'Reddit took too long. Try again.' : error.message;
          button.disabled = false;
        }
      } finally {
        if (request === attempt) request = null;
        pendingRequests--;
        pump();
      }
    }
    button.addEventListener('click', event => {
      event.stopPropagation();
      manualOnly.delete(key); // Choosing the copy again cancels the earlier Original player preference.
      autoAttempted = true;
      playCopy();
    });
    return { id, gif, host, current, updateVisibility,
      setVisible(value) { inViewport = value; updateVisibility(); },
      tryAutomatic() {
        if (autoAttempted || manualOnly.has(key) || request || video || !visible() || !current()) return;
        autoAttempted = true;
        playCopy(true);
      },
      destroy() {
        destroyed = true;
        visibility.unobserve(host);
        observed.delete(host);
        reset();
        host.remove();
      }
    };
  }

  function scan() {
    clearTimeout(timer);
    timer = undefined;
    if (!runtimeAvailable() || suspended) return;
    const pageURL = redditPageURL(location.href);
    const changedRoute = pageURL !== route;
    if (changedRoute) { route = pageURL; failures.clear(); manualOnly.clear(); }
    for (const [embed, controller] of active) {
      if (changedRoute || !controller.current()) {
        controller.destroy();
        active.delete(embed);
      }
    }
    if (!pageURL) return;
    let added = false;
    // Each embed belongs to its own post, independent of the page's address.
    for (const embed of document.querySelectorAll('shreddit-embed[providername="RedGIFs"]')) {
      if (active.has(embed)) continue;
      const card = cardFor(embed);
      if (!card) continue;
      const controller = attach(embed, card);
      active.set(embed, controller);
      observed.set(controller.host, controller);
      visibility.observe(controller.host);
      added = true;
    }
    pump();
    // Covers already-failed frames mounted before their card and SPA navigation.
    if (added || changedRoute) notifyReady();
  }
  const schedule = () => { if (runtimeAvailable() && !timer && !suspended) timer = setTimeout(scan, 150); };
  const mutations = new MutationObserver(schedule);
  mutations.observe(document.documentElement, { childList: true, subtree: true,
    attributes: true, attributeFilter: ['id', 'permalink', 'content-href', 'providername'] });
  addEventListener('popstate', schedule);
  function suspend() {
    suspended = true;
    clearTimeout(timer);
    timer = undefined;
    for (const controller of active.values()) controller.destroy();
    active.clear();
    failures.clear();
  }
  function resume() { if (runtimeAvailable()) { suspended = false; schedule(); } }
  function updateVisibility() {
    if (!runtimeAvailable()) return;
    for (const controller of active.values()) controller.updateVisibility();
    pump();
  }
  addEventListener('pagehide', suspend);
  addEventListener('pageshow', resume);
  document.addEventListener('visibilitychange', updateVisibility);
  function receive(message, sender) {
    if (!runtimeAvailable() || sender.id !== chrome.runtime.id || message?.type !== 'stash:use-reddit-preview' ||
        message.pageURL !== redditPageURL(location.href) || typeof message.gifId !== 'string' || !/^[a-z0-9]+$/.test(message.gifId)) return;
    scan();
    if (stopped) return;
    failures.add(message.gifId);
    // Bound metadata on very long feeds; mounted failures will be reported again on the next handshake.
    if (failures.size > 512) failures.delete(failures.values().next().value);
    pump();
  }
  try { if (runtimeAvailable()) chrome.runtime.onMessage.addListener(receive); }
  catch (error) { handleRuntimeError(error); }
  scan();
})();
