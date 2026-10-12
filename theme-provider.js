const MODE_KEY = 'vesper-color-mode-v1';
const MODES = ['dark', 'light', 'system'];

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
  applyColorMode(preferredMode(), false);
  const media = window.matchMedia?.('(prefers-color-scheme: light)');
  media?.addEventListener?.('change', () => { if (document.documentElement.dataset.colorModePreference === 'system') applyColorMode('system', false); });
  document.querySelectorAll('[data-color-mode]').forEach((button) => button.addEventListener('click', () => applyColorMode(button.dataset.colorMode)));
  return { mode: preferredMode(), apply: applyColorMode };
}
