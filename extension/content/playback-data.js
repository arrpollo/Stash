(() => {
  'use strict';
  const validId = value => typeof value === 'string' && /^[a-z0-9]{3,16}$/.test(value);
  function postId(path) {
    return /^\/(?:r\/[A-Za-z0-9_]+\/)?comments\/([a-z0-9]{3,16})(?:\/|$)/.exec(path)?.[1] || '';
  }
  function redgifsURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && ['redgifs.com', 'www.redgifs.com'].includes(url.hostname) &&
        !url.username && !url.password && !url.port && /^\/(watch|ifr)\/[a-z0-9]+\/?$/i.test(url.pathname);
    } catch { return false; }
  }
  function videoURL(value) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    try {
      const url = new URL(value.replace(/&amp;/g, '&'));
      if (url.protocol !== 'https:' || url.hostname !== 'v.redd.it' || url.username || url.password || url.port ||
          !/^\/[a-z0-9]+\/[A-Za-z0-9_-]+\.mp4$/.test(url.pathname)) return '';
      return url.href;
    } catch { return ''; }
  }
  function gifId(value) {
    return redgifsURL(value) ? new URL(value).pathname.split('/')[2].toLowerCase() : '';
  }
  function redditPageURL(value) {
    try {
      const url = new URL(value);
      return url.origin === 'https://www.reddit.com' && !url.username && !url.password ?
        `${url.origin}${url.pathname}${url.search}` : '';
    } catch { return ''; }
  }
  function failureReport(sender, extensionId) {
    if (sender?.id !== extensionId || !Number.isInteger(sender.frameId) || sender.frameId <= 0 ||
        !Number.isInteger(sender.tab?.id) || sender.tab.id < 0 ||
        (sender.documentLifecycle && sender.documentLifecycle !== 'active')) return null;
    const pageURL = redditPageURL(sender.tab.url);
    const gif = gifId(sender.url);
    if (!pageURL || !gif || !new URL(sender.url).pathname.startsWith('/ifr/')) return null;
    return { pageURL, gifId: gif };
  }
  function previewFromListing(listing, expectedId, expectedGif = '') {
    if (!validId(expectedId) || !Array.isArray(listing)) return null;
    const children = listing[0]?.data?.children;
    if (!Array.isArray(children)) return null;
    const data = children.find(child => child?.kind === 't3' && child.data?.id === expectedId)?.data;
    if (!data || !redgifsURL(data.url_overridden_by_dest || data.url)) return null;
    if (expectedGif && gifId(data.url_overridden_by_dest || data.url) !== expectedGif) return null;
    const preview = data.preview?.reddit_video_preview;
    if (!preview || preview.transcoding_status !== 'completed') return null;
    const src = videoURL(preview.fallback_url);
    if (!src) return null;
    return { src, isGif: preview.is_gif === true, hasAudio: preview.has_audio === true };
  }
  // Shared only between Stash's isolated content scripts; no saved-library access.
  globalThis.StashRedditPlayback = Object.freeze({ postId, redgifsURL, videoURL, previewFromListing, gifId, redditPageURL, failureReport });
})();
