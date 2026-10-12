const STORAGE_KEY = 'vesper-state-v2';
const DB_NAME = 'vesper-local';
const DB_VERSION = 1;
const OBJECT_STORE = 'state';
export const STATE_SCHEMA_VERSION = 3;

const safeParse = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const clone = (value) => JSON.parse(JSON.stringify(value));

export function createFallbackState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: 0,
    session: { messages: [], draft: '', summary: '' },
    settings: {
      llm: { provider: '', model: '' },
      voice: { auto: false, voiceURI: '', language: 'en', rate: 0.99, pitch: 1.16 },
      theme: 'omarchy-quattro', colorMode: 'system', background: 'atelier', personality: 'playful',
      stage: { zoom: 2.15, orbit: false },
      security: { pinSalt: '', pinHash: '', pinHashAlgorithm: '', pinIterations: 0, autoLockMinutes: 15, biometricId: '', biometricPublicKey: '', biometricAlgorithm: 0, biometricOrigin: '', biometricRpId: '', protectInbox: false },
      cloudSync: { endpoint: '', token: '', enabled: false },
    },
    workspace: {
      items: [],
      widgets: [
        { id: 'motivation', title: 'Daily motivation', icon: '✦', size: 'wide', hidden: false },
        { id: 'tasks', title: 'Quick checklist', icon: '✓', size: 'normal', hidden: false },
        { id: 'recent', title: 'Recent items', icon: '◌', size: 'normal', hidden: false },
        { id: 'clock', title: 'Time tracker', icon: '◷', size: 'normal', hidden: false },
      ],
      customization: { preset: 'sunset', accent: '#e7a8dd', font: 'sans', background: '' },
      habits: { days: {}, badges: [] },
      arcade: { theme: 'sakura', classic: {}, scores: {}, cookie: { count: 0, upgrades: {}, lastAt: 0 } },
      pcBuilder: { savedBuilds: [], customParts: [] },
      finance: { quoteEndpoint: '', quotes: {}, assets: [], accounts: [], ledger: [], budgets: [] },
      health: null,
    },
    ui: { lastRoute: '/', reducedMotion: false },
  };
}

function legacyState() {
  const fallback = createFallbackState();
  const read = (key, value) => safeParse(localStorage.getItem(key), value);
  return {
    ...fallback,
    session: { messages: read('vesper-chat-v1', []), draft: '' },
    settings: {
      ...fallback.settings,
      llm: read('vesper-llm-v1', fallback.settings.llm),
      voice: { ...fallback.settings.voice, ...read('vesper-voice-v1', {}) },
      theme: localStorage.getItem('vesper-theme-v3') || fallback.settings.theme,
      background: localStorage.getItem('vesper-background-v1') || fallback.settings.background,
      personality: localStorage.getItem('vesper-personality-v1') || fallback.settings.personality,
      stage: { ...fallback.settings.stage, ...read('vesper-stage-v2', {}) },
    },
  };
}

export function migrateState(input) {
  const fallback = createFallbackState();
  const source = input && typeof input === 'object' ? input : {};
  const migrated = {
    ...fallback,
    ...source,
    session: { ...fallback.session, ...(source.session || {}) },
    settings: {
      ...fallback.settings,
      ...(source.settings || {}),
      llm: { ...fallback.settings.llm, ...(source.settings?.llm || {}) },
      voice: { ...fallback.settings.voice, ...(source.settings?.voice || {}) },
      stage: { ...fallback.settings.stage, ...(source.settings?.stage || {}) },
      security: { ...fallback.settings.security, ...(source.settings?.security || {}) },
      cloudSync: { ...fallback.settings.cloudSync, ...(source.settings?.cloudSync || {}) },
    },
    ui: { ...fallback.ui, ...(source.ui || {}) },
    workspace: {
      ...fallback.workspace,
      ...(source.workspace || {}),
      items: Array.isArray(source.workspace?.items) ? source.workspace.items : fallback.workspace.items,
      widgets: Array.isArray(source.workspace?.widgets) ? source.workspace.widgets : fallback.workspace.widgets,
      customization: { ...fallback.workspace.customization, ...(source.workspace?.customization || {}) },
      habits: { ...fallback.workspace.habits, ...(source.workspace?.habits || {}), days: source.workspace?.habits?.days && typeof source.workspace.habits.days === 'object' ? source.workspace.habits.days : {} },
      arcade: { ...fallback.workspace.arcade, ...(source.workspace?.arcade || {}), classic: source.workspace?.arcade?.classic || {}, scores: source.workspace?.arcade?.scores || {}, cookie: { ...fallback.workspace.arcade.cookie, ...(source.workspace?.arcade?.cookie || {}) } },
      pcBuilder: { ...fallback.workspace.pcBuilder, ...(source.workspace?.pcBuilder || {}), savedBuilds: Array.isArray(source.workspace?.pcBuilder?.savedBuilds) ? source.workspace.pcBuilder.savedBuilds : [], customParts: Array.isArray(source.workspace?.pcBuilder?.customParts) ? source.workspace.pcBuilder.customParts : [] },
      finance: { ...fallback.workspace.finance, ...(source.workspace?.finance || {}), quotes: source.workspace?.finance?.quotes && typeof source.workspace.finance.quotes === 'object' ? source.workspace.finance.quotes : {}, assets: Array.isArray(source.workspace?.finance?.assets) ? source.workspace.finance.assets : [], accounts: Array.isArray(source.workspace?.finance?.accounts) ? source.workspace.finance.accounts : [], ledger: Array.isArray(source.workspace?.finance?.ledger) ? source.workspace.finance.ledger : [], budgets: Array.isArray(source.workspace?.finance?.budgets) ? source.workspace.finance.budgets : [] },
      health: source.workspace?.health && typeof source.workspace.health === 'object' ? source.workspace.health : null,
    },
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: Number(source.updatedAt) || 0,
  };
  if (!Array.isArray(migrated.session.messages)) migrated.session.messages = [];
  migrated.session.messages = migrated.session.messages.filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-40);
  return migrated;
}

function readLocal() {
  try {
    const saved = safeParse(localStorage.getItem(STORAGE_KEY), null);
    return migrateState(saved || legacyState());
  } catch { return createFallbackState(); }
}

function writeLocal(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is unavailable')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open IndexedDB'));
  });
}

async function readIndexed() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(OBJECT_STORE, 'readonly').objectStore(OBJECT_STORE).get('app');
    request.onsuccess = () => { db.close(); resolve(request.result ? migrateState(request.result) : null); };
    request.onerror = () => { db.close(); reject(request.error || new Error('Could not read IndexedDB')); };
  });
}

async function writeIndexed(state) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(OBJECT_STORE, 'readwrite').objectStore(OBJECT_STORE).put(clone(state), 'app');
    request.onsuccess = () => { db.close(); resolve(true); };
    request.onerror = () => { db.close(); reject(request.error || new Error('Could not save IndexedDB state')); };
  });
}

function getPath(object, path, fallback) {
  return path.split('.').reduce((value, key) => value == null ? undefined : value[key], object) ?? fallback;
}
function setPath(object, path, value) {
  const keys = path.split('.'); const last = keys.pop(); let cursor = object;
  for (const key of keys) cursor = cursor[key] ||= {};
  cursor[last] = value;
}

class VesperStateStore {
  constructor() {
    this.state = readLocal();
    this.listeners = new Set();
    this.ready = this.hydrate();
  }
  get(path, fallback) { return getPath(this.state, path, fallback); }
  snapshot() { return clone(this.state); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  set(path, value) {
    setPath(this.state, path, clone(value));
    this.state.updatedAt = Date.now();
    writeLocal(this.state);
    writeIndexed(this.state).catch((error) => { if (!/unavailable/i.test(error?.message || '')) window.dispatchEvent(new CustomEvent('vesper:error', { detail: { error, context: 'state persistence' } })); });
    window.dispatchEvent(new CustomEvent('vesper-state-change', { detail: { path, value: clone(value), updatedAt: this.state.updatedAt } }));
    this.listeners.forEach((listener) => listener(this.state, path));
  }
  async hydrate() {
    try {
      const indexed = await readIndexed();
      if (indexed && indexed.updatedAt >= this.state.updatedAt) {
        this.state = indexed;
        writeLocal(this.state);
        this.listeners.forEach((listener) => listener(this.state, '*'));
        window.dispatchEvent(new CustomEvent('vesper-state-hydrated', { detail: this.snapshot() }));
      } else await writeIndexed(this.state);
    } catch { /* localStorage remains the guaranteed fallback */ }
    return this.state;
  }
  async clear() {
    this.state = createFallbackState();
    writeLocal(this.state);
    try { const db = await openDatabase(); await new Promise((resolve, reject) => { const request = db.transaction(OBJECT_STORE, 'readwrite').objectStore(OBJECT_STORE).delete('app'); request.onsuccess = resolve; request.onerror = () => reject(request.error); }); db.close(); } catch { /* local state was already reset */ }
    this.listeners.forEach((listener) => listener(this.state, '*'));
  }
}

export const appStore = new VesperStateStore();
export const persistenceKeys = { STORAGE_KEY, DB_NAME, OBJECT_STORE };
