const SEEN_KEY = 'vesper-entry-welcome-seen-v1';
let gate = document.querySelector('#welcome-gate');

if (!gate) {
  gate = document.createElement('dialog');
  gate.id = 'welcome-gate';
  gate.className = 'welcome-gate access-dialog';
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'welcome-gate-title');
  gate.innerHTML = '<div class="welcome-gate-card"><div class="access-emblem" aria-hidden="true">✦</div><div class="eyebrow">VESPER / PRIVATE SPACE</div><h2 id="welcome-gate-title">Welcome <em>back.</em></h2><p>Your Vesper workspace is ready.</p><button class="primary-button" id="welcome-gate-enter" type="button">CONTINUE</button></div>';
  document.body.prepend(gate);
}

const enter = gate.querySelector('#welcome-gate-enter');
if (enter) {
  let seen = false;
  try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch { /* Show the welcome screen if storage is blocked. */ }
  if (!seen) {
    if (typeof gate.showModal === 'function') gate.showModal();
    else gate.setAttribute('open', '');
  }

  enter.addEventListener('click', () => {
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* Continue even when storage is blocked. */ }
    if (typeof gate.close === 'function') gate.close();
    else gate.removeAttribute('open');
  });
}
