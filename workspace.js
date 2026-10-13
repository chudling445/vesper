import { appStore } from './persistence.js';
import { mountThemeSelector } from './theme-selector.js';
import './arcade-launcher.js';
import { initGlobalFeedback, safeFetch, showToast } from './feedback.js';
import { copyText, downloadText, toCsv, toMarkdown, workspaceSnapshot } from './export-utils.js';
import { initOfflineSync } from './offline-sync.js';
import { decryptBackup, encryptBackup, MAX_BACKUP_BYTES } from './crypto-backup.mjs';

initGlobalFeedback();
initOfflineSync();
const $ = (selector) => document.querySelector(selector);
const uid = () => `${Date.now().toString(36)}-${crypto.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 8)}`;
const categories = ['Personal', 'Work', 'Shopping', 'Family'];
const statuses = [{ id: 'inbox', label: 'INBOX' }, { id: 'today', label: 'TODAY' }, { id: 'doing', label: 'IN PROGRESS' }, { id: 'done', label: 'DONE' }];
const defaultWidgets = [
  { id: 'motivation', title: 'Daily motivation', icon: '✦', size: 'wide', hidden: false },
  { id: 'tasks', title: 'Quick checklist', icon: '✓', size: 'normal', hidden: false },
  { id: 'recent', title: 'Recent items', icon: '◌', size: 'normal', hidden: false },
  { id: 'clock', title: 'Time tracker', icon: '◷', size: 'normal', hidden: false },
  { id: 'habits', title: 'Habit pulse', icon: '▦', size: 'wide', hidden: false },
];
const defaultCustomization = { preset: 'sunset', accent: '#e7a8dd', accentCustom: false, font: 'sans', background: '' };
mountThemeSelector(document.querySelector('#global-theme-selector'));
let items = appStore.get('workspace.items', []);
let widgets = appStore.get('workspace.widgets', defaultWidgets);
let customization = { ...defaultCustomization, ...appStore.get('workspace.customization', {}) };
let habits = appStore.get('workspace.habits', { days: {}, badges: [] });
let currentView = 'dashboard'; let calendarDate = new Date(); let selectedProject = 'all';

function saveItems() { appStore.set('workspace.items', items); }
function saveWidgets() { appStore.set('workspace.widgets', widgets); }
function saveCustomization() { appStore.set('workspace.customization', customization); $('#customization-saved').textContent = 'SAVED LOCALLY · JUST NOW'; }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = String(value ?? ''); return div.innerHTML; }
function dateLabel(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date'; }
function itemSummary(item) { return `${item.title}${item.project ? `\nProject: ${item.project}` : ''}${item.body ? `\n${item.body}` : ''}`; }
function projectNames() { return [...new Set(items.map((item) => String(item.project || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function renderProjectOptions() {
  const names = projectNames();
  const filter = $('#project-filter');
  if (filter) {
    if (selectedProject !== 'all' && !names.includes(selectedProject)) selectedProject = 'all';
    filter.replaceChildren(new Option('ALL PROJECTS', 'all'));
    names.forEach((name) => filter.add(new Option(name, name)));
    filter.value = selectedProject;
  }
  const datalist = $('#workspace-project-options');
  if (datalist) { datalist.replaceChildren(); names.forEach((name) => datalist.append(new Option(name, name))); }
}
function trackActivity(type) { const key = new Date().toISOString().slice(0, 10); const day = { checkins: 0, notes: 0, tasks: 0, ...(habits.days[key] || {}) }; day[type] = (day[type] || 0) + 1; habits = { ...habits, days: { ...habits.days, [key]: day } }; appStore.set('workspace.habits', habits); }
function habitStreak() { let streak = 0; const cursor = new Date(); while (habits.days[cursor.toISOString().slice(0, 10)]?.checkins) { streak += 1; cursor.setDate(cursor.getDate() - 1); } return streak; }

function renderDashboard() {
  const grid = $('#dashboard-grid'); grid.replaceChildren();
  widgets.filter((widget) => !widget.hidden).forEach((widget) => {
    const card = document.createElement('article'); card.className = `dash-widget ${widget.size === 'wide' ? 'is-wide' : ''}`; card.draggable = true; card.dataset.widget = widget.id;
    const header = `<div class="widget-head"><span><b>${widget.icon}</b>${widget.title}</span><div><button class="widget-size" type="button" title="Resize widget" data-widget-size="${widget.id}">↗</button><button class="widget-hide" type="button" title="Hide widget" data-widget-hide="${widget.id}">×</button></div></div>`;
    let content = '';
    if (widget.id === 'motivation') content = `<div class="motivation"><span class="motivation-mark">“</span><p>${['Make something small and true today.', 'A quiet start still counts as momentum.', 'You do not need a perfect plan to begin.'][new Date().getDate() % 3]}</p><small>VESPER / DAILY NOTE</small></div>`;
    if (widget.id === 'tasks') { const tasks = items.filter((item) => item.status !== 'done').slice(0, 4); content = `<div class="widget-list">${tasks.length ? tasks.map((item) => `<label><input type="checkbox" data-complete="${item.id}" /> <span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.category)}</small></label>`).join('') : '<p class="empty-state">Your next small thing can live here.</p>'}</div><button class="widget-link" data-open-view="inbox">OPEN INBOX →</button>`; }
    if (widget.id === 'recent') { const recent = [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4); content = `<div class="widget-list recent-list">${recent.length ? recent.map((item) => `<button data-focus-item="${item.id}"><span class="category-dot ${item.category.toLowerCase()}"></span>${escapeHtml(item.title)}<small>${dateLabel(item.due)}</small></button>`).join('') : '<p class="empty-state">Captured items will appear here.</p>'}</div>`; }
    if (widget.id === 'clock') { const now = new Date(); content = `<div class="clock-widget"><strong>${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><span>${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span><small>${items.filter((item) => item.status === 'done').length} completed · ${items.filter((item) => item.status !== 'done').length} open</small></div>`; }
    if (widget.id === 'habits') { const cells = Array.from({ length: 28 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (27 - index)); const day = habits.days[date.toISOString().slice(0, 10)] || {}; const level = Math.min(4, (day.checkins || 0) + (day.notes || 0) + (day.tasks || 0)); return `<span class="habit-cell level-${level}" title="${date.toLocaleDateString()}"></span>`; }).join(''); const totalNotes = Object.values(habits.days).reduce((sum, day) => sum + (day.notes || 0), 0); content = `<div class="habit-widget"><div class="habit-summary"><strong>${habitStreak()} day${habitStreak() === 1 ? '' : 's'}</strong><span>current streak</span><small>${totalNotes} notes captured · ${habits.badges?.length || 0} milestones</small></div><div class="habit-heatmap">${cells}</div></div>`; }
    card.innerHTML = header + content; grid.append(card);
  });
  if (!grid.children.length) grid.innerHTML = '<div class="empty-dashboard"><h3>Your dashboard is yours to shape.</h3><p>Use the customization controls to bring widgets back.</p><button class="quiet-button" id="restore-widgets" type="button">RESTORE WIDGETS</button></div>';
  bindDashboardEvents();
}
function bindDashboardEvents() {
  document.querySelectorAll('[data-widget-size]').forEach((button) => button.addEventListener('click', () => { const widget = widgets.find((item) => item.id === button.dataset.widgetSize); if (widget) widget.size = widget.size === 'wide' ? 'normal' : 'wide'; saveWidgets(); renderDashboard(); }));
  document.querySelectorAll('[data-widget-hide]').forEach((button) => button.addEventListener('click', () => { const widget = widgets.find((item) => item.id === button.dataset.widgetHide); if (widget) widget.hidden = true; saveWidgets(); renderDashboard(); showToast('Widget hidden. You can restore it with Reset layout.', 'info'); }));
  document.querySelectorAll('[data-complete]').forEach((input) => input.addEventListener('change', () => { const item = items.find((entry) => entry.id === input.dataset.complete); if (item) item.status = 'done'; trackActivity('tasks'); saveItems(); renderDashboard(); renderBoard(); renderCalendar(); showToast('Task completed.', 'success'); }));
  document.querySelectorAll('[data-open-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.openView)));
  document.querySelectorAll('[data-focus-item]').forEach((button) => button.addEventListener('click', () => { switchView('inbox'); window.setTimeout(() => document.querySelector(`[data-item-id="${button.dataset.focusItem}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }));
  document.querySelectorAll('.dash-widget').forEach((card) => { card.addEventListener('dragstart', () => card.classList.add('is-dragging')); card.addEventListener('dragend', () => { card.classList.remove('is-dragging'); reorderWidgets(); }); card.addEventListener('dragover', (event) => { event.preventDefault(); const dragging = document.querySelector('.dash-widget.is-dragging'); if (dragging && dragging !== card) card.parentNode.insertBefore(dragging, card); }); });
  $('#restore-widgets')?.addEventListener('click', resetWidgets);
}
function reorderWidgets() { const order = [...document.querySelectorAll('[data-widget]')].map((node) => node.dataset.widget); widgets.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); saveWidgets(); }
function resetWidgets() { widgets = defaultWidgets.map((widget) => ({ ...widget })); saveWidgets(); renderDashboard(); showToast('Dashboard layout restored.', 'success'); }

function renderBoard() {
  const board = $('#board'); board.replaceChildren(); renderProjectOptions();
  const visibleItems = selectedProject === 'all' ? items : items.filter((item) => (item.project || '') === selectedProject);
  statuses.forEach((status) => { const column = document.createElement('section'); column.className = 'board-column'; column.dataset.status = status.id; const columnItems = visibleItems.filter((item) => (item.status || 'inbox') === status.id); column.innerHTML = `<div class="column-head"><span>${status.label}</span><b>${columnItems.length}</b></div><div class="column-items" data-drop-status="${status.id}"></div>`; const list = column.querySelector('.column-items'); columnItems.forEach((item) => list.append(renderItem(item))); column.addEventListener('dragover', (event) => { event.preventDefault(); column.classList.add('is-over'); }); column.addEventListener('dragleave', () => column.classList.remove('is-over')); column.addEventListener('drop', (event) => { event.preventDefault(); column.classList.remove('is-over'); const id = event.dataTransfer.getData('text/plain'); const moved = items.find((entry) => entry.id === id); if (moved) { moved.status = status.id; moved.completed = status.id === 'done'; saveItems(); renderBoard(); renderDashboard(); renderCalendar(); showToast(`${status.label} updated.`, 'success'); } }); board.append(column); });
}
function renderItem(item) { const card = document.createElement('article'); card.className = `board-item ${item.completed ? 'is-complete' : ''}`; card.draggable = true; card.dataset.itemId = item.id; card.innerHTML = `<div class="item-top"><span class="category-pill ${item.category.toLowerCase()}">${escapeHtml(item.category)}</span>${item.project ? `<span class="project-pill">${escapeHtml(item.project)}</span>` : ''}<button type="button" class="item-delete" data-delete-item="${item.id}" aria-label="Delete ${escapeHtml(item.title)}">×</button></div><h3>${escapeHtml(item.title)}</h3>${item.body ? `<p>${escapeHtml(item.body)}</p>` : ''}<div class="item-meta"><span>${item.due ? `◷ ${dateLabel(item.due)}` : '◌ captured'}</span><label title="Mark complete"><input type="checkbox" ${item.completed ? 'checked' : ''} data-item-check="${item.id}" />${item.completed ? 'DONE' : 'OPEN'}</label></div>`; card.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', item.id)); card.querySelector('[data-delete-item]').addEventListener('click', () => { items = items.filter((entry) => entry.id !== item.id); saveItems(); renderBoard(); renderDashboard(); renderCalendar(); showToast('Item removed from the inbox.', 'info'); }); card.querySelector('[data-item-check]').addEventListener('change', (event) => { item.completed = event.target.checked; item.status = item.completed ? 'done' : 'inbox'; saveItems(); renderBoard(); renderDashboard(); renderCalendar(); }); return card; }

function renderCalendar() { const calendar = $('#calendar'); const year = calendarDate.getFullYear(); const month = calendarDate.getMonth(); const first = new Date(year, month, 1); const start = (first.getDay() + 6) % 7; const days = new Date(year, month + 1, 0).getDate(); $('#calendar-label').textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); calendar.innerHTML = ['MON','TUE','WED','THU','FRI','SAT','SUN'].map((day) => `<div class="calendar-weekday">${day}</div>`).join(''); for (let i = 0; i < start; i += 1) calendar.insertAdjacentHTML('beforeend', '<div class="calendar-day is-muted"></div>'); for (let day = 1; day <= days; day += 1) { const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const due = items.filter((item) => item.due === iso); const today = new Date(); const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day; calendar.insertAdjacentHTML('beforeend', `<div class="calendar-day ${isToday ? 'is-today' : ''}" data-calendar-date="${iso}"><b>${day}</b><div>${due.map((item) => `<button class="calendar-item ${item.category.toLowerCase()}" data-focus-item="${item.id}">${escapeHtml(item.title)}</button>`).join('')}</div></div>`); } document.querySelectorAll('[data-focus-item]').forEach((button) => button.addEventListener('click', () => { switchView('inbox'); window.setTimeout(() => document.querySelector(`[data-item-id="${button.dataset.focusItem}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); })); }

function workspaceThemeAccent() { return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || customization.accent; }
function hasCustomWorkspaceAccent() { return customization.accentCustom === true || (customization.accentCustom !== false && customization.accent !== defaultCustomization.accent); }
function applyCustomization() { const root = document.documentElement; const accent = hasCustomWorkspaceAccent() ? customization.accent : workspaceThemeAccent(); root.style.setProperty('--workspace-accent', accent); root.dataset.workspaceTheme = customization.preset; root.dataset.workspaceFont = customization.font; if (customization.background) document.body.style.setProperty('--workspace-image', `url(${customization.background})`); else document.body.style.removeProperty('--workspace-image'); $('#accent-color').value = accent; $('#accent-follow-theme').hidden = !hasCustomWorkspaceAccent(); $('#display-font').value = customization.font; document.querySelectorAll('[data-custom-theme]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.customTheme === customization.preset))); }
function initCustomization() { const followAccent = document.createElement('button'); followAccent.id = 'accent-follow-theme'; followAccent.className = 'quiet-button accent-follow-theme'; followAccent.type = 'button'; followAccent.textContent = 'FOLLOW GLOBAL THEME'; $('#accent-color').closest('.studio-field').after(followAccent); applyCustomization(); document.querySelectorAll('[data-custom-theme]').forEach((button) => button.addEventListener('click', () => { customization.preset = button.dataset.customTheme; saveCustomization(); applyCustomization(); })); $('#accent-color').addEventListener('input', (event) => { customization.accent = event.target.value; customization.accentCustom = true; saveCustomization(); applyCustomization(); }); followAccent.addEventListener('click', () => { customization.accentCustom = false; customization.accent = workspaceThemeAccent(); saveCustomization(); applyCustomization(); }); document.addEventListener('vesper-palette-change', applyCustomization); $('#display-font').addEventListener('change', (event) => { customization.font = event.target.value; saveCustomization(); applyCustomization(); }); $('#background-upload').addEventListener('change', (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 2_000_000) { showToast('Choose an image smaller than 2 MB.', 'warning'); return; } const reader = new FileReader(); reader.onload = () => { customization.background = reader.result; saveCustomization(); applyCustomization(); showToast('Custom background saved locally.', 'success'); }; reader.readAsDataURL(file); }); }

function switchView(view) { currentView = view; document.querySelectorAll('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-visible', panel.dataset.viewPanel === view)); document.querySelectorAll('.workspace-tab').forEach((tab) => { const active = tab.dataset.view === view; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); }); if (view === 'dashboard') renderDashboard(); if (view === 'inbox') renderBoard(); if (view === 'calendar') renderCalendar(); }
function addItem(data, { notify = true } = {}) { const item = { id: uid(), title: data.title.trim(), body: (data.body || '').trim(), project: String(data.project || '').trim().slice(0, 80), source: data.source === 'file' ? 'file' : 'note', originalName: data.source === 'file' ? String(data.originalName || data.title).slice(0, 140) : '', category: categories.includes(data.category) ? data.category : 'Personal', due: data.due || '', status: data.status || 'inbox', completed: false, createdAt: Date.now() }; items = [item, ...items].slice(0, 200); trackActivity('notes'); saveItems(); renderDashboard(); renderBoard(); renderCalendar(); if (notify) showToast('Saved to your Vesper inbox.', 'success'); return item; }
function openCapture(prefill = {}) { $('#capture-dialog').showModal(); $('#item-title').value = prefill.title || ''; $('#item-body').value = prefill.body || ''; $('#item-project').value = prefill.project || (selectedProject !== 'all' ? selectedProject : ''); $('#item-title').focus(); }
function captureFromForm(event) { event.preventDefault(); const form = event.currentTarget; addItem({ title: $('#item-title').value, body: $('#item-body').value, project: $('#item-project').value, category: $('#item-category').value, due: $('#item-due').value }); form.reset(); $('#capture-dialog').close(); }

async function importTextFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  if (files.length > 10) { showToast('Import up to 10 text files at a time.', 'warning'); return; }
  let storedTextSize = items.reduce((total, item) => total + String(item.body || '').length, 0);
  let imported = 0; const rejected = [];
  for (const file of files) {
    const extension = file.name.split('.').pop().toLocaleLowerCase();
    if (!['txt', 'md', 'markdown', 'csv'].includes(extension)) { rejected.push(`${file.name}: unsupported format`); continue; }
    if (file.size > 400 * 1024) { rejected.push(`${file.name}: larger than 400 KB`); continue; }
    try {
      const available = Math.max(0, 1_500_000 - storedTextSize);
      if (!available) { rejected.push(`${file.name}: workspace text storage limit reached`); continue; }
      const text = (await file.text()).replaceAll('\u0000', '').slice(0, Math.min(20_000, available)).trim();
      if (!text) { rejected.push(`${file.name}: empty file`); continue; }
      addItem({ title: file.name.slice(0, 140), originalName: file.name, body: text, project: selectedProject === 'all' ? '' : selectedProject, category: 'Work', source: 'file' }, { notify: false });
      storedTextSize += text.length;
      imported += 1;
    } catch { rejected.push(`${file.name}: could not read file`); }
  }
  if (imported) showToast(`${imported} file${imported === 1 ? '' : 's'} imported as local notes.${rejected.length ? ` ${rejected.length} skipped.` : ''}`, rejected.length ? 'warning' : 'success');
  else showToast(rejected[0] || 'No readable text files were selected.', 'warning');
}

function exportWorkspace(format) { const snapshot = workspaceSnapshot({ messages: items.map((item) => ({ role: item.category, content: itemSummary(item), pinned: item.completed })), settings: { customization }, route: '/workspace' }); const stamp = new Date().toISOString().slice(0, 10); if (format === 'markdown') downloadText(`vesper-workspace-${stamp}.md`, toMarkdown(snapshot), 'text/markdown;charset=utf-8'); if (format === 'csv') downloadText(`vesper-workspace-${stamp}.csv`, toCsv(snapshot), 'text/csv;charset=utf-8'); if (format === 'pdf') { showToast('Print dialog opened — choose “Save as PDF”.', 'info'); window.print(); } if (format === 'png') exportPng(snapshot); }
function exportPng(snapshot) { const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = Math.min(1700, 260 + snapshot.messages.length * 86); const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0d1018'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = customization.accent; ctx.fillRect(0, 0, canvas.width, 12); ctx.fillStyle = '#f8f2fb'; ctx.font = '600 42px Arial'; ctx.fillText('VESPER WORKSPACE', 78, 100); ctx.fillStyle = '#9ba4b7'; ctx.font = '20px Arial'; ctx.fillText(new Date().toLocaleString(), 80, 140); let y = 230; snapshot.messages.forEach((message) => { ctx.fillStyle = '#1a2030'; ctx.roundRect(70, y - 48, 1260, 64, 14); ctx.fill(); ctx.fillStyle = customization.accent; ctx.font = '700 18px Arial'; ctx.fillText(String(message.role).toUpperCase(), 95, y - 10); ctx.fillStyle = '#e9edf7'; ctx.font = '20px Arial'; ctx.fillText(String(message.content).slice(0, 100), 270, y - 10); y += 86; }); const link = document.createElement('a'); link.download = `vesper-workspace-${new Date().toISOString().slice(0, 10)}.png`; link.href = canvas.toDataURL('image/png'); link.click(); showToast('Stylized PNG exported.', 'success'); }

async function publishWorkspace() { const result = $('#publish-result'); const snapshot = workspaceSnapshot({ messages: items.map((item) => ({ role: item.category, content: itemSummary(item), pinned: item.completed })), settings: { customization }, route: '/workspace' }); try { const response = await safeFetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: $('#publish-title-input').value, snapshot, expiryDays: Number($('#publish-expiry').value), password: $('#publish-password').value, allowCopy: $('#publish-copy').checked }) }, 'Publish workspace'); const data = await response.json(); $('#publish-link').value = `${location.origin}/share/${data.token}`; result.hidden = false; showToast('Read-only link created.', 'success'); } catch (error) { showToast(error.message || 'Could not publish this workspace.', 'error'); } }

$('#item-form').addEventListener('submit', captureFromForm); $('#capture-open').addEventListener('click', () => openCapture()); $('#capture-close').addEventListener('click', () => $('#capture-dialog').close()); $('#capture-cancel').addEventListener('click', () => $('#capture-dialog').close()); $('#new-item').addEventListener('click', () => openCapture()); $('#publish-open').addEventListener('click', () => $('#publish-dialog').showModal()); $('#publish-close').addEventListener('click', () => $('#publish-dialog').close()); $('#publish-cancel').addEventListener('click', () => $('#publish-dialog').close()); $('#publish-form').addEventListener('submit', (event) => { event.preventDefault(); publishWorkspace(); }); $('#publish-copy-link').addEventListener('click', async () => { await copyText($('#publish-link').value); showToast('Link copied.', 'success'); }); $('#reset-widgets').addEventListener('click', resetWidgets); $('#calendar-prev').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); }); $('#calendar-next').addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); }); document.querySelectorAll('.workspace-tab').forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view))); document.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', () => exportWorkspace(button.dataset.export)));
$('#project-filter')?.addEventListener('change', (event) => { selectedProject = event.currentTarget.value; renderBoard(); });
$('#workspace-file-import')?.addEventListener('change', async (event) => { await importTextFiles(event.currentTarget.files); event.currentTarget.value = ''; });
const documentDropzone = $('#document-dropzone');
documentDropzone?.addEventListener('dragover', (event) => { event.preventDefault(); documentDropzone.classList.add('is-over'); });
documentDropzone?.addEventListener('dragleave', (event) => { if (!documentDropzone.contains(event.relatedTarget)) documentDropzone.classList.remove('is-over'); });
documentDropzone?.addEventListener('drop', async (event) => { event.preventDefault(); documentDropzone.classList.remove('is-over'); await importTextFiles(event.dataTransfer?.files || []); });
const cloudSync = appStore.get('settings.cloudSync', { endpoint: '', token: '', enabled: false }); $('#sync-endpoint').value = cloudSync.endpoint || ''; $('#sync-token').value = cloudSync.token || ''; $('#sync-enabled').checked = cloudSync.enabled === true; $('#sync-settings-form')?.addEventListener('submit', (event) => { event.preventDefault(); appStore.set('settings.cloudSync', { endpoint: $('#sync-endpoint').value.trim(), token: $('#sync-token').value.trim(), enabled: $('#sync-enabled').checked }); $('#sync-status').textContent = $('#sync-enabled').checked ? 'SYNC CONFIGURED · LOCAL QUEUE WILL FLUSH WHEN ONLINE' : 'OFFLINE READY · CHANGES STAY ON THIS DEVICE'; showToast('Sync settings saved locally.', 'success'); }); trackActivity('checkins');

$('#backup-export-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const passphrase = $('#backup-passphrase').value;
  const confirmation = $('#backup-passphrase-confirm').value;
  const status = $('#backup-status');
  if (passphrase !== confirmation) { status.textContent = 'Passphrases do not match. No backup was created.'; showToast(status.textContent, 'warning'); return; }
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  status.textContent = 'Encrypting a snapshot on this device…';
  try {
    await appStore.ready;
    const envelope = await encryptBackup(appStore.snapshot(), passphrase);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`vesper-encrypted-backup-${stamp}.json`, JSON.stringify(envelope, null, 2), 'application/json;charset=utf-8');
    status.textContent = 'Encrypted backup downloaded. Store the passphrase separately from the file.';
    showToast('Encrypted backup downloaded.', 'success');
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not create an encrypted backup.';
    showToast(status.textContent, 'error');
  } finally {
    button.disabled = false;
    $('#backup-passphrase').value = '';
    $('#backup-passphrase-confirm').value = '';
  }
});

$('#backup-import-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = $('#backup-file').files?.[0];
  const passphrase = $('#restore-passphrase').value;
  const status = $('#backup-status');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  if (!file) { status.textContent = 'Choose an encrypted backup file first.'; return; }
  if (file.size > MAX_BACKUP_BYTES) { status.textContent = 'Backup file exceeds the 50 MB limit.'; return; }
  button.disabled = true;
  status.textContent = 'Reading and decrypting the backup on this device…';
  try {
    const envelope = JSON.parse(await file.text());
    const restoredState = await decryptBackup(envelope, passphrase);
    if (!window.confirm('Restore this backup? This replaces all current Vesper state on this device, including chats, settings, workspace items, finance records, and health logs. This cannot be undone.')) {
      status.textContent = 'Restore cancelled. Current Vesper data was not changed.';
      return;
    }
    const result = await appStore.replaceSnapshot(restoredState);
    status.textContent = `Backup restored to ${result.storage}. Reloading Vesper…`;
    showToast(`Backup restored to ${result.storage}.`, 'success');
    window.setTimeout(() => window.location.reload(), 900);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not restore this backup.';
    showToast(status.textContent, 'error');
  } finally {
    button.disabled = false;
    $('#restore-passphrase').value = '';
    $('#backup-file').value = '';
  }
});

initCustomization(); renderDashboard(); renderBoard(); renderCalendar();
appStore.ready.then(() => { items = appStore.get('workspace.items', items); widgets = appStore.get('workspace.widgets', widgets); customization = { ...customization, ...appStore.get('workspace.customization', {}) }; applyCustomization(); renderDashboard(); renderBoard(); renderCalendar(); }).catch(() => {});
