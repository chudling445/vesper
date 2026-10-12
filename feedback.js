let toastRegion = null;

function ensureRegion() {
  if (toastRegion) return toastRegion;
  toastRegion = document.querySelector('#toast-region') || document.createElement('div');
  toastRegion.id = 'toast-region'; toastRegion.className = 'toast-region'; toastRegion.setAttribute('aria-live', 'polite'); toastRegion.setAttribute('aria-atomic', 'false');
  if (!toastRegion.isConnected) document.body.append(toastRegion);
  return toastRegion;
}

export function showToast(message, tone = 'info', options = {}) {
  const region = ensureRegion();
  const toast = document.createElement('div');
  toast.className = `toast toast-${['success', 'warning', 'error', 'info'].includes(tone) ? tone : 'info'}`;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.innerHTML = `<span class="toast-mark" aria-hidden="true">${tone === 'success' ? '✓' : tone === 'warning' ? '!' : tone === 'error' ? '×' : 'i'}</span><span class="toast-copy"></span><button class="toast-close" type="button" aria-label="Dismiss notification">×</button>`;
  toast.querySelector('.toast-copy').textContent = String(message);
  const close = () => { toast.classList.add('toast-leave'); window.setTimeout(() => toast.remove(), 180); };
  toast.querySelector('.toast-close').addEventListener('click', close);
  region.append(toast);
  window.setTimeout(() => toast.classList.add('toast-enter'), 10);
  if (options.timeout !== 0) window.setTimeout(close, options.timeout || (tone === 'error' ? 6500 : 3600));
  return close;
}

export function logError(error, context = 'Vesper') {
  const normalized = error instanceof Error ? error : new Error(String(error));
  console.error(`[Vesper] ${context}`, normalized);
  return normalized;
}

export function initGlobalFeedback() {
  if (window.__vesperFeedbackInitialized) return;
  window.__vesperFeedbackInitialized = true;
  window.addEventListener('error', (event) => { logError(event.error || event.message, 'Uncaught error'); showToast('Something unexpected happened. Vesper is still here; try that action again.', 'error'); });
  window.addEventListener('unhandledrejection', (event) => { logError(event.reason, 'Unhandled promise rejection'); showToast('That action could not finish. Please try again.', 'error'); });
  window.addEventListener('vesper:error', (event) => { const detail = event.detail || {}; logError(detail.error || detail, detail.context || 'Application error'); if (detail.notify !== false) showToast(detail.message || 'Vesper could not save that change.', 'warning'); });
}

export async function withFeedback(task, { pending, success, error = 'That action did not finish.' } = {}) {
  if (pending) showToast(pending, 'info', { timeout: 1400 });
  try { const result = await task(); if (success) showToast(success, 'success'); return result; }
  catch (reason) { const normalized = logError(reason, 'Async action'); showToast(typeof error === 'function' ? error(normalized) : error, 'error'); throw normalized; }
}

export async function safeFetch(input, init = {}, context = 'Network request') {
  try {
    const response = await fetch(input, init);
    const data = await response.clone().json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `${context} failed (${response.status})`);
    return response;
  } catch (error) {
    logError(error, context);
    throw error;
  }
}
