import { mediaFromReddit, normalizeMedia } from './media.js';
export const emptyLibrary = () => ({ version: 1, account: null, items: [], lastSync: null, fetched: 0 });
const str = (value, max = 1000) => typeof value === 'string' ? value.slice(0, max) : '';
const num = value => Number.isFinite(value) ? value : 0;
export class ItemValidationError extends Error {}
// Community names are display labels, not URLs. Accept profile and legacy
// namespaces as well as ordinary subreddit names; validate links separately.
const validCommunity = value => typeof value === 'string' && /^[a-zA-Z0-9_][a-zA-Z0-9_.:-]{0,99}$/.test(value);
export function redditURL(value) {
  try {
    const url = new URL(value, 'https://www.reddit.com');
    if (url.protocol !== 'https:' || !['www.reddit.com', 'reddit.com', 'old.reddit.com'].includes(url.hostname) || url.username || url.password) return '';
    if (!/^\/(?:r\/[a-zA-Z0-9_.:-]+\/|(?:user|u)\/[a-zA-Z0-9_-]+\/)?comments\/[a-z0-9]+(?:\/|$)/i.test(url.pathname)) return '';
    return `https://www.reddit.com${url.pathname}${url.search}`;
  } catch { return ''; }
}
export function normalizeItem(raw, index = 0) {
  if (!raw || typeof raw.id !== 'string' || !/^t[13]_[a-z0-9]+$/.test(raw.id)) throw new ItemValidationError('The saved item has a missing or invalid Reddit ID.');
  if (!validCommunity(raw.subreddit)) throw new ItemValidationError('The saved item has a missing or invalid Reddit community.');
  const permalink = redditURL(raw.permalink);
  if (!permalink) throw new ItemValidationError('The saved item has an invalid Reddit link.');
  return {
    id: raw.id, subreddit: raw.subreddit, kind: raw.id.startsWith('t1_') ? 'comment' : 'post',
    title: str(raw.title, 2000) || 'Untitled post', body: str(raw.body, 40000), author: str(raw.author, 100) || '[deleted]',
    permalink, score: num(raw.score), comments: Math.max(0, num(raw.comments)), created: Math.max(0, num(raw.created)),
    order: index, favorite: raw.favorite === true, read: raw.read === true,
    cachedOnly: raw.cachedOnly === true, nsfw: raw.nsfw === true, spoiler: raw.spoiler === true, flair: str(raw.flair, 100),
    media: raw.id.startsWith('t3_') ? normalizeMedia(raw.media) : null
  };
}
export function fromReddit(child, index) {
  if (!['t1', 't3'].includes(child?.kind)) return null;
  const d = child.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new ItemValidationError('Reddit returned an empty saved item.');
  // Some listing variants omit the fullname while keeping the base-36 ID.
  const id = typeof d.name === 'string' && /^t[13]_[a-z0-9]+$/.test(d.name) ? d.name :
    typeof d.id === 'string' && /^[a-z0-9]+$/.test(d.id) ? child.kind + '_' + d.id : '';
  if (!id.startsWith(child.kind + '_')) throw new ItemValidationError('Reddit returned a saved item without a matching ID.');
  let permalink = d.permalink;
  if (permalink === undefined || permalink === null || permalink === '') {
    if (child.kind === 't3') permalink = '/comments/' + id.slice(3) + '/';
    else {
      const parent = typeof d.link_id === 'string' && /^t3_[a-z0-9]+$/.test(d.link_id) ? d.link_id.slice(3) :
        redditURL(d.link_permalink).match(/\/comments\/([a-z0-9]+)(?:\/|$)/i)?.[1];
      if (parent) permalink = '/comments/' + parent + '/_/' + id.slice(3) + '/';
    }
  }
  let subreddit = d.subreddit;
  if (!validCommunity(subreddit)) {
    const prefixed = typeof d.subreddit_name_prefixed === 'string' ? d.subreddit_name_prefixed.replace(/^r\//i, '').replace(/^u\//i, 'u_') : '';
    const location = redditURL(permalink).match(/\/(r|user|u)\/([a-zA-Z0-9_.:-]+)\/comments\//i);
    subreddit = validCommunity(prefixed) ? prefixed : location ? (location[1].toLowerCase() === 'r' ? location[2] : 'u_' + location[2]) : '';
  }
  return normalizeItem({ id, subreddit, title: child.kind === 't1' ? d.link_title || 'Saved comment' : d.title,
    body: child.kind === 't1' ? d.body : d.selftext, author: d.author, permalink,
    score: d.score, comments: d.num_comments, created: d.created_utc,
    nsfw: d.over_18 || (Array.isArray(d.crosspost_parent_list) && d.crosspost_parent_list.some(p => p?.over_18)),
    spoiler: d.spoiler || (Array.isArray(d.crosspost_parent_list) && d.crosspost_parent_list.some(p => p?.spoiler)),
    media: child.kind === 't3' ? mediaFromReddit(d) : null, flair: d.link_flair_text }, index);
}
export function filterItems(items, { query = '', subs = [], view = 'all', kind = 'all', sort = 'saved' } = {}) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const chosen = new Set(subs.map(s => s.toLowerCase()));
  const result = items.filter(p => {
    if (chosen.size && !chosen.has(p.subreddit.toLowerCase())) return false;
    if (view === 'favorites' && !p.favorite || view === 'unread' && p.read || view === 'read' && !p.read) return false;
    if (kind !== 'all' && p.kind !== kind) return false;
    const haystack = `${p.title} ${p.body} r/${p.subreddit} u/${p.author}`.toLowerCase();
    return terms.every(term => haystack.includes(term));
  });
  return result.sort((a, b) => (sort === 'score' ? b.score - a.score : sort === 'newest' ? b.created - a.created : sort === 'oldest' ? a.created - b.created : a.order - b.order) || a.order - b.order);
}
export function communities(items) {
  const map = new Map();
  for (const p of items) {
    const key = p.subreddit.toLowerCase();
    const v = map.get(key) || { name: p.subreddit, count: 0 };
    v.count++; map.set(key, v);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
export function mergeSync(previous, fetched, account, now = new Date().toISOString()) {
  if (previous.account && previous.account.toLowerCase() !== account.toLowerCase()) throw new Error(`This library belongs to u/${previous.account}. Switch back to that Reddit account, or export and clear this library in Settings first.`);
  const old = new Map(previous.items.map(p => [p.id, p]));
  const unique = new Map(fetched.map(p => [p.id, p]));
  const fresh = [...unique.values()].map(p => ({ ...p, read: old.get(p.id)?.read || false, favorite: old.get(p.id)?.favorite || false, cachedOnly: false }));
  const retained = previous.items.filter(p => !unique.has(p.id)).map(p => ({ ...p, cachedOnly: true }));
  return { version: 1, account, items: [...fresh, ...retained].map((p, order) => ({ ...p, order })), lastSync: now, fetched: fresh.length };
}
export function parseBackup(text) {
  if (text.length > 50 * 1024 * 1024) throw new Error('Choose a backup smaller than 50 MB.');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('This is not valid JSON. Choose a Stash backup file.'); }
  if (raw?.app !== 'stash-for-reddit' || raw.version !== 1 || !Array.isArray(raw.items) || raw.items.length > 50000 || typeof raw.account !== 'string' || !/^[a-zA-Z0-9_-]{1,30}$/.test(raw.account)) throw new Error('Choose a version 1 Stash backup with a Reddit account.');
  const items = raw.items.map((item, index) => {
    try { return normalizeItem(item, index); }
    catch (error) {
      if (!(error instanceof ItemValidationError)) throw error;
      throw new Error('Backup item ' + (index + 1) + ': ' + error.message);
    }
  });
  if (new Set(items.map(p => p.id)).size !== items.length) throw new Error('This backup contains duplicate items.');
  return { version: 1, account: raw.account, items, lastSync: null, fetched: 0 };
}
export function mergeBackup(current, imported) {
  if (current.account && current.account.toLowerCase() !== imported.account.toLowerCase()) throw new Error('This backup belongs to another account. Export and clear the current library in Settings first.');
  const map = new Map(current.items.map(p => [p.id, p]));
  for (const p of imported.items) {
    const old = map.get(p.id);
    map.set(p.id, old ? { ...old, favorite: old.favorite || p.favorite, read: old.read || p.read, media: old.media || p.media } : { ...p, cachedOnly: true });
  }
  return { ...current, account: current.account || imported.account, items: [...map.values()].map((p, order) => ({ ...p, order })) };
}
export const backupText = library => JSON.stringify({ app: 'stash-for-reddit', ...library, exportedAt: new Date().toISOString() }, null, 2);
