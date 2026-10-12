import { THEME_PALETTES } from './themeManager.js';
import { applyPaletteTheme } from './theme-provider.js';

const OFFICIAL_THEME_IDS = [
  'omarchy-quattro', 'tokyo-night', 'catppuccin-mocha', 'lumon-industries', 'fenrir-cyberpunk',
  'gruber-darker', 'rose-pine-dark', 'miasma-forest', 'solitude-slate', 'nord-frost',
];

/** Mount the ten Omarchy-inspired theme swatch cards into a settings surface. */
export function mountThemeSelector(container) {
  if (!(container instanceof HTMLElement)) return () => {};
  const palettes = OFFICIAL_THEME_IDS.map((id) => THEME_PALETTES.find((theme) => theme.id === id)).filter(Boolean);
  const grid = document.createElement('div');
  grid.className = 'official-theme-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Official Vesper themes');
  for (const palette of palettes) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'official-theme-card'; button.dataset.themeSelector = palette.id;
    button.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === palette.id));
    button.setAttribute('aria-label', `Apply ${palette.name} theme`);
    const preview = document.createElement('span'); preview.className = 'official-theme-preview';
    preview.style.background = `linear-gradient(135deg, ${palette.vars.bgPrimary} 0 48%, ${palette.vars.bgCard} 49% 72%, ${palette.vars.accent} 73% 100%)`;
    const name = document.createElement('b'); name.textContent = palette.name;
    const meta = document.createElement('small'); meta.textContent = palette.id.replaceAll('-', ' ').toUpperCase();
    button.append(preview, name, meta);
    button.addEventListener('click', () => applyPaletteTheme(palette.id));
    grid.append(button);
  }
  container.replaceChildren(grid);
  const update = (event) => grid.querySelectorAll('[data-theme-selector]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.themeSelector === event.detail?.theme)));
  document.addEventListener('vesper-palette-change', update);
  return () => document.removeEventListener('vesper-palette-change', update);
}
