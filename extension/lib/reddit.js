import { fromReddit, ItemValidationError } from './model.js';
export class RedditError extends Error { constructor(message, status = 0) { super(message); this.status = status; } }
export function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export class RedditClient {
  constructor({ fetchFn = globalThis.fetch.bind(globalThis), sleep = pause, origin = 'https://www.reddit.com' } = {}) {
    this.fetchFn = fetchFn; this.sleep = sleep; this.origin = origin;
  }
  async request(path, { signal, method = 'GET', body } = {}, attempt = 0) {
    signal?.throwIfAborted();
    let response;
    try {
      response = await this.fetchFn(this.origin + path, { method, body, credentials: 'include', cache: 'no-store',
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000) });
    } catch (e) {
      if (signal?.aborted) throw signal.reason;
      throw new RedditError(e.name === 'TimeoutError' ? 'Reddit took too long to respond. Please try again.' : 'Could not reach Reddit. Check your connection and try again.');
    }
    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const seconds = header && Number.isFinite(Number(header)) ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : 5 * (attempt + 1);
      if (attempt < 2 && seconds <= 30) {
        await this.sleep(Math.max(1000, seconds * 1000 || 5000), signal);
        return this.request(path, { signal, method, body }, attempt + 1);
      }
      throw new RedditError('Reddit is limiting requests. Wait a minute, then refresh. Your existing library is safe.', 429);
    }
    if ([401, 403].includes(response.status)) throw new RedditError('Reddit did not allow access. Sign in to Reddit in this Chrome profile, then retry. If you are already signed in, Reddit may be blocking session access.', response.status);
    if (!response.ok) throw new RedditError(`Reddit returned an error (${response.status}). Please try again later.`, response.status);
    let data;
    try { data = await response.json(); } catch { throw new RedditError('Reddit returned a web page instead of saved data. Open Reddit, complete any login or browser check, then retry.'); }
    if (data?.error || data?.json?.errors?.length) throw new RedditError(`Reddit could not complete the request: ${data.message || data.json?.errors?.[0]?.[1] || data.error}`);
    return data;
  }
  async identity(signal) {
    const response = await this.request('/api/me.json?raw_json=1', { signal });
    const d = response?.data;
    if (!d?.name || !/^[a-zA-Z0-9_-]{1,30}$/.test(d.name)) throw new RedditError('Sign in to Reddit in this Chrome profile, then click Sync Reddit.', 401);
    return { name: d.name, modhash: d.modhash };
  }
  async saved(account, { signal, onProgress = () => {} } = {}) {
    const items = new Map(); const cursors = new Set(); let after = null, skipped = 0, seen = 0;
    for (let page = 0; page < 100; page++) {
      const params = new URLSearchParams({ limit: '100', raw_json: '1', sort: 'new', count: String(seen) });
      if (after) params.set('after', after);
      const response = await this.request(`/user/${encodeURIComponent(account)}/saved.json?${params}`, { signal });
      if (response?.kind !== 'Listing' || !Array.isArray(response?.data?.children)) throw new RedditError('Reddit returned an unexpected saved-list format. Your library has not been changed.');
      for (const child of response.data.children) {
        seen++;
        try {
          const p = fromReddit(child, items.size);
          if (!p) skipped++;
          else if (!items.has(p.id)) items.set(p.id, p);
        } catch (error) {
          // Isolate bad records, while still surfacing programming/network errors.
          if (!(error instanceof ItemValidationError)) throw error;
          skipped++;
        }
      }
      onProgress(items.size, { skipped, seen });
      after = response.data.after;
      if (!after) {
        if (!items.size && skipped) throw new RedditError('Reddit returned ' + seen + ' saved items, but none could be read. Your existing library is unchanged.');
        return [...items.values()];
      }
      if (typeof after !== 'string' || cursors.has(after) || response.data.children.length === 0) throw new RedditError('Reddit repeated a page. Please retry; your existing library is unchanged.');
      cursors.add(after);
      await this.sleep(1100, signal);
    }
    throw new RedditError('Reddit kept returning more pages than expected. Sync stopped without changing your library.');
  }
  async unsave(id, expectedAccount, signal) {
    if (!/^t[13]_[a-z0-9]+$/.test(id)) throw new RedditError('Invalid saved item.');
    const identity = await this.identity(signal);
    if (identity.name.toLowerCase() !== expectedAccount.toLowerCase()) throw new RedditError(`Sign in as u/${expectedAccount} before removing this save.`);
    if (!identity.modhash) throw new RedditError('Reddit did not provide a session token. Open the post on Reddit to unsave it there.');
    await this.request('/api/unsave', { method: 'POST', signal, body: new URLSearchParams({ id, uh: identity.modhash, api_type: 'json' }) });
  }
}
