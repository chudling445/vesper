const THEME_KEY = 'vesper-theme-v3';
const BACKGROUND_KEY = 'vesper-background-v1';
const backgrounds = ['atelier', 'sakura', 'midnight', 'aurora', 'sunset'];
const themes = ['sakura', 'mica', 'velvet', 'petal', 'moonstone', 'jade', 'riko', 'portrait'];
const WINDOW_KEY = 'vesper-model-window-v1';
try { const saved = localStorage.getItem(THEME_KEY); if (themes.includes(saved)) document.body.dataset.theme = saved; } catch { /* keep Riko Atelier */ }
function applyBackground(name) {
  const selected = backgrounds.includes(name) ? name : 'atelier';
  document.querySelector('#scene').dataset.background = selected;
  document.querySelectorAll('[data-background]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.background === selected)));
  try { localStorage.setItem(BACKGROUND_KEY, selected); } catch { /* keep this session's backdrop */ }
}
let savedBackground = 'atelier';
try { if (backgrounds.includes(localStorage.getItem(BACKGROUND_KEY))) savedBackground = localStorage.getItem(BACKGROUND_KEY); } catch { /* use atelier */ }
applyBackground(savedBackground);
function restoreWindowPosition() { try { const saved = JSON.parse(localStorage.getItem(WINDOW_KEY) || 'null'); if (!saved || !window.moveTo) return; const left = Math.max(window.screen.availLeft || 0, Math.min(saved.left, (window.screen.availLeft || 0) + window.screen.availWidth - 120)); const top = Math.max(window.screen.availTop || 0, Math.min(saved.top, (window.screen.availTop || 0) + window.screen.availHeight - 180)); window.moveTo(left, top); } catch { /* Browser app windows may deny moveTo. */ } }
function saveWindowPosition() { try { localStorage.setItem(WINDOW_KEY, JSON.stringify({ left: window.screenX, top: window.screenY, savedAt: Date.now() })); } catch { /* Position persistence is optional. */ } }
restoreWindowPosition(); window.addEventListener('beforeunload', saveWindowPosition); window.addEventListener('pagehide', saveWindowPosition);
window.setAvatarAutoPerformance?.(true);
document.querySelectorAll('[data-performance]').forEach((button) => button.addEventListener('click', () => {
  window.setAvatarPerformance?.(button.dataset.performance);
  document.querySelectorAll('[data-performance]').forEach((item) => item.classList.toggle('is-active', item === button));
}));
document.querySelectorAll('[data-expression]').forEach((button) => button.addEventListener('click', () => window.setAvatarExpression?.(button.dataset.expression)));
document.querySelectorAll('[data-background]').forEach((button) => button.addEventListener('click', () => applyBackground(button.dataset.background)));
document.querySelector('#model-only-close').addEventListener('click', () => window.close());
window.addEventListener('avatar-ready', () => { document.querySelector('#stage-status').textContent = 'MODEL ONLY · LIVE'; });
