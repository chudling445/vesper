import { initGlobalFeedback } from './feedback.js';
import { initThemeProvider } from './theme-provider.js';

initGlobalFeedback();
// Shared by the Arcade, Voices, Studio Guide and setup pages: apply theme and mark current nav.
const THEME_KEY = 'vesper-theme-v3';
const THEMES = ['sakura', 'mica', 'velvet', 'petal', 'moonstone', 'jade', 'riko', 'portrait'];
try {
  const saved = localStorage.getItem(THEME_KEY);
  document.body.dataset.theme = THEMES.includes(saved) ? saved : 'sakura';
} catch {
  document.body.dataset.theme = 'sakura';
}
const here = location.pathname.replace(/\/$/, '') || '/';
document.querySelectorAll('.site-nav a').forEach((link) => {
  if (link.getAttribute('href') === here) link.setAttribute('aria-current', 'page');
});
const modeDock = document.createElement('div');
modeDock.className = 'page-mode-dock';
modeDock.setAttribute('aria-label', 'Color mode');
modeDock.innerHTML = '<span>MODE</span><button type="button" data-color-mode="dark">DARK</button><button type="button" data-color-mode="light">LIGHT</button><button type="button" data-color-mode="system">SYSTEM</button>';
document.body.append(modeDock);
initThemeProvider();
