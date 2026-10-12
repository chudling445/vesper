// Shared by the Arcade, Voices and README pages: apply the saved theme and mark the current page in the nav.
const THEME_KEY = 'vesper-theme-v3';
const THEMES = ['sakura', 'mica', 'velvet', 'petal', 'moonstone', 'jade'];
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
