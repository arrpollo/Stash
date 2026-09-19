import { emptyLibrary } from './model.js';
export const isExtension = globalThis.chrome?.runtime?.id !== undefined;
export async function readLibrary() {
  if (!isExtension) return emptyLibrary();
  const data = await chrome.storage.local.get('library');
  return data.library || emptyLibrary();
}
export async function saveLibrary(library) {
  if (isExtension) await chrome.storage.local.set({ library });
}
export async function readSettings() {
  return isExtension ? (await chrome.storage.local.get('settings')).settings || {} : {};
}
export async function saveSettings(settings) {
  if (isExtension) await chrome.storage.local.set({ settings });
}
