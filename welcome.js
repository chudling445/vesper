import { appStore } from './persistence.js';
import { initGlobalFeedback } from './feedback.js';
import { applyPaletteTheme, initThemeProvider, PALETTES } from './theme-provider.js';

initGlobalFeedback();
initThemeProvider();
const key = 'vesper-welcome-seen-v1';
const themeKey = 'vesper-theme-v3';
const themes = PALETTES.map(({ id }) => id);
function applyWelcomeTheme(theme) {
  const selected = themes.includes(theme) ? theme : 'riko';
  applyPaletteTheme(selected);
}
const themePicker = document.querySelector('.welcome-theme-picker');
if (themePicker) {
  const existingThemes = new Set([...themePicker.querySelectorAll('[data-welcome-theme]')].map((button) => button.dataset.welcomeTheme));
  for (const { id, name } of PALETTES) {
    if (existingThemes.has(id)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.welcomeTheme = id;
    button.textContent = name.toUpperCase();
    themePicker.append(button);
  }
}
let storedPalette = '';
try { storedPalette = localStorage.getItem(themeKey) || ''; } catch { /* Use the durable app setting below. */ }
const savedSetting = appStore.get('settings.theme', 'riko');
let savedTheme = themes.includes(storedPalette) ? storedPalette : themes.includes(savedSetting) ? savedSetting : 'riko';
applyWelcomeTheme(savedTheme);
document.querySelectorAll('[data-welcome-theme]').forEach((button) => button.addEventListener('click', () => applyWelcomeTheme(button.dataset.welcomeTheme)));
const enter = document.querySelector('#welcome-enter');
enter?.addEventListener('click', () => { try { localStorage.setItem(key, '1'); } catch { /* continue without persistence */ } });
try { if (localStorage.getItem(key) === '1') document.body.classList.add('returning-user'); } catch { /* first run remains available */ }
