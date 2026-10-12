const focusable = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function initDialogAccessibility() {
  document.querySelectorAll('dialog,[role="dialog"]').forEach((dialog) => {
    let lastFocused = null;
    const focusFirst = () => { lastFocused = document.activeElement; const first = dialog.querySelector(focusable); first?.focus(); };
    dialog.addEventListener('show', focusFirst);
    dialog.addEventListener('toggle', () => { if (dialog.open || dialog.hasAttribute('open')) window.setTimeout(focusFirst, 0); });
    dialog.addEventListener('close', () => { if (lastFocused?.isConnected) lastFocused.focus(); });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !dialog.hasAttribute('data-escape-disabled')) { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); return; }
      if (event.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll(focusable)]; if (!items.length) return;
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  });
}
