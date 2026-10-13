import { appStore } from './persistence.js';
import { applyTheme, THEME_PALETTES, THEME_STORAGE_KEY } from './themeManager.js';

const MODE_KEY = 'vesper-color-mode-v1';
const MODES = ['dark', 'light', 'system'];
const SITE_NAVIGATION = [
  ['/', 'Chat'],
  ['/workspace', 'Workspace'],
  ['/lab', 'Code Lab'],
  ['/quick-capture', 'Capture'],
  ['/games', 'Arcade'],
  ['/voices', 'Voice lab'],
  ['/about', 'Studio guide'],
  ['/planner', 'Builds & Money'],
];
export const PALETTE_KEY = THEME_STORAGE_KEY;
const LEGACY_PALETTE_KEY = 'vesper-theme-v3';
export const PALETTES = THEME_PALETTES.map(({ id, name, colors, vars }) => ({ id, name, colors, vars }));

function savedPalette() {
  try {
    const saved = localStorage.getItem(PALETTE_KEY) || localStorage.getItem(LEGACY_PALETTE_KEY);
    return PALETTES.some((palette) => palette.id === saved) ? saved : '';
  } catch { return ''; }
}

export function applyPaletteTheme(theme, persist = true) {
  const selected = PALETTES.some((palette) => palette.id === theme) ? theme : 'omarchy-quattro';
  applyTheme(selected, { persist });
  document.querySelectorAll('[data-theme-option]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.themeOption === selected)));
  document.querySelectorAll('[data-theme-selector]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.themeSelector === selected)));
  document.querySelectorAll('[data-welcome-theme]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.welcomeTheme === selected)));
  document.querySelectorAll('[data-palette-select]').forEach((select) => { select.value = selected; });
  if (persist) {
    try { localStorage.setItem(PALETTE_KEY, selected); } catch { /* Keep the selection for this page. */ }
    try { localStorage.setItem(LEGACY_PALETTE_KEY, selected); } catch { /* Existing versions can still read their palette key. */ }
    appStore.set('settings.theme', selected);
  }
  document.dispatchEvent(new CustomEvent('vesper-palette-change', { detail: { theme: selected } }));
  return selected;
}

function ensureThemeDock() {
  if (document.querySelector('.page-mode-dock, #theme-dock')) return;
  const dock = document.createElement('div');
  dock.className = 'page-mode-dock';
  dock.setAttribute('aria-label', 'Appearance settings');
  const hasNativePalettePicker = Boolean(document.querySelector('#theme-dock, .welcome-theme-picker'));
  const paletteSelect = hasNativePalettePicker ? '' : `<label for="site-palette-select">THEME</label><select id="site-palette-select" data-palette-select aria-label="Choose a site theme">${PALETTES.map(({ id, name }) => `<option value="${id}">${name}</option>`).join('')}</select>`;
  dock.innerHTML = `${paletteSelect}<span>MODE</span><button type="button" data-color-mode="dark">DARK</button><button type="button" data-color-mode="light">LIGHT</button><button type="button" data-color-mode="system">SYSTEM</button>`;
  document.body.append(dock);
  dock.querySelector('[data-palette-select]')?.addEventListener('change', (event) => applyPaletteTheme(event.currentTarget.value));
}

function ensureGlobalPaletteOptions() {
  const menu = document.querySelector('#theme-menu');
  if (!menu) return;
  const existing = new Set([...menu.querySelectorAll('[data-theme-option]')].map((button) => button.dataset.themeOption));
  for (const palette of PALETTES) {
    if (existing.has(palette.id)) continue;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'theme-option'; button.dataset.themeOption = palette.id; button.setAttribute('aria-pressed', 'false');
    const swatch = document.createElement('span'); swatch.className = 'palette-dot'; swatch.style.background = `linear-gradient(135deg, ${palette.colors[1]} 0 48%, ${palette.colors[0]} 52%)`; swatch.style.color = palette.colors[1];
    const copy = document.createElement('span'); copy.className = 'theme-option-copy';
    const name = document.createElement('b'); name.textContent = palette.name;
    const hint = document.createElement('small'); hint.textContent = 'LOCAL PALETTE';
    const check = document.createElement('span'); check.className = 'theme-check'; check.textContent = '✦';
    copy.append(name, hint); button.append(swatch, copy, check); menu.insertBefore(button, menu.querySelector('.theme-menu-foot'));
  }
}

function ensureSiteNavigation() {
  const here = location.pathname === '/index.html' ? '/' : location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.site-nav').forEach((nav) => {
    for (const [href, label] of SITE_NAVIGATION) {
      let link = nav.querySelector(`a[href="${href}"]`);
      if (!link) {
        link = document.createElement('a');
        link.href = href;
        nav.append(link);
      }
      link.textContent = label;
      if (href === here || (href === '/planner' && here === '/planner.html')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      nav.append(link);
    }
  });
}

function preferredMode() { try { return MODES.includes(localStorage.getItem(MODE_KEY)) ? localStorage.getItem(MODE_KEY) : 'system'; } catch { return 'system'; } }
function resolvedMode(mode) { return mode === 'system' ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : mode; }

export function applyColorMode(mode, persist = true) {
  const selected = MODES.includes(mode) ? mode : 'system';
  const resolved = resolvedMode(selected);
  document.documentElement.dataset.colorMode = resolved;
  document.documentElement.dataset.colorModePreference = selected;
  document.querySelectorAll('[data-color-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.colorMode === selected)));
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = resolved === 'light' ? '#f6f4f8' : '#0b0d12';
  if (persist) try { localStorage.setItem(MODE_KEY, selected); } catch { /* memory-only fallback */ }
  return selected;
}

export function initThemeProvider() {
  if (document.documentElement.dataset.vesperThemeProvider === 'ready') return { mode: preferredMode(), apply: applyColorMode, palette: savedPalette() || 'omarchy-quattro' };
  document.documentElement.dataset.vesperThemeProvider = 'ready';
  ensureThemeDock();
  ensureGlobalPaletteOptions();
  ensureSiteNavigation();
  applyPaletteTheme(savedPalette() || appStore.get('settings.theme', 'omarchy-quattro'), false);
  window.addEventListener('storage', (event) => {
    if ([PALETTE_KEY, LEGACY_PALETTE_KEY].includes(event.key) && event.newValue) applyPaletteTheme(event.newValue, false);
  });
  const cycleTheme = () => {
    const current = document.documentElement.dataset.theme || 'omarchy-quattro';
    const index = PALETTES.findIndex(({ id }) => id === current);
    applyPaletteTheme(PALETTES[(index + 1 + PALETTES.length) % PALETTES.length].id);
  };
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.altKey) return;
    const commandCycle = event.code === 'KeyT' && event.shiftKey && (event.ctrlKey || event.metaKey);
    if (!commandCycle) return;
    event.preventDefault(); cycleTheme();
  });
  applyColorMode(preferredMode(), false);
  const media = window.matchMedia?.('(prefers-color-scheme: light)');
  media?.addEventListener?.('change', () => { if (document.documentElement.dataset.colorModePreference === 'system') applyColorMode('system', false); });
  document.querySelectorAll('[data-color-mode]').forEach((button) => button.addEventListener('click', () => applyColorMode(button.dataset.colorMode)));
  return { mode: preferredMode(), apply: applyColorMode, palette: savedPalette() || appStore.get('settings.theme', 'omarchy-quattro') };
}
