import { appStore } from './persistence.js';
import { renderMarkdown } from './markdown-renderer.js';
import { copyText, downloadText } from './export-utils.js';
import { initThemeProvider } from './theme-provider.js';

initThemeProvider();

const EXAMPLE = {
  html: '<article class="demo-card"><span class="demo-mark">✦</span><p class="demo-kicker">VESPER / CODE LAB</p><h1>A thought,<br><em>taking shape.</em></h1><p class="demo-copy">A quiet space to test a little idea before it finds its home.</p><button type="button">Keep exploring <span>↗</span></button></article>',
  css: 'body { min-height: 100vh; display: grid; place-items: center; padding: 28px; background: radial-gradient(circle at 18% 12%, #d79ed329, transparent 34%), #10131b; color: #f4edf6; font-family: ui-sans-serif, system-ui, sans-serif; }\n.demo-card { position: relative; width: min(420px, 100%); padding: 42px; overflow: hidden; border: 1px solid #e7a8dd44; border-radius: 24px; background: linear-gradient(145deg, #ffffff12, #ffffff04); box-shadow: 0 28px 90px #0008, inset 0 1px #ffffff18; }\n.demo-mark { position: absolute; top: 25px; right: 30px; color: #e7a8dd; font-size: 25px; }\n.demo-kicker { color: #c3a9c4; font: 10px ui-monospace, monospace; letter-spacing: .16em; }\n.demo-card h1 { margin: 24px 0 14px; font: 500 clamp(36px, 8vw, 56px)/.98 Georgia, serif; letter-spacing: -.06em; }\n.demo-card h1 em { color: #e7a8dd; }\n.demo-copy { max-width: 31ch; color: #b1acbb; font-size: 13px; line-height: 1.7; }\n.demo-card button { margin-top: 24px; padding: 11px 14px; border: 1px solid #e7a8dd66; border-radius: 9px; background: #e7a8dd18; color: #f4edf6; font: inherit; cursor: pointer; }\n.demo-card button span { margin-left: 12px; color: #e7a8dd; }',
  js: "console.log('Vesper Code Lab is ready.');\nconsole.info('Try Math.max(12, 28, 7):', Math.max(12, 28, 7));",
  markdown: '# A little scratchpad\n\nShape an idea, then **keep what helps**.\n\n- Notes stay on this device\n- Preview output stays sandboxed\n- Export a clean HTML snapshot when you are ready\n\n```js\nconsole.log("hello, Vesper");\n```',
};

const MAX_HTML = 30_000;
const MAX_CSS = 20_000;
const MAX_JS = 20_000;
const MAX_MARKDOWN = 30_000;
const WORKER_TIMEOUT_MS = 5_000;
const $ = (selector) => document.querySelector(selector);
const editors = {
  html: $('#lab-html'),
  css: $('#lab-css'),
  js: $('#lab-js'),
  markdown: $('#lab-markdown'),
};

const tabs = [...document.querySelectorAll('[data-lab-tab]')];
const preview = $('#lab-preview');
const markdownPreview = $('#lab-markdown-preview');
const runtimeState = $('#lab-runtime-state');
const saveState = $('#lab-save-state');
const consoleLines = $('#lab-console-lines');
let activeTab = 'html';
let saveTimer = 0;
let activeWorker = null;
let runId = 0;

function readDraft() {
  const draft = appStore.get('workspace.codeLab', {});
  return Object.fromEntries(Object.keys(editors).map((key) => [key,
    typeof draft?.[key] === 'string' ? draft[key].slice(0, editors[key].maxLength) : EXAMPLE[key],
  ]));
}

function currentDraft() {
  return Object.fromEntries(Object.entries(editors).map(([key, editor]) => [key, editor.value.slice(0, editor.maxLength)]));
}

function showStatus(element, text, state = '') {
  element.textContent = text;
  element.dataset.state = state;
}

function saveDraft() {
  window.clearTimeout(saveTimer);
  showStatus(saveState, 'SAVING…', 'saving');
  saveTimer = window.setTimeout(() => {
    appStore.set('workspace.codeLab', currentDraft());
    showStatus(saveState, 'SAVED ON THIS DEVICE', 'saved');
  }, 240);
}

function setActiveTab(name, focus = false) {
  if (!Object.hasOwn(editors, name)) return;
  activeTab = name;
  tabs.forEach((tab) => {
    const selected = tab.dataset.labTab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    panel.hidden = !selected;
    if (selected && focus) tab.focus();
  });
}

function safeHtmlFragment(source) {
  // Parse into an inert template in the trusted app page, scrub active content,
  // then render only inside an origin-isolated iframe with a deny-by-default CSP.
  const template = document.createElement('template');
  template.innerHTML = String(source).slice(0, MAX_HTML);
  template.content.querySelectorAll('script, iframe, frame, frameset, object, embed, base, meta, link, form, input[type="file"], foreignObject').forEach((node) => node.remove());
  for (const element of template.content.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || ['srcdoc', 'srcset', 'action', 'formaction', 'target', 'ping'].includes(name)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'href') {
        if (!value.startsWith('#')) element.removeAttribute(attribute.name);
      } else if (['src', 'poster', 'xlink:href'].includes(name)) {
        if (!/^(data:image\/(?:png|gif|jpe?g|webp|avif);base64,|blob:)/i.test(value)) element.removeAttribute(attribute.name);
      }
    }
  }
  return template.innerHTML;
}

function makePreviewDocument() {
  const csp = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline' data: blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const css = editors.css.value.slice(0, MAX_CSS).replace(/<\/style/gi, '<\\/style');
  const html = safeHtmlFragment(editors.html.value);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}</body></html>`;
}

function setConsoleMessage(message, kind = 'log') {
  consoleLines.querySelector('.lab-console-empty')?.remove();
  const row = document.createElement('p');
  row.className = `lab-console-line is-${kind}`;
  row.textContent = message;
  consoleLines.append(row);
  while (consoleLines.children.length > 60) consoleLines.firstElementChild.remove();
  consoleLines.scrollTop = consoleLines.scrollHeight;
}

function clearConsole() {
  const empty = document.createElement('p');
  empty.className = 'lab-console-empty';
  empty.textContent = 'Nothing logged yet.';
  consoleLines.replaceChildren(empty);
}

function stopWorker() {
  runId += 1;
  if (activeWorker) activeWorker.terminate();
  activeWorker = null;
}

function runJavaScript(source) {
  stopWorker();
  const code = String(source).slice(0, MAX_JS);
  if (!code.trim()) return;

  const currentRun = runId;
  showStatus(runtimeState, 'RUNNING', 'running');
  let worker;
  try { worker = new Worker('/code-worker.js'); }
  catch (error) {
    setConsoleMessage(error?.message || 'The sandbox worker is unavailable.', 'error');
    showStatus(runtimeState, 'UNAVAILABLE', 'error');
    return;
  }
  activeWorker = worker;
  const timeout = window.setTimeout(() => {
    if (currentRun !== runId) return;
    runId += 1;
    worker.terminate();
    if (activeWorker === worker) activeWorker = null;
    setConsoleMessage(`Stopped after ${WORKER_TIMEOUT_MS / 1000} seconds.`, 'error');
    showStatus(runtimeState, 'STOPPED', 'error');
  }, WORKER_TIMEOUT_MS);

  worker.addEventListener('message', (event) => {
    if (currentRun !== runId || event.source) return;
    runId += 1;
    window.clearTimeout(timeout);
    for (const entry of event.data?.logs || []) setConsoleMessage(entry.text, entry.level);
    if (event.data?.error) setConsoleMessage(event.data.error, 'error');
    if (event.data?.result) setConsoleMessage(event.data.result, 'result');
    worker.terminate();
    if (activeWorker === worker) activeWorker = null;
    showStatus(runtimeState, event.data?.error ? 'ERROR' : 'COMPLETE', event.data?.error ? 'error' : 'ready');
  });
  worker.addEventListener('error', (event) => {
    if (currentRun !== runId) return;
    runId += 1;
    window.clearTimeout(timeout);
    setConsoleMessage(event.message || 'The sandbox worker could not run this code.', 'error');
    worker.terminate();
    if (activeWorker === worker) activeWorker = null;
    showStatus(runtimeState, 'ERROR', 'error');
  }, { once: true });
  worker.postMessage({ code });
}

function renderMarkdownPreview() {
  preview.hidden = true;
  markdownPreview.hidden = false;
  markdownPreview.innerHTML = renderMarkdown(editors.markdown.value.slice(0, MAX_MARKDOWN));
}

markdownPreview.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy-code]');
  if (!button) return;
  const codeBlock = [...markdownPreview.querySelectorAll('[data-code-index]')]
    .find((code) => code.dataset.codeIndex === button.dataset.copyCode);
  if (!codeBlock) return;
  const original = button.textContent;
  try {
    await copyText(codeBlock.textContent);
    button.textContent = 'COPIED';
  } catch {
    button.textContent = 'FAILED';
  }
  window.setTimeout(() => { button.textContent = original; }, 1000);
});

function run() {
  stopWorker();
  if (activeTab === 'markdown') {
    renderMarkdownPreview();
    showStatus(runtimeState, 'MARKDOWN', 'ready');
    return;
  }
  markdownPreview.hidden = true;
  preview.hidden = false;
  preview.srcdoc = makePreviewDocument();
  clearConsole();
  runJavaScript(editors.js.value);
  if (!editors.js.value.trim()) showStatus(runtimeState, 'PREVIEW READY', 'ready');
}

function exportHtml() {
  const documentHtml = makePreviewDocument();
  downloadText('vesper-code-lab.html', documentHtml, 'text/html;charset=utf-8');
}

async function copyActiveSource(button) {
  const original = button.textContent;
  try {
    await copyText(editors[activeTab].value);
    button.textContent = 'COPIED';
  } catch {
    button.textContent = 'COPY FAILED';
  }
  window.setTimeout(() => { button.textContent = original; }, 1200);
}

function resetExample() {
  for (const [key, editor] of Object.entries(editors)) editor.value = EXAMPLE[key];
  saveDraft();
  if (activeTab === 'markdown') renderMarkdownPreview();
  else {
    markdownPreview.hidden = true;
    preview.hidden = false;
    preview.srcdoc = makePreviewDocument();
    showStatus(runtimeState, 'PREVIEW READY', 'ready');
  }
}

async function initialize() {
  await appStore.ready;
  const draft = readDraft();
  for (const [key, editor] of Object.entries(editors)) editor.value = draft[key];

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.labTab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setActiveTab(tabs[nextIndex].dataset.labTab, true);
    });
  });
  Object.values(editors).forEach((editor) => editor.addEventListener('input', saveDraft));
  $('#lab-run').addEventListener('click', run);
  $('#lab-copy').addEventListener('click', (event) => copyActiveSource(event.currentTarget));
  $('#lab-export').addEventListener('click', exportHtml);
  $('#lab-reset').addEventListener('click', resetExample);
  $('#lab-clear-console').addEventListener('click', clearConsole);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); run(); }
  });
  showStatus(saveState, 'SAVED ON THIS DEVICE', 'saved');
  setActiveTab(activeTab);
  preview.srcdoc = makePreviewDocument();
  showStatus(runtimeState, 'PREVIEW READY', 'ready');
}

window.addEventListener('pagehide', () => {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    appStore.set('workspace.codeLab', currentDraft());
  }
  stopWorker();
}, { once: true });

initialize().catch((error) => {
  showStatus(saveState, 'LOCAL SAVE UNAVAILABLE', 'error');
  setConsoleMessage(error?.message || 'Could not initialize the Code Lab.', 'error');
});
