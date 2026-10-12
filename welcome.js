import { appStore } from './persistence.js';
import { initGlobalFeedback } from './feedback.js';
import { initThemeProvider } from './theme-provider.js';

initGlobalFeedback();
initThemeProvider();
const key = 'vesper-welcome-seen-v1';
const themeKey = 'vesper-theme-v3';
const themes = ['sakura', 'mica', 'velvet', 'petal', 'moonstone', 'jade', 'riko', 'portrait'];
function applyWelcomeTheme(theme) {
  const selected = themes.includes(theme) ? theme : 'riko';
  document.body.dataset.theme = selected;
  document.querySelectorAll('[data-welcome-theme]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.welcomeTheme === selected)));
  appStore.set('settings.theme', selected);
}
let savedTheme = themes.includes(appStore.get('settings.theme', 'riko')) ? appStore.get('settings.theme') : 'riko';
applyWelcomeTheme(savedTheme);
document.querySelectorAll('[data-welcome-theme]').forEach((button) => button.addEventListener('click', () => applyWelcomeTheme(button.dataset.welcomeTheme)));
const enter = document.querySelector('#welcome-enter');
enter?.addEventListener('click', () => { try { localStorage.setItem(key, '1'); } catch { /* continue without persistence */ } });
try { if (localStorage.getItem(key) === '1') document.body.classList.add('returning-user'); } catch { /* first run remains available */ }
