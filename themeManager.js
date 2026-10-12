/**
 * Vesper's shared palette registry. Themes are plain CSS tokens so every view,
 * including dialogs and canvas-adjacent controls, can switch without reloading.
 */
export const THEME_PALETTES = [
  { id: 'sakura', name: 'Sakura Senpai', colors: ['#17131c', '#dfa0e4', '#29202f'], vars: { bgPrimary: '#100d14', bgSecondary: '#17131c', bgCard: '#201a27', accent: '#dfa0e4', accentGlow: 'rgba(223,160,228,.28)', textPrimary: '#f2edf4', textSecondary: '#a99eaf', border: 'rgba(228,216,238,.14)', badgeBg: '#35253a' } },
  { id: 'mica', name: 'Mica Night', colors: ['#10141b', '#b8b5ff', '#202633'], vars: { bgPrimary: '#10141b', bgSecondary: '#171c25', bgCard: '#202633', accent: '#b8b5ff', accentGlow: 'rgba(184,181,255,.28)', textPrimary: '#edf1fb', textSecondary: '#a1aabc', border: '#303847', badgeBg: '#292940' } },
  { id: 'velvet', name: 'Velvet', colors: ['#17111f', '#d3a1e4', '#2a2035'], vars: { bgPrimary: '#120d18', bgSecondary: '#1b1423', bgCard: '#261d31', accent: '#d3a1e4', accentGlow: 'rgba(211,161,228,.3)', textPrimary: '#f3eaf5', textSecondary: '#b3a3bc', border: '#3d304b', badgeBg: '#392444' } },
  { id: 'petal', name: 'Petal', colors: ['#1b1119', '#f1a7c6', '#2c1c29'], vars: { bgPrimary: '#140d13', bgSecondary: '#1d141c', bgCard: '#2a1d28', accent: '#f1a7c6', accentGlow: 'rgba(241,167,198,.28)', textPrimary: '#f8edf2', textSecondary: '#bba6b2', border: '#44303e', badgeBg: '#45263a' } },
  { id: 'moonstone', name: 'Moonstone', colors: ['#101722', '#91c9df', '#202e3c'], vars: { bgPrimary: '#0e131c', bgSecondary: '#151d29', bgCard: '#1e2937', accent: '#91c9df', accentGlow: 'rgba(145,201,223,.27)', textPrimary: '#edf4f8', textSecondary: '#a0b1c1', border: '#344250', badgeBg: '#213a4a' } },
  { id: 'jade', name: 'Jade', colors: ['#101817', '#86d1b4', '#1d2927'], vars: { bgPrimary: '#0d1312', bgSecondary: '#141d1b', bgCard: '#1c2825', accent: '#86d1b4', accentGlow: 'rgba(134,209,180,.25)', textPrimary: '#edf6f1', textSecondary: '#a0b6ad', border: '#30423c', badgeBg: '#21453b' } },
  { id: 'riko', name: 'Riko Atelier', colors: ['#17131f', '#d8ceff', '#282237'], vars: { bgPrimary: '#100d17', bgSecondary: '#191522', bgCard: '#242034', accent: '#d8ceff', accentGlow: 'rgba(216,206,255,.27)', textPrimary: '#f1edf8', textSecondary: '#aaa0b7', border: '#39324b', badgeBg: '#352b4b' } },
  { id: 'portrait', name: 'Portrait Stage', colors: ['#17131c', '#e0c4ff', '#292234'], vars: { bgPrimary: '#100d15', bgSecondary: '#19151f', bgCard: '#25202d', accent: '#e0c4ff', accentGlow: 'rgba(224,196,255,.25)', textPrimary: '#f5eff7', textSecondary: '#afa3b6', border: '#3b3343', badgeBg: '#392b48' } },
  { id: 'ember', name: 'Ember', colors: ['#1b1112', '#f0a875', '#30201d'], vars: { bgPrimary: '#140e0e', bgSecondary: '#201615', bgCard: '#2d201d', accent: '#f0a875', accentGlow: 'rgba(240,168,117,.3)', textPrimary: '#fbefe6', textSecondary: '#c0a99b', border: '#49332b', badgeBg: '#4a2d21' } },
  { id: 'tidepool', name: 'Tidepool', colors: ['#0e171b', '#83d9d0', '#1a282d'], vars: { bgPrimary: '#0c1418', bgSecondary: '#131f24', bgCard: '#1b2a2e', accent: '#83d9d0', accentGlow: 'rgba(131,217,208,.28)', textPrimary: '#ecf6f4', textSecondary: '#a1b9b9', border: '#2f4447', badgeBg: '#1c4143' } },
  { id: 'dreamlight', name: 'Dreamlight', colors: ['#171421', '#c4b0fa', '#282339'], vars: { bgPrimary: '#100e17', bgSecondary: '#191622', bgCard: '#242033', accent: '#c4b0fa', accentGlow: 'rgba(196,176,250,.3)', textPrimary: '#f1eef9', textSecondary: '#aaa1bc', border: '#39334b', badgeBg: '#342b4c' } },
  { id: 'pineglass', name: 'Pineglass', colors: ['#101713', '#9cd7b3', '#1d2922'], vars: { bgPrimary: '#0d130f', bgSecondary: '#141d17', bgCard: '#1d2921', accent: '#9cd7b3', accentGlow: 'rgba(156,215,179,.25)', textPrimary: '#eef5ef', textSecondary: '#a4b6a8', border: '#33443a', badgeBg: '#244431' } },
  { id: 'citrus-noir', name: 'Citrus Noir', colors: ['#17170f', '#d5d779', '#28291b'], vars: { bgPrimary: '#11120d', bgSecondary: '#191a13', bgCard: '#25261a', accent: '#d5d779', accentGlow: 'rgba(213,215,121,.24)', textPrimary: '#f3f3e8', textSecondary: '#b2b39a', border: '#41412d', badgeBg: '#393b1d' } },
  { id: 'omarchy-quattro', name: 'Omarchy Quattro', colors: ['#12151c', '#38bdf8', '#1a202b'], vars: { bgPrimary: '#12151c', bgSecondary: '#181c26', bgCard: '#1a202b', accent: '#38bdf8', accentGlow: 'rgba(56,189,248,.3)', textPrimary: '#e7edf6', textSecondary: '#a0aec0', border: '#2e364f', badgeBg: '#172c40' } },
  { id: 'tokyo-night', name: 'Tokyo Night', colors: ['#1a1b26', '#7aa2f7', '#24283b'], vars: { bgPrimary: '#1a1b26', bgSecondary: '#202231', bgCard: '#24283b', accent: '#7aa2f7', accentGlow: 'rgba(122,162,247,.3)', textPrimary: '#c0caf5', textSecondary: '#a9b1d6', border: '#343b58', badgeBg: '#292e42' } },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', colors: ['#1e1e2e', '#cba6f7', '#313244'], vars: { bgPrimary: '#1e1e2e', bgSecondary: '#272738', bgCard: '#313244', accent: '#cba6f7', accentGlow: 'rgba(203,166,247,.3)', textPrimary: '#cdd6f4', textSecondary: '#a6adc8', border: '#45475a', badgeBg: '#3d3153' } },
  { id: 'lumon-industries', name: 'Lumon Industries', colors: ['#0f172a', '#06b6d4', '#172c39'], vars: { bgPrimary: '#0f172a', bgSecondary: '#142033', bgCard: '#172c39', accent: '#06b6d4', accentGlow: 'rgba(6,182,212,.3)', textPrimary: '#ecfeff', textSecondary: '#a5c4d0', border: '#294456', badgeBg: '#123744' } },
  { id: 'fenrir-cyberpunk', name: 'Fenrir Cyberpunk', colors: ['#0a0a0f', '#f43f5e', '#17131f'], vars: { bgPrimary: '#0a0a0f', bgSecondary: '#11111a', bgCard: '#17131f', accent: '#f43f5e', accentGlow: 'rgba(244,63,94,.38)', textPrimary: '#fff1f2', textSecondary: '#c0a9b4', border: '#59283d', badgeBg: '#3c1930' } },
  { id: 'gruber-darker', name: 'Gruber Darker', colors: ['#181818', '#ffdd33', '#252320'], vars: { bgPrimary: '#181818', bgSecondary: '#20201f', bgCard: '#252320', accent: '#ffdd33', accentGlow: 'rgba(255,221,51,.26)', textPrimary: '#f4f0e8', textSecondary: '#b6b0a5', border: '#454139', badgeBg: '#39331b' } },
  { id: 'rose-pine-dark', name: 'Rosé Pine Dark', colors: ['#191724', '#ebbcba', '#26233a'], vars: { bgPrimary: '#191724', bgSecondary: '#1f1d2e', bgCard: '#26233a', accent: '#ebbcba', accentGlow: 'rgba(235,188,186,.28)', textPrimary: '#e0def4', textSecondary: '#b2aec5', border: '#403d52', badgeBg: '#3a2d40' } },
  { id: 'miasma-forest', name: 'Miasma Forest', colors: ['#111512', '#788755', '#1f2821'], vars: { bgPrimary: '#111512', bgSecondary: '#181f1b', bgCard: '#1f2821', accent: '#9eae72', accentGlow: 'rgba(120,135,85,.3)', textPrimary: '#e5e9db', textSecondary: '#a6ae98', border: '#384337', badgeBg: '#313d2c' } },
  { id: 'solitude-slate', name: 'Solitude Slate', colors: ['#0f172a', '#f97316', '#1b263a'], vars: { bgPrimary: '#0f172a', bgSecondary: '#162033', bgCard: '#1b263a', accent: '#f97316', accentGlow: 'rgba(249,115,22,.28)', textPrimary: '#f1f5f9', textSecondary: '#aab7c9', border: '#34435a', badgeBg: '#442b24' } },
  { id: 'nord-frost', name: 'Nord Frost', colors: ['#2e3440', '#88c0d0', '#3b4555'], vars: { bgPrimary: '#2e3440', bgSecondary: '#343c4a', bgCard: '#3b4555', accent: '#88c0d0', accentGlow: 'rgba(136,192,208,.28)', textPrimary: '#eceff4', textSecondary: '#c3ccd8', border: '#4c566a', badgeBg: '#3d5866' } },
];

export const THEME_STORAGE_KEY = 'vesper_active_theme';
export const THEME_BY_ID = new Map(THEME_PALETTES.map((theme) => [theme.id, theme]));

export function applyTheme(themeKey, { persist = true } = {}) {
  const selected = THEME_BY_ID.has(themeKey) ? themeKey : 'omarchy-quattro';
  const palette = THEME_BY_ID.get(selected);
  const root = document.documentElement;
  const body = document.body;
  root.dataset.theme = selected;
  if (body) body.dataset.theme = selected;
  const cssNames = { bgPrimary: '--bg-primary', bgSecondary: '--bg-secondary', bgCard: '--bg-card', accent: '--accent', accentGlow: '--accent-glow', textPrimary: '--text-primary', textSecondary: '--text-secondary', border: '--border', badgeBg: '--badge-bg' };
  for (const [key, cssName] of Object.entries(cssNames)) root.style.setProperty(cssName, palette.vars[key]);
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, selected); } catch { /* The current view remains themed if storage is unavailable. */ }
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = palette.vars.bgPrimary;
  return selected;
}
