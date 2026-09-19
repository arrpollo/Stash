const paths = {
 bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
 stack: '<rect x="7" y="3" width="12" height="15" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h9"/>',
 star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9z"/>',
 book: '<path d="M12 6v15M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2z"/>',
 check: '<path d="m5 12 4 4L19 6"/>',
 search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 11 3 3 5-5"/>',
 settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5" fill="var(--sidebar)"/><circle cx="15" cy="17" r="2.5" fill="var(--sidebar)"/>',
 help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
 sync: '<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
 arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
 spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
 chevron: '<path d="m7 10 5 5 5-5"/>',
 sort: '<path d="M4 5h16M4 11h11M4 17h6"/>',
 grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 list: '<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
 close: '<path d="m6 6 12 12M6 18 18 6"/>',
 filter: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
 comment: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0z"/>',
 up: '<path d="m6 10 6-6 6 6M12 4v16"/>',
 external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
 clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
 play: '<path d="m8 4 12 8-12 8z"/>',
 download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>'
};
export function icon(name) {
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.className = 'icon';
  span.innerHTML = '<svg viewBox="0 0 24 24">' + (paths[name] || paths.bookmark) + '</svg>';
  return span;
}
export function hydrateIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => el.replaceChildren(icon(el.dataset.icon)));
}
