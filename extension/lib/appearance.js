export const READING_FONTS = [
  ['system', 'System default'],
  ['atkinson', 'Atkinson Hyperlegible · distinct letters'],
  ['lexend', 'Lexend · roomy spacing'],
  ['verdana', 'Verdana · wide letters'],
  ['trebuchet', 'Trebuchet · rounded sans serif'],
  ['georgia', 'Georgia · classic serif']
];
export const TITLE_FONTS = [
  ['serif', 'Classic · serif'], ['sans', 'Match reading font'],
  ...READING_FONTS.filter(([key]) => key !== 'system')
];
export function appearanceSettings(settings = {}) {
  const scale = Number(settings.displayScale);
  return {
    ...settings,
    displayScale: Number.isFinite(scale) && scale >= 100 && scale <= 200 ? Math.round(scale / 5) * 5 : 100,
    titleFont: TITLE_FONTS.some(([key]) => key === settings.titleFont) ? settings.titleFont : 'serif',
    readingFont: READING_FONTS.some(([key]) => key === settings.readingFont) ? settings.readingFont : 'system',
    browsingMode: settings.browsingMode === 'scroll' ? 'scroll' : 'pages',
    pageSize: [15, 30, 60, 100].includes(Number(settings.pageSize)) ? Number(settings.pageSize) : 30,
    showThumbnails: settings.showThumbnails !== false,
    showNsfwThumbnails: settings.showNsfwThumbnails === true
  };
}

export function applyAppearance(settings) {
  const appearance = appearanceSettings(settings);
  // All interface dimensions use rem so text, controls and spacing grow together.
  document.documentElement.style.fontSize = (16 * appearance.displayScale / 100) + 'px';
  document.documentElement.dataset.titleFont = appearance.titleFont;
  document.documentElement.dataset.readingFont = appearance.readingFont;
}
