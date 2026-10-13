import { buildMemoryGraph, normalizeRelatedFactIds } from './memory-graph.mjs';

const DB_NAME = 'vesper-memory-v1';
const DB_VERSION = 1;
const FACTS = 'facts';
const META = 'meta';
const FALLBACK_KEY = 'vesper-memory-v1';

const clean = (value, max = 220) => String(value || '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const idFor = (category, value) => category + ':' + value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 80);
const categories = new Set(['name', 'preference', 'project', 'goal', 'work', 'note']);
const sensitivePattern = /\b(password|passcode|secret(?: key)?|api key|access token|credit card|ssn|social security)\b/i;
const tiers = [
  { at: 0, name: 'New acquaintance' },
  { at: 5, name: 'Familiar' },
  { at: 20, name: 'Trusted companion' },
  { at: 60, name: 'Longtime companion' },
];

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FACTS)) {
        const store = db.createObjectStore(FACTS, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Memory database unavailable'));
  });
}

function extractFacts(text) {
  const source = String(text || '').slice(0, 4000);
  const rules = [
    ['name', /\bmy name is\s+([^.!?\n,;]{1,80})/i],
    ['preference', /\bI (?:really )?(?:like|love|prefer|enjoy)\s+([^.!?\n;]{2,100})/i],
    ['project', /\b(?:I am|I'm|I’m) (?:currently )?(?:working on|building|making|developing)\s+([^.!?\n;]{2,120})/i],
    ['project', /\bmy project is\s+([^.!?\n;]{2,120})/i],
    ['goal', /\bmy goal is\s+([^.!?\n;]{2,120})/i],
    ['work', /\bI work as\s+([^.!?\n;]{2,90})/i],
  ];
  const found = [];
  for (const [category, pattern] of rules) {
    const match = source.match(pattern);
    if (!match) continue;
    const value = clean(match[1]);
    if (value.length < 2 || /\b(password|passcode|secret key|api key|credit card|ssn|social security)\b/i.test(value)) continue;
    found.push({ category, value });
  }
  return found;
}

function localRead() {
  try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{"facts":[],"exchanges":0,"milestones":[]}'); }
  catch { return { facts: [], exchanges: 0, milestones: [] }; }
}

export class RelationshipMemory {
  constructor() {
    this.facts = [];
    this.exchanges = 0;
    this.milestones = [];
    this.database = null;
    this.ready = this.load();
  }

  async load() {
    try {
      const db = await openDatabase();
      this.database = db;
      const [facts, meta] = await new Promise((resolve, reject) => {
        const tx = db.transaction([FACTS, META], 'readonly');
        const factRequest = tx.objectStore(FACTS).getAll();
        const metaRequest = tx.objectStore(META).get('summary');
        tx.oncomplete = () => resolve([factRequest.result || [], metaRequest.result || {}]);
        tx.onerror = () => reject(tx.error);
      });
      const saved = localRead();
      const validFacts = (items) => items.filter((fact) => fact && typeof fact.id === 'string' && typeof fact.category === 'string' && typeof fact.value === 'string');
      this.facts = facts.length ? validFacts(facts) : validFacts(Array.isArray(saved.facts) ? saved.facts : []);
      this.exchanges = Number(meta.exchanges) || Number(saved.exchanges) || 0;
      this.milestones = Array.isArray(meta.milestones) && meta.milestones.length ? meta.milestones : (Array.isArray(saved.milestones) ? saved.milestones : []);
      if (!facts.length && this.facts.length) await this.persist();
    } catch {
      const saved = localRead();
      this.facts = Array.isArray(saved.facts) ? saved.facts.filter((fact) => fact && typeof fact.id === 'string' && typeof fact.category === 'string' && typeof fact.value === 'string') : [];
      this.exchanges = Number(saved.exchanges) || 0;
      this.milestones = Array.isArray(saved.milestones) ? saved.milestones : [];
    }
    return this.snapshot();
  }

  snapshot() {
    const tier = [...tiers].reverse().find((item) => this.exchanges >= item.at) || tiers[0];
    const facts = [...this.facts].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt || 0) - (a.updatedAt || 0));
    const savedFacts = facts.map((fact) => ({ ...fact }));
    return { facts: savedFacts, graph: buildMemoryGraph(savedFacts), exchanges: this.exchanges, milestones: [...this.milestones], tier: tier.name };
  }

  async persist() {
    const snapshot = { facts: this.facts, exchanges: this.exchanges, milestones: this.milestones };
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot)); } catch { /* IndexedDB remains primary when storage is full. */ }
    if (!this.database) return;
    await new Promise((resolve, reject) => {
      const tx = this.database.transaction([FACTS, META], 'readwrite');
      const store = tx.objectStore(FACTS);
      store.clear();
      this.facts.forEach((fact) => store.put(fact));
      tx.objectStore(META).put({ key: 'summary', exchanges: this.exchanges, milestones: this.milestones, updatedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    }).catch(() => {});
  }

  async rememberExchange(text) {
    await this.ready;
    this.exchanges += 1;
    for (const item of extractFacts(text)) {
      const id = idFor(item.category, item.value);
      const existing = this.facts.find((fact) => fact.id === id);
      if (existing) { existing.updatedAt = Date.now(); existing.mentions = (existing.mentions || 1) + 1; }
      else this.facts.push({ id, category: item.category, value: item.value, source: 'conversation', relatedFactIds: [], createdAt: Date.now(), updatedAt: Date.now(), mentions: 1 });
    }
    this.normalizeLinks();
    for (const milestone of [1, 5, 20, 60]) {
      if (this.exchanges >= milestone && !this.milestones.some((entry) => entry.exchange === milestone)) {
        this.milestones.push({ exchange: milestone, at: Date.now() });
      }
    }
    this.facts = this.pruneFacts();
    await this.persist();
    this.dispatchChange();
  }

  pruneFacts() {
    const facts = [...this.facts]
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 100);
    const ids = new Set(facts.map((fact) => fact.id));
    facts.forEach((fact) => { fact.relatedFactIds = normalizeRelatedFactIds(fact.relatedFactIds, ids, fact.id); });
    return facts;
  }

  normalizeLinks() {
    const ids = new Set(this.facts.map((fact) => fact.id));
    this.facts.forEach((fact) => { fact.relatedFactIds = normalizeRelatedFactIds(fact.relatedFactIds, ids, fact.id); });
  }

  dispatchChange() {
    window.dispatchEvent(new CustomEvent('vesper-memory-change', { detail: this.snapshot() }));
  }

  validateManualFact(category, value) {
    const normalizedCategory = categories.has(category) ? category : 'note';
    const normalizedValue = clean(value, 220);
    if (normalizedValue.length < 2) throw new Error('Write at least two characters to save a memory.');
    if (sensitivePattern.test(normalizedValue)) throw new Error('For safety, do not save passwords, access keys, or payment and identity details as memories.');
    return { category: normalizedCategory, value: normalizedValue };
  }

  async addFact({ category = 'note', value, pinned = false, relatedFactIds = [] } = {}) {
    await this.ready;
    const normalized = this.validateManualFact(category, value);
    const now = Date.now();
    const id = idFor(normalized.category, normalized.value);
    const existing = this.facts.find((fact) => fact.id === id);
    if (existing) {
      if (pinned && !existing.pinned && this.facts.filter((fact) => fact.pinned).length >= 6) {
        throw new Error('You can pin up to six memories. Unpin one before adding another.');
      }
      existing.updatedAt = now;
      existing.mentions = (existing.mentions || 1) + 1;
      existing.pinned = Boolean(existing.pinned || pinned);
      existing.source = 'manual';
      existing.relatedFactIds = normalizeRelatedFactIds(relatedFactIds, new Set(this.facts.map((fact) => fact.id)), id);
    } else {
      if (pinned && this.facts.filter((fact) => fact.pinned).length >= 6) {
        throw new Error('You can pin up to six memories. Unpin one before adding another.');
      }
      const knownIds = new Set(this.facts.map((fact) => fact.id));
      this.facts.push({ id, ...normalized, pinned: Boolean(pinned), source: 'manual', relatedFactIds: normalizeRelatedFactIds(relatedFactIds, knownIds, id), createdAt: now, updatedAt: now, mentions: 1 });
    }
    this.facts = this.pruneFacts();
    await this.persist();
    this.dispatchChange();
    return this.snapshot().facts.find((fact) => fact.id === id);
  }

  async updateFact(id, { category = 'note', value, pinned, relatedFactIds } = {}) {
    await this.ready;
    const current = this.facts.find((fact) => fact.id === id);
    if (!current) throw new Error('That memory no longer exists.');
    const normalized = this.validateManualFact(category, value);
    const nextId = idFor(normalized.category, normalized.value);
    const duplicate = this.facts.find((fact) => fact.id === nextId && fact.id !== id);
    const remainingFacts = this.facts.filter((fact) => fact.id !== id && fact.id !== nextId);
    const nextPinned = pinned === undefined ? Boolean(current.pinned || duplicate?.pinned) : Boolean(pinned);
    if (nextPinned && remainingFacts.filter((fact) => fact.pinned).length >= 6) {
      throw new Error('You can pin up to six memories. Unpin one before adding another.');
    }
    for (const fact of remainingFacts) {
      fact.relatedFactIds = normalizeRelatedFactIds(
        (fact.relatedFactIds || []).map((relatedId) => relatedId === id || relatedId === nextId ? nextId : relatedId),
        new Set([...remainingFacts.map((item) => item.id), nextId]),
        fact.id,
      );
    }
    const mergedLinks = relatedFactIds === undefined
      ? [...(current.relatedFactIds || []), ...(duplicate?.relatedFactIds || [])]
      : relatedFactIds;
    this.facts = remainingFacts;
    const knownIds = new Set([...remainingFacts.map((fact) => fact.id), nextId]);
    const now = Date.now();
    this.facts.push({
      ...current,
      ...(duplicate || {}),
      ...normalized,
      id: nextId,
      pinned: nextPinned,
      source: 'manual',
      relatedFactIds: normalizeRelatedFactIds(mergedLinks, knownIds, nextId),
      createdAt: Math.min(current.createdAt || now, duplicate?.createdAt || now),
      updatedAt: now,
      mentions: Math.max(current.mentions || 1, duplicate?.mentions || 1),
    });
    this.facts = this.pruneFacts();
    this.normalizeLinks();
    await this.persist();
    this.dispatchChange();
  }

  async setPinned(id, pinned) {
    await this.ready;
    const fact = this.facts.find((item) => item.id === id);
    if (!fact) throw new Error('That memory no longer exists.');
    if (pinned && !fact.pinned && this.facts.filter((item) => item.pinned).length >= 6) {
      throw new Error('You can pin up to six memories. Unpin one before adding another.');
    }
    fact.pinned = Boolean(pinned);
    fact.updatedAt = Date.now();
    await this.persist();
    this.dispatchChange();
  }

  async deleteFact(id) {
    await this.ready;
    this.facts = this.facts.filter((fact) => fact.id !== id);
    this.normalizeLinks();
    await this.persist();
    this.dispatchChange();
  }

  relevantContext(query = '') {
    const terms = [...new Set((String(query).toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []))];
    const scored = this.facts.map((fact) => ({ fact, score: terms.reduce((n, term) => n + (fact.value.toLocaleLowerCase().includes(term) ? 1 : 0), 0) }));
    const pinned = [...this.facts].filter((fact) => fact.pinned).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);
    const relevant = scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || (b.fact.updatedAt || 0) - (a.fact.updatedAt || 0)).map((entry) => entry.fact);
    const remainder = relevant.length ? relevant : [...this.facts].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const defaultFacts = [...pinned, ...remainder.filter((fact) => !fact.pinned)].slice(0, 8);
    const snapshot = this.snapshot();
    if (!defaultFacts.length && !snapshot.milestones.length) return '';
    const lines = ['Relationship continuity marker: ' + snapshot.tier + ' (' + snapshot.exchanges + ' chats).'];
    if (defaultFacts.length) lines.push(...defaultFacts.map((fact) => 'Remembered ' + fact.category + ': ' + fact.value));
    if (snapshot.milestones.length) lines.push('Milestones: ' + snapshot.milestones.map((item) => item.exchange + ' chats').join(', ') + '.');
    return lines.join('\n').slice(0, 1800);
  }

  async forgetAll() {
    await this.ready;
    this.facts = [];
    this.exchanges = 0;
    this.milestones = [];
    await this.persist();
    this.dispatchChange();
  }
}

export const relationshipMemory = new RelationshipMemory();
