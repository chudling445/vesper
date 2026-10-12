import { initGlobalFeedback } from './feedback.js';
import { initThemeProvider } from './theme-provider.js';
import './arcade-launcher.js';

initGlobalFeedback();
initThemeProvider();

// Shared by the Arcade, Voices, Studio Guide and setup pages: mark current nav.
const here = location.pathname.replace(/\/$/, '') || '/';
document.querySelectorAll('.site-nav a').forEach((link) => {
  if (link.getAttribute('href') === here) link.setAttribute('aria-current', 'page');
});
