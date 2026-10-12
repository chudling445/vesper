import { appStore } from './persistence.js';
import { showToast } from './feedback.js';

const QUEUE_KEY = 'vesper-sync-queue-v1';
const $ = (selector) => document.querySelector(selector);
let queue = [];
let flushTimer = null;

function readQueue() { try { const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function writeQueue() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-200))); } catch { /* local state remains authoritative */ } }
function settings() { return appStore.get('settings.cloudSync', { endpoint: '', token: '', enabled: false }); }
function updateBadge() {
  let badge = $('#offline-badge');
  if (!badge) { badge = document.createElement('span'); badge.id = 'offline-badge'; badge.className = 'offline-badge'; const target = document.querySelector('.local-status,.share-badge,.site-header'); target?.append(badge); }
  const online = navigator.onLine;
  badge.dataset.online = String(online);
  badge.textContent = online ? (queue.length ? `SYNC QUEUED · ${queue.length}` : 'OFFLINE READY') : 'OFFLINE MODE';
  badge.title = online ? (queue.length ? 'Local changes are queued for sync.' : 'Local-first storage is ready; network is available.') : 'All changes are being saved locally until connectivity returns.';
}
function queueMutation(event) { const existing = queue.findIndex((item) => item.path === event.path); const record = { ...event, queuedAt: Date.now() }; if (existing >= 0) queue[existing] = record; else queue.push(record); writeQueue(); updateBadge(); scheduleFlush(); }
async function flush() {
  if (!navigator.onLine || !queue.length) { updateBadge(); return; }
  const config = settings();
  if (!config.enabled || !config.endpoint) { updateBadge(); return; }
  try {
    const response = await fetch(config.endpoint.replace(/\/$/, '') + '/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) }, body: JSON.stringify({ device: 'vesper-local', events: queue }) });
    if (!response.ok) throw new Error(`Sync rejected (${response.status})`);
    queue = []; writeQueue(); updateBadge(); showToast('Workspace changes synced.', 'success', { timeout: 2200 });
  } catch (error) { updateBadge(); console.warn('[Vesper] sync queued locally', error); }
}
function scheduleFlush() { window.clearTimeout(flushTimer); flushTimer = window.setTimeout(flush, 1200); }

export function initOfflineSync() {
  queue = readQueue(); updateBadge();
  window.addEventListener('online', () => { updateBadge(); flush(); showToast('Connection restored. Syncing local changes…', 'info', { timeout: 2400 }); });
  window.addEventListener('offline', () => { updateBadge(); showToast('Offline mode enabled. Your changes are safe locally.', 'info', { timeout: 2600 }); });
  window.addEventListener('vesper-state-change', (event) => queueMutation({ path: event.detail?.path || '*', value: event.detail?.value, type: 'upsert' }));
  window.setInterval(() => { updateBadge(); flush(); }, 30_000);
  flush();
}
export function syncQueueSnapshot() { return [...queue]; }
export async function flushSyncQueue() { await flush(); return queue.length === 0; }
