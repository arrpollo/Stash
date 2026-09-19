const imageHosts = new Set(['preview.redd.it', 'external-preview.redd.it', 'i.redd.it', 'a.thumbs.redditmedia.com', 'b.thumbs.redditmedia.com', 'i.redditmedia.com']);
export function thumbnailURL(value) {
  if (typeof value !== 'string' || value.length > 4096) return '';
  try {
    const url = new URL(value.replace(/&amp;/g, '&'));
    if (url.protocol !== 'https:' || !imageHosts.has(url.hostname) || url.username || url.password || url.port) return '';
    // Use still previews, not video files or full animated GIFs.
    if (/\.(?:gif|mp4|webm|m3u8|svg)(?:$|[?#])/i.test(url.pathname)) return '';
    return url.href;
  } catch { return ''; }
}
export function normalizeMedia(raw) {
  const thumbnail = thumbnailURL(raw?.thumbnail);
  if (!thumbnail) return null;
  return { thumbnail, type: ['image', 'gif', 'video', 'gallery', 'link'].includes(raw.type) ? raw.type : 'image',
    count: Number.isInteger(raw.count) ? Math.min(100, Math.max(1, raw.count)) : 1 };
}
function imageCandidate(image) {
  if (!image || typeof image !== 'object') return '';
  const resolutions = Array.isArray(image.resolutions) ? image.resolutions : Array.isArray(image.p) ? image.p : [];
  const valid = resolutions.filter(r => r && thumbnailURL(r.url || r.u)).sort((a, b) => (a.width || a.x || 0) - (b.width || b.x || 0));
  const choice = valid.find(r => (r.width || r.x || 0) >= 320) || valid.at(-1);
  return thumbnailURL(choice?.url || choice?.u) || thumbnailURL(image.source?.url || image.s?.u);
}
function ownMedia(d) {
  if (!d || typeof d !== 'object') return null;
  const images = Array.isArray(d.preview?.images) ? d.preview.images : [];
  const video = d.secure_media?.reddit_video || d.media?.reddit_video || d.preview?.reddit_video_preview;
  const animated = video?.is_gif || Boolean(images[0]?.variants?.gif || images[0]?.variants?.mp4) || /\.gifv?(?:$|[?#])/i.test(d.url || '');
  const embedded = d.secure_media?.oembed || d.media?.oembed;
  const gallery = Array.isArray(d.gallery_data?.items) ? d.gallery_data.items : [];
  const type = animated ? 'gif' : video || d.is_video || embedded?.type === 'video' || (typeof d.post_hint === 'string' && d.post_hint.includes('video')) ? 'video' :
    gallery.length || d.is_gallery ? 'gallery' : d.post_hint === 'link' ? 'link' : 'image';
  const galleryThumbnail = gallery.map(item => d.media_metadata?.[item?.media_id]).filter(image => image && image.status !== 'failed').map(imageCandidate).find(Boolean);
  const thumbnail = images.map(imageCandidate).find(Boolean) || galleryThumbnail || thumbnailURL(d.thumbnail) ||
    thumbnailURL(embedded?.thumbnail_url) || (type === 'image' && /\.(?:png|jpe?g|webp)(?:$|[?#])/i.test(d.url_overridden_by_dest || d.url || '') ? thumbnailURL(d.url_overridden_by_dest || d.url) : '');
  return normalizeMedia({ thumbnail, type, count: gallery.length || 1 });
}
export function mediaFromReddit(data) {
  const own = ownMedia(data);
  if (own) return own;
  // Crossposts often carry the preview only on their original post.
  const parents = Array.isArray(data?.crosspost_parent_list) ? data.crosspost_parent_list : [];
  for (const parent of parents) {
    const media = ownMedia(parent);
    if (media) return media;
  }
  return null;
}
