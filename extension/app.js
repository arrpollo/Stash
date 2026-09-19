import { emptyLibrary, filterItems, communities, mergeSync, parseBackup, mergeBackup, backupText } from './lib/model.js';
import { RedditClient } from './lib/reddit.js';
import { readLibrary, saveLibrary, readSettings, saveSettings, isExtension } from './lib/store.js';
import { demoLibrary } from './lib/demo.js';
import { icon, hydrateIcons } from './lib/icons.js';
import { appearanceSettings, applyAppearance, READING_FONTS, TITLE_FONTS } from './lib/appearance.js';

const $ = id => document.getElementById(id);
const titles = { all: 'All saved', favorites: 'Favorites', unread: 'To read', read: 'Finished' };
const headings = { all: 'Saved for a reason', favorites: 'The really good finds', unread: 'A little food for thought', read: 'Curiosity, satisfied' };
const descriptions = { all: 'All those good finds. Finally, a place to find them again.', favorites: 'The ones you keep coming back to. A collection within your collection.', unread: 'Make a little room for the things that caught your eye.', read: 'Good ideas, taken in. Revisit them whenever you like.' };
const state = { library: emptyLibrary(), demo: false, busy: false, query: '', subs: [], subQuery: '', view: 'all', kind: 'all', sort: 'saved', layout: 'grid', page: 0, visibleCount: 30 };
let settings = {}, controller, toastTimer;
let settingsWrites = Promise.resolve(), resultWindowKey = '', currentResults = [], moreObserver;
const revealedPreviews = new Set();
const compact = n => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const date = n => n ? new Date(n * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
const e = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), event => run(() => value(event)));
    else node.setAttribute(key, String(value));
  }
  node.append(...children.flat().filter(child => child !== null && child !== undefined));
  return node;
};
const button = (label, action, cls = 'button secondary', ico) => e('button', { class: cls, onClick: action }, ico ? icon(ico) : null, label);
function run(fn) { Promise.resolve().then(fn).catch(reportError); }
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function notice(message, error = false, action) {
  $('notice').className = 'notice' + (error ? ' error' : '');
  $('notice').replaceChildren(e('span', {}, message), ...(action ? [action] : []));
  $('notice').hidden = !message;
}
function reportError(error) {
  if (error?.name === 'AbortError') return toast('Sync canceled. Your saved library is unchanged.');
  const message = error?.message || 'Something went wrong. Please try again.';
  if ($('modal').open) toast(message);
  notice(message, true);
}
function resetFilters() {
  state.query = ''; state.subs = []; state.kind = 'all'; state.page = 0;
  $('search').value = ''; $('kind').value = 'all'; render();
}
function subredditColors(name) {
  let hash = 0; for (const c of name.toLowerCase()) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const palettes = [['#e6e9db','#78805b'],['#f0e2d8','#a07357'],['#e1e8eb','#66848c'],['#e9e2ee','#8b7198'],['#eee9d2','#9b8b4c'],['#e1e9dc','#748a60']];
  return palettes[Math.abs(hash) % palettes.length];
}
function initial(name) {
  const node = e('span', { class: 'sub-initial', 'aria-hidden': 'true' }, name.slice(0, 1).toLowerCase());
  const [tint, tone] = subredditColors(name);
  node.style.setProperty('--tint', tint); node.style.setProperty('--tone', tone);
  return node;
}
function toggleSub(name) {
  state.subs = state.subs.includes(name) ? state.subs.filter(s => s !== name) : [...state.subs, name];
  state.page = 0; render();
}
function mediaPreview(p, detail = false) {
  if (!settings.showThumbnails || !p.media?.thumbnail) return null;
  const labels = { image: 'Image', gif: 'GIF', video: 'Video', gallery: p.media.count + ' images', link: 'Link preview' };
  const label = labels[p.media.type] || 'Image';
  const needsReveal = () => (p.spoiler || (p.nsfw && !settings.showNsfwThumbnails)) && !revealedPreviews.has(p.id);
  const wrapper = e(detail ? 'div' : 'button', { class: 'post-media' + (detail ? ' detail-media' : ''),
    ...(detail ? {} : { 'aria-label': 'Preview ' + label.toLowerCase() + ': ' + p.title, onClick: () => {
      if (needsReveal()) { revealedPreviews.add(p.id); fill(); }
      else openDetail(p.id);
    } }) });
  function fill() {
    if (needsReveal()) {
      const reason = p.nsfw && !settings.showNsfwThumbnails ? 'NSFW' : 'Spoiler';
      const hidden = e('span', { class: 'preview-hidden' }, icon('shield'), reason + ' · Show preview');
      wrapper.replaceChildren(detail ? button('Show ' + reason + ' preview', () => { revealedPreviews.add(p.id); fill(); }) : hidden);
      return;
    }
    const img = e('img', { src: p.media.thumbnail, alt: 'Preview of ' + p.title, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
      onError: () => wrapper.replaceChildren(e('span', { class: 'preview-hidden' }, icon('image'), 'Preview unavailable')) });
    wrapper.replaceChildren(img, e('span', { class: 'media-badge' }, icon(p.media.type === 'video' || p.media.type === 'gif' ? 'play' : 'image'), label));
  }
  fill();
  return wrapper;
}
function renderSidebar() {
  const items = state.library.items;
  const counts = { all: items.length, favorites: items.filter(p => p.favorite).length, unread: items.filter(p => !p.read).length, read: items.filter(p => p.read).length };
  for (const [view, id] of Object.entries({ all: 'all-count', favorites: 'favorite-count', unread: 'unread-count', read: 'read-count' })) $(id).textContent = counts[view].toLocaleString();
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', state.view === b.dataset.view); b.setAttribute('aria-pressed', String(state.view === b.dataset.view)); });
  const subs = communities(items);
  $('sub-count').textContent = subs.length;
  const shown = subs.filter(s => s.name.toLowerCase().includes(state.subQuery.toLowerCase().replace(/^r\//, '')));
  $('sub-list').replaceChildren(...shown.map(s => e('button', { class: 'sub-item' + (state.subs.includes(s.name) ? ' active' : ''), 'aria-pressed': state.subs.includes(s.name), 'aria-label': 'Filter r/' + s.name, onClick: () => toggleSub(s.name) }, initial(s.name), e('span', { class: 'sub-name' }, 'r/' + s.name), e('span', { class: 'count' }, s.count.toLocaleString()))));
  if (!shown.length) $('sub-list').append(e('p', { class: 'side-empty' }, subs.length ? 'No matching communities.' : 'Your communities will appear here.'));
  $('account-name').textContent = state.demo ? 'Sample library' : state.library.account ? 'u/' + state.library.account : 'Your personal Stash';
  $('account-status').textContent = state.demo ? 'Try it. Make yourself at home.' : state.library.account ? 'Saved on this device' : 'Ready when you are';
  $('avatar').textContent = state.demo ? 's' : (state.library.account || 's')[0].toLowerCase();
}
function postCard(p) {
  const favorite = e('button', { class: 'icon-button' + (p.favorite ? ' starred' : ''), title: p.favorite ? 'Remove from favorites' : 'Add to favorites', 'aria-label': (p.favorite ? 'Unfavorite: ' : 'Favorite: ') + p.title, 'aria-pressed': p.favorite, onClick: () => toggleItem(p.id, 'favorite') }, icon('star'));
  const read = e('button', { class: 'icon-button read-button' + (p.read ? ' is-read' : ''), title: p.read ? 'Mark as unread' : 'Mark as read', 'aria-label': (p.read ? 'Mark as unread: ' : 'Mark as read: ') + p.title, 'aria-pressed': p.read, onClick: () => toggleItem(p.id, 'read') }, icon(p.read ? 'check' : 'book'));
  return e('article', { class: 'post-card' + (p.read ? ' finished' : ''), 'data-id': p.id },
    e('div', { class: 'card-top' },
      e('button', { class: 'card-community', onClick: () => toggleSub(p.subreddit), 'aria-label': 'Toggle subreddit r/' + p.subreddit }, initial(p.subreddit), e('span', { class: 'sub-name' }, 'r/' + p.subreddit)), favorite),
    mediaPreview(p),
    e('div', { class: 'card-content' },
      e('div', { class: 'post-kind' }, icon(p.kind === 'comment' ? 'comment' : 'bookmark'), p.kind === 'comment' ? 'Saved comment' : 'Saved post',
        p.flair ? e('span', { class: 'flair' }, p.flair) : null, p.nsfw ? e('span', { class: 'flair nsfw' }, 'NSFW') : null),
      e('h2', { class: 'post-title' }, e('button', { onClick: () => openDetail(p.id) }, p.title)),
      e('p', { class: 'post-excerpt' + (p.kind === 'comment' ? ' comment-excerpt' : '') }, p.body || 'A good find, kept for later. Open on Reddit to see the original post.'),
      p.cachedOnly ? e('div', { class: 'cached-badge', title: 'Retained locally; not returned in the latest Reddit sync. It may be older or unsaved on Reddit.' }, icon('clock'), 'Previously cached') : null),
    e('div', { class: 'card-author' }, 'u/' + p.author + '  ·  Posted ' + date(p.created)),
    e('div', { class: 'card-footer' }, e('span', { title: p.score + ' score' }, icon('up'), compact(p.score)),
      p.kind === 'post' ? e('span', { title: p.comments + ' comments' }, icon('comment'), compact(p.comments)) : null, read,
      e('a', { class: 'icon-button open-button', href: p.permalink, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open on Reddit: ' + p.title, title: 'Open on Reddit', onClick: event => { if (state.demo) { event.preventDefault(); toast('These are sample posts. Connect Reddit to open your own saves.'); } } }, icon('external'))));
}
function render() {
  moreObserver?.disconnect();
  renderSidebar();
  const hasLibrary = state.library.account !== null || state.demo;
  $('welcome').hidden = hasLibrary; $('welcome-features').hidden = hasLibrary; $('library-section').hidden = !hasLibrary;
  $('page-title').replaceChildren(headings[state.view], e('span', {}, '.'));
  $('page-description').textContent = descriptions[state.view]; $('breadcrumb').textContent = titles[state.view];
  $('mode-label').textContent = state.demo ? 'SAMPLE LIBRARY' : 'LOCAL & PRIVATE'; $('mode-label').classList.toggle('demo', state.demo);
  $('sync-label').textContent = state.busy ? 'Cancel sync' : state.demo ? 'Use my Reddit account' : 'Sync Reddit';
  $('sync-btn').classList.toggle('spinning', state.busy);
  if (!hasLibrary) return;
  $('total-items').textContent = state.library.items.length.toLocaleString();
  $('total-subs').textContent = communities(state.library.items).length;
  $('last-sync').textContent = state.demo ? 'Sample posts · explore freely' : state.library.lastSync ? 'Synced ' + new Date(state.library.lastSync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Stored on this device';
  const pageSize = settings.pageSize;
  const key = JSON.stringify([state.query, state.subs, state.view, state.kind, state.sort, settings.browsingMode, pageSize]);
  if (key !== resultWindowKey) {
    resultWindowKey = key; state.page = 0; state.visibleCount = pageSize;
  }
  const filtered = filterItems(state.library.items, state);
  currentResults = filtered;
  const scrolling = settings.browsingMode === 'scroll';
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); state.page = Math.min(state.page, pages - 1);
  $('result-count').textContent = filtered.length.toLocaleString() + (filtered.length === 1 ? ' saved item' : ' saved items');
  $('filter-chips').replaceChildren(...state.subs.map(sub => button('r/' + sub, () => toggleSub(sub), 'chip', 'close')));
  $('clear-filters').hidden = !state.query && !state.subs.length && state.kind === 'all';
  $('posts').classList.toggle('list', state.layout === 'list');
  state.visibleCount = Math.min(filtered.length, Math.max(pageSize, state.visibleCount));
  $('posts').replaceChildren(...(scrolling ? filtered.slice(0, state.visibleCount) : filtered.slice(state.page * pageSize, (state.page + 1) * pageSize)).map(postCard));
  $('empty-results').hidden = filtered.length > 0;
  $('empty-description').textContent = state.view === 'favorites' ? 'Star a saved item to keep your best finds close.' : state.view === 'read' ? 'Mark an item as read and it will be waiting here.' : state.view === 'unread' && state.library.items.length ? 'You’re all caught up, or your filters need a little room.' : 'Try a different search or give your filters a little room.';
  $('reset-btn').textContent = 'Show all saved';
  $('pagination').hidden = scrolling || pages <= 1; $('page-count').textContent = 'Page ' + (state.page + 1) + ' of ' + pages;
  $('previous-btn').disabled = state.page === 0; $('next-btn').disabled = state.page === pages - 1;
  for (const layout of ['grid', 'list']) { $(layout + '-btn').classList.toggle('active', state.layout === layout); $(layout + '-btn').setAttribute('aria-pressed', state.layout === layout); }
  updateScrollControls();
}
function updateScrollControls() {
  moreObserver?.disconnect();
  const scrolling = settings.browsingMode === 'scroll';
  const more = state.visibleCount < currentResults.length;
  $('scroll-controls').hidden = !scrolling || !currentResults.length;
  $('load-more').hidden = !more;
  $('scroll-count').textContent = more ? 'Showing ' + state.visibleCount + ' of ' + currentResults.length + ' items' : 'All ' + currentResults.length + ' matching items shown';
  if (scrolling && more && !$('modal').open) moreObserver?.observe($('load-more-sentinel'));
}
function loadMore() {
  if (settings.browsingMode !== 'scroll' || $('modal').open || state.visibleCount >= currentResults.length) return;
  moreObserver?.disconnect();
  const next = Math.min(currentResults.length, state.visibleCount + settings.pageSize);
  // Append new cards, preserving existing image loads, focus, and scroll position.
  $('posts').append(...currentResults.slice(state.visibleCount, next).map(postCard));
  state.visibleCount = next;
  updateScrollControls();
}
async function exclusive(fn) {
  return navigator.locks.request('stash-library-write', { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('Stash is updating in another tab. Please wait for it to finish.');
    return fn();
  });
}
async function updateLibrary(transform) {
  if (state.busy) throw new Error('Let the sync finish, or cancel it first.');
  if (state.demo) { state.library = transform(state.library); render(); return; }
  await exclusive(async () => { const next = transform(await readLibrary()); await saveLibrary(next); state.library = next; });
  render();
}
async function toggleItem(id, field) {
  await updateLibrary(lib => ({ ...lib, items: lib.items.map(p => p.id === id ? { ...p, [field]: !p[field] } : p) }));
}
function showModal(title, content) {
  moreObserver?.disconnect();
  $('modal-title').textContent = title; $('modal-content').replaceChildren(content);
  if (!$('modal').open) $('modal').showModal();
}
function openDetail(id) {
  const p = state.library.items.find(p => p.id === id); if (!p) return;
  const openLink = e('a', { class: 'button primary', href: p.permalink, target: '_blank', rel: 'noopener noreferrer', onClick: event => { if (state.demo) { event.preventDefault(); toast('This is a sample post. Connect Reddit to view your real saves.'); } } }, 'Open on Reddit', icon('external'));
  const content = e('div', {}, e('div', { class: 'detail-meta' }, 'r/' + p.subreddit, '·', 'u/' + p.author, '·', 'Posted ' + date(p.created)),
    mediaPreview(p, true),
    p.cachedOnly ? e('p', { class: 'modal-copy' }, 'Previously cached: Reddit did not return this item in the latest sync. It may be older or no longer saved on Reddit.') : null,
    e('div', { class: 'detail-body' }, p.body || 'This post has no text preview. Open it on Reddit to see the link, image, or video.'),
    e('div', { class: 'modal-actions' }, openLink, button(p.read ? 'Mark unread' : 'Mark as read', async () => { await toggleItem(id, 'read'); openDetail(id); }, 'button secondary', 'check'),
      button('Unsave', () => confirmUnsave(id), 'button danger')));
  showModal(p.title, content);
}
function confirmUnsave(id) {
  const p = state.library.items.find(p => p.id === id); if (!p) return;
  showModal('Remove this save?', e('div', { class: 'modal-copy' },
    e('p', {}, state.demo ? 'This removes a sample item for this preview only.' : 'This will unsave the item on Reddit and remove its local copy, including its favorite and reading status.'),
    e('p', {}, e('strong', {}, p.title)),
    e('div', { class: 'modal-actions' }, button('Keep it', () => openDetail(id)), button('Unsave from Reddit', event => doUnsave(id, event.currentTarget), 'button danger'))));
}
async function doUnsave(id, control) {
  if (state.busy) return toast('Finish or cancel the sync first.');
  control.disabled = true;
  try {
    if (state.demo) await updateLibrary(lib => ({ ...lib, items: lib.items.filter(p => p.id !== id) }));
    else await exclusive(async () => {
      const lib = await readLibrary();
      if (!lib.items.some(p => p.id === id)) throw new Error('This item has already been removed.');
      await new RedditClient({ origin: settings.origin }).unsave(id, lib.account);
      const next = { ...lib, items: lib.items.filter(p => p.id !== id) };
      await saveLibrary(next); state.library = next; render();
    });
    $('modal').close(); toast('Removed from your saves.');
  } finally { control.disabled = false; }
}
async function sync() {
  if (state.busy) { controller?.abort(); return; }
  if (!isExtension) return showInstall();
  await exclusive(async () => {
    clearDemoURL();
    state.demo = false; state.library = await readLibrary(); state.busy = true; controller = new AbortController(); render();
    const signal = controller.signal;
    notice('Connecting to your Reddit account…');
    try {
      const client = new RedditClient({ origin: settings.origin });
      const account = await client.identity(signal);
      if (state.library.account && state.library.account.toLowerCase() !== account.name.toLowerCase()) throw new Error('This library belongs to u/' + state.library.account + '. Switch back to that Reddit account, or export and clear this library in Settings first.');
      let skipped = 0;
      const fetched = await client.saved(account.name, { signal, onProgress: (count, details) => {
        skipped = details.skipped;
        notice('Bringing in your saves… ' + count.toLocaleString() + ' items found.' + (skipped ? ' Skipped ' + skipped + ' unreadable entries.' : '') + ' Keep this tab open.');
      } });
      const finalAccount = await client.identity(signal);
      if (finalAccount.name.toLowerCase() !== account.name.toLowerCase()) throw new Error('Your Reddit account changed during sync. Your library is unchanged; please retry.');
      signal.throwIfAborted();
      const next = mergeSync(await readLibrary(), fetched, account.name);
      next.lastSyncSkipped = skipped;
      await saveLibrary(next); state.library = next;
      const retained = next.items.filter(p => p.cachedOnly).length;
      notice('Fetched ' + fetched.length.toLocaleString() + ' items from Reddit.' + (retained ? ' Kept ' + retained + ' previously cached items.' : '') + (skipped ? ' Skipped ' + skipped + ' entries with missing or unsupported data.' : '') + ' Reddit may not expose your entire saved history.', false, button('Learn more', showHelp, 'text-button'));
      toast(skipped ? 'Sync finished with ' + skipped + ' skipped entries. See the sync summary.' : 'Your Stash is up to date.');
    } catch (err) {
      if (signal.aborted) notice('Sync canceled. Your saved library is unchanged.');
      else reportError(err);
    } finally { state.busy = false; controller = null; render(); }
  });
}
function showInstall() {
  showModal('Make Stash yours', e('div', { class: 'modal-copy' },
    e('p', {}, 'You’re viewing the browser preview. To connect your Reddit account, load Stash as a Chrome extension:'),
    e('ol', {}, e('li', {}, 'Open chrome://extensions in Chrome.'), e('li', {}, 'Turn on Developer mode in the top right.'), e('li', {}, 'Choose “Load unpacked” and select the extension folder in this project.'), e('li', {}, 'Sign in to Reddit in the same Chrome profile, click the Stash extension icon, then Sync Reddit.')),
    e('p', {}, 'No build step, API key, or Stash account is needed.'))); 
}
function showHelp() {
  showModal('A place for your good finds', e('div', { class: 'modal-copy' },
    e('h3', {}, 'Bring in your library'), e('p', {}, 'Sign in to Reddit in this Chrome profile, then choose Sync Reddit. Keep the Stash tab open while it fetches each page. Search and reading work offline after a successful sync.'),
    e('h3', {}, 'A subreddit, or a few'), e('p', {}, 'Click communities in the sidebar to combine them. Search matches titles, post and comment text, authors, and subreddit names. Favorites and reading status stay in Stash; use Unsave to remove an item from Reddit.'),
    e('h3', {}, 'About older saves'), e('p', {}, 'Reddit limits the history it returns. Stash fetches every page Reddit makes available, but cannot guarantee every past save. “Recently saved” follows Reddit’s listing order; Reddit does not provide exact saved dates.'),
    e('p', {}, 'Profile posts are supported too. If Reddit returns an entry without enough usable data, Stash skips it and reports the number skipped. Previously cached copies stay in your library.'),
    e('p', {}, 'Items missing from a later sync are retained as “Previously cached.” They may be older or unsaved elsewhere. Their position follows freshly fetched items. Importing a Stash backup merges it locally and never re-saves anything to Reddit.'),
    e('h3', {}, 'Your library stays here'), e('p', {}, 'Your library and settings are stored in this Chrome profile. Fonts are included, with no analytics, hosted backend, or remote scripts. Optional thumbnails load directly from Reddit’s image servers when enabled. The extension uses your existing Reddit session for sync; Reddit can restrict this access, but your cached text and backups still work. Clearing Chrome extension data or uninstalling Stash removes its local library. Export a backup to keep a copy.'),
    e('div', { class: 'modal-actions' }, button('Settings & backups', showSettings), button('Got it', () => $('modal').close(), 'button primary'))));
}
function showSettings() {
  const origin = e('select', { 'aria-label': 'Reddit connection', onChange: async event => { await updatePreferences({ origin: event.target.value }); toast('Reddit connection updated.'); } },
    e('option', { value: 'https://www.reddit.com' }, 'Reddit (www.reddit.com)'), e('option', { value: 'https://old.reddit.com' }, 'Old Reddit (old.reddit.com)'));
  origin.value = settings.origin || 'https://www.reddit.com';
  showModal('Your Stash, your way', e('div', { class: 'modal-copy' },
    appearanceControls(),
    browsingControls(),
    e('section', { class: 'settings-block' }, e('h3', {}, 'Keep a copy'), e('p', {}, 'Export all cached posts, comments, favorites, and reading status. Import a Stash JSON backup to merge items for the same Reddit account.'),
      e('div', { class: 'modal-actions' }, button('Export backup', exportBackup, 'button secondary', 'download'), button('Import backup', () => { if (state.demo) return toast('Leave the sample library before importing your backup.'); if (state.busy) return toast('Finish or cancel sync first.'); $('import-file').click(); }))),
    e('section', { class: 'settings-block' }, e('h3', {}, 'Reddit connection'), e('p', {}, 'Stash uses the account signed in to Reddit in this Chrome profile. Choose the version you use, and open it to confirm you are signed in.'), origin,
      e('div', { class: 'modal-actions' }, e('a', { class: 'button secondary', href: settings.origin || 'https://www.reddit.com', target: '_blank', rel: 'noopener noreferrer' }, 'Open Reddit', icon('external')))),
    e('section', {}, e('h3', {}, 'Start fresh'), e('p', {}, 'Clear this device’s library to switch Reddit accounts. This does not unsave anything on Reddit. Export a backup first if you want to keep your local favorites and reading status.'),
      button(state.demo ? 'Leave sample library' : 'Clear local library', state.demo ? leaveDemo : confirmClear, 'button danger'))));
}
function appearanceControls() {
  const output = e('output', { id: 'display-size-value', for: 'display-size' }, settings.displayScale + '%');
  const slider = e('input', { id: 'display-size', type: 'range', min: 100, max: 200, step: 5, value: settings.displayScale,
    'aria-describedby': 'display-size-hint', 'aria-valuetext': settings.displayScale + '%',
    onInput: event => preview({ displayScale: Number(event.target.value) }),
    onChange: () => persist()
  });
  const fontSelect = e('select', { id: 'title-font', onChange: async event => { preview({ titleFont: event.target.value }); await persist(); } },
    ...TITLE_FONTS.map(([value, label]) => e('option', { value }, label)));
  fontSelect.value = settings.titleFont;
  const readingSelect = e('select', { id: 'reading-font', onChange: async event => { preview({ readingFont: event.target.value }); await persist(); } },
    ...READING_FONTS.map(([value, label]) => e('option', { value }, label)));
  readingSelect.value = settings.readingFont;
  const presets = e('div', { class: 'size-presets', 'aria-label': 'Display size presets' },
    ...[100, 125, 150, 175, 200].map(scale => e('button', {
      class: 'size-preset', 'data-scale': scale, 'aria-pressed': settings.displayScale === scale,
      onClick: async () => { preview({ displayScale: scale }); await persist(); }
    }, scale + '%')));
  function preview(patch) {
    settings = appearanceSettings({ ...settings, ...patch });
    applyAppearance(settings);
    output.value = settings.displayScale + '%';
    slider.value = settings.displayScale;
    slider.setAttribute('aria-valuetext', settings.displayScale + '%');
    fontSelect.value = settings.titleFont;
    readingSelect.value = settings.readingFont;
    presets.querySelectorAll('[data-scale]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.scale) === settings.displayScale));
  }
  async function persist() {
    await updatePreferences({ displayScale: settings.displayScale, titleFont: settings.titleFont, readingFont: settings.readingFont });
  }
  return e('section', { class: 'settings-block appearance-settings' },
    e('h3', {}, 'Make yourself comfortable'),
    e('p', { id: 'display-size-hint' }, 'Enlarge text, buttons, and the sidebar together. Try 150% on a large monitor. Changes preview instantly and save automatically.'),
    e('div', { class: 'setting-label-row' }, e('label', { for: 'display-size' }, 'Display size'), output),
    slider, presets,
    e('label', { class: 'setting-label', for: 'reading-font' }, 'Reading font'), readingSelect,
    e('p', { class: 'setting-hint' }, 'For post text, menus, and buttons. Try Atkinson Hyperlegible or Lexend; both are included and work offline.'),
    e('label', { class: 'setting-label', for: 'title-font' }, 'Post title font'), fontSelect,
    e('div', { class: 'reading-preview' }, e('span', { class: 'eyebrow' }, 'READING PREVIEW'),
      e('div', { class: 'preview-title' }, 'A good idea, a little easier to read.'),
      e('p', {}, 'Your saved posts, at a size that feels right for you.')),
    button('Reset display settings', async () => { preview({ displayScale: 100, titleFont: 'serif', readingFont: 'system' }); await persist(); }, 'text-button'));
}
function browsingControls() {
  const mode = e('select', { id: 'browsing-mode', onChange: event => updatePreferences({ browsingMode: event.target.value }) },
    e('option', { value: 'pages' }, 'Pages · previous and next'), e('option', { value: 'scroll' }, 'Continuous scrolling · load as I scroll'));
  mode.value = settings.browsingMode;
  const size = e('select', { id: 'page-size', onChange: event => updatePreferences({ pageSize: Number(event.target.value) }) },
    ...[15, 30, 60, 100].map(value => e('option', { value }, String(value) + ' posts')));
  size.value = settings.pageSize;
  const thumbnails = e('input', { type: 'checkbox', id: 'show-thumbnails',
    onChange: async event => {
      await updatePreferences({ showThumbnails: event.target.checked });
      if (settings.showThumbnails) toast('Thumbnails enabled. Sync Reddit once to add previews to older saves.');
    } });
  thumbnails.checked = settings.showThumbnails;
  const nsfwThumbnails = e('input', { type: 'checkbox', id: 'show-nsfw-thumbnails',
    onChange: event => updatePreferences({ showNsfwThumbnails: event.target.checked }) });
  nsfwThumbnails.checked = settings.showNsfwThumbnails;
  nsfwThumbnails.disabled = !settings.showThumbnails;
  return e('section', { class: 'settings-block browsing-settings' },
    e('h3', {}, 'Browse your way'),
    e('label', { class: 'setting-label', for: 'browsing-mode' }, 'Browsing style'), mode,
    e('p', { class: 'setting-hint' }, 'Continuous scrolling adds more of your synced saves as you approach the bottom. Your filters still apply.'),
    e('label', { class: 'setting-label', for: 'page-size' }, 'Posts per page or scroll batch'), size,
    e('label', { class: 'checkbox-setting', for: 'show-thumbnails' }, thumbnails,
      e('span', {}, e('strong', {}, 'Show media thumbnails'), e('span', {}, 'Small previews for images, galleries, GIFs, and videos.'))),
    e('label', { class: 'checkbox-setting', for: 'show-nsfw-thumbnails' }, nsfwThumbnails,
      e('span', {}, e('strong', {}, 'Show NSFW thumbnails'), e('span', {}, 'Off by default. Show previews marked “Not Safe For Work” without revealing each one. Requires media thumbnails to be on.'))),
    e('p', { class: 'setting-hint' }, 'Previews load from Reddit’s image servers when visible. GIFs and videos use a still image. Spoiler previews require a click to reveal. Sync once after updating to collect available thumbnails.'));
}
function browsingKey(value) {
  return JSON.stringify([value.browsingMode, value.pageSize, value.showThumbnails, value.showNsfwThumbnails]);
}
function refreshSettingsControls() {
  if ($('display-size')) {
    $('display-size').value = settings.displayScale;
    $('display-size').setAttribute('aria-valuetext', settings.displayScale + '%');
    $('display-size-value').value = settings.displayScale + '%';
    $('title-font').value = settings.titleFont;
    $('reading-font').value = settings.readingFont;
    document.querySelectorAll('[data-scale]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.scale) === settings.displayScale));
  }
  if ($('browsing-mode')) {
    $('browsing-mode').value = settings.browsingMode;
    $('page-size').value = settings.pageSize;
    $('show-thumbnails').checked = settings.showThumbnails;
    $('show-nsfw-thumbnails').checked = settings.showNsfwThumbnails;
    $('show-nsfw-thumbnails').disabled = !settings.showThumbnails;
  }
}
function applyPreferences(next) {
  const before = browsingKey(settings);
  const previous = settings;
  settings = appearanceSettings(next);
  if ((previous.showThumbnails && !settings.showThumbnails) || (previous.showNsfwThumbnails && !settings.showNsfwThumbnails)) revealedPreviews.clear();
  applyAppearance(settings);
  refreshSettingsControls();
  if (before !== browsingKey(settings)) render();
}
async function updatePreferences(patch) {
  applyPreferences({ ...settings, ...patch });
  // Serialize writes so quick changes cannot overwrite one another.
  settingsWrites = settingsWrites.catch(() => {}).then(async () => {
    await saveSettings({ ...await readSettings(), ...patch });
  });
  await settingsWrites;
}
async function exportBackup() {
  if (state.demo) return toast('Sample posts are for preview only. Connect Reddit to back up your library.');
  if (!state.library.account) return toast('Sync Reddit or import a backup first.');
  const url = URL.createObjectURL(new Blob([backupText(state.library)], { type: 'application/json' }));
  const link = e('a', { href: url, download: 'stash-' + state.library.account + '-' + new Date().toISOString().slice(0, 10) + '.json' });
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('Backup download started.');
}
function confirmClear() {
  if (state.busy) return toast('Finish or cancel sync first.');
  showModal('Clear your local library?', e('div', { class: 'modal-copy' },
    e('p', {}, 'This removes all cached items, favorites, and reading status from this browser. Your Reddit saves are unchanged.'),
    e('div', { class: 'modal-actions' }, button('Keep my library', showSettings), button('Export first', exportBackup), button('Clear local library', async () => { await updateLibrary(emptyLibrary); resetFilters(); notice(''); $('modal').close(); toast('Local library cleared.'); }, 'button danger'))));
}
async function importFile(event) {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (!isExtension) return showInstall();
  if (file.size > 50 * 1024 * 1024) throw new Error('Choose a backup smaller than 50 MB.');
  const imported = parseBackup(await file.text());
  await updateLibrary(current => mergeBackup(current, imported));
  $('modal').close(); notice('Backup merged locally. Imported items are labeled “Previously cached” until found in a Reddit sync.'); toast('Backup imported.');
}
function clearDemoURL() {
  const url = new URL(location.href);
  if (url.searchParams.has('demo')) {
    url.searchParams.delete('demo');
    history.replaceState(null, '', url);
  }
}
async function leaveDemo() {
  clearDemoURL();
  state.demo = false; state.library = await readLibrary(); state.view = 'all'; resetFilters(); notice(''); $('modal').close();
}
function startDemo() {
  if (state.busy) return;
  state.demo = true; state.library = demoLibrary(); resetFilters();
  notice('A little look around: these are fictional sample posts. Your Reddit account is untouched.', false, button('Leave preview', leaveDemo, 'text-button'));
}
function listen(id, event, fn) { $(id).addEventListener(event, ev => run(() => fn(ev))); }
async function init() {
  hydrateIcons();
  [state.library, settings] = await Promise.all([readLibrary(), readSettings()]);
  settings = appearanceSettings(settings);
  applyAppearance(settings);
  if (!['https://www.reddit.com', 'https://old.reddit.com'].includes(settings.origin)) settings.origin = 'https://www.reddit.com';
  state.layout = settings.layout === 'list' ? 'list' : 'grid';
  moreObserver = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) loadMore(); }, { rootMargin: '400px 0px' });
  listen('load-more', 'click', loadMore);
  listen('modal', 'close', updateScrollControls);
  listen('sync-btn', 'click', sync); listen('connect-btn', 'click', sync); listen('demo-btn', 'click', startDemo);
  listen('search', 'input', event => { state.query = event.target.value; state.page = 0; render(); });
  listen('sub-search', 'input', event => { state.subQuery = event.target.value; renderSidebar(); });
  listen('kind', 'change', event => { state.kind = event.target.value; state.page = 0; render(); });
  listen('sort', 'change', event => { state.sort = event.target.value; state.page = 0; render(); });
  listen('views', 'click', event => { const target = event.target.closest('[data-view]'); if (target) { state.view = target.dataset.view; state.page = 0; render(); } });
  listen('clear-filters', 'click', resetFilters);
  listen('reset-btn', 'click', () => { state.view = 'all'; resetFilters(); });
  for (const layout of ['grid', 'list']) listen(layout + '-btn', 'click', async () => { state.layout = layout; render(); if (!state.demo) await updatePreferences({ layout }); });
  for (const [name, direction] of [['previous', -1], ['next', 1]]) listen(name + '-btn', 'click', () => { state.page += direction; render(); $('search').scrollIntoView({ block: 'start', behavior: 'instant' }); });
  listen('help-btn', 'click', showHelp); listen('settings-btn', 'click', showSettings); listen('display-btn', 'click', showSettings); listen('close-modal', 'click', () => $('modal').close()); listen('import-file', 'change', importFile);
  document.addEventListener('keydown', event => { if (event.key === '/' && !$('modal').open && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !event.metaKey && !event.ctrlKey) { event.preventDefault(); $('search').focus(); } });
  window.addEventListener('beforeunload', event => { if (state.busy) { event.preventDefault(); event.returnValue = ''; } });
  if (isExtension) chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      applyPreferences(changes.settings.newValue || {});
    }
    if (area === 'local' && changes.library && !state.demo && !state.busy) { state.library = changes.library.newValue || emptyLibrary(); render(); }
  });
  render();
  if (state.library.lastSyncSkipped) notice('Last sync skipped ' + state.library.lastSyncSkipped + ' entries with missing or unsupported data. Previously cached copies were kept.', false, button('Learn more', showHelp, 'text-button'));
  if (new URLSearchParams(location.search).get('demo') === '1') startDemo();
}
run(init);
