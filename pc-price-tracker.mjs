import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PART_BY_ID, PARTS } from './pc-price-catalog.mjs';

export const PRICE_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const PRICE_HISTORY_START_YEAR = 2020;
export const PRICE_CONDITIONS = new Set(['new', 'used', 'free']);
const FEED_CONFIG_VERSION = 1;
const MAX_FEEDS = 12;
const MAX_LISTINGS_PER_FEED = 3000;
const MAX_OBSERVATIONS = 200_000;
const MAX_FEED_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const HISTORY_START_MS = Date.UTC(PRICE_HISTORY_START_YEAR, 0, 1);

const slug = (value) => String(value).toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'item';
const normalizeName = (value) => String(value || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function inPrivateIPv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 2 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0) || a === 240;
}

function isPublicAddress(address) {
  const type = isIP(address);
  if (type === 4) return !inPrivateIPv4(address);
  if (type !== 6) return false;
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return isIP(mapped) === 4 && !inPrivateIPv4(mapped);
  }
  const firstGroup = Number.parseInt(normalized.split(':')[0] || '0', 16);
  return firstGroup >= 0x2000 && firstGroup <= 0x3fff;
}

export async function validateFeedUrl(value, resolveHost = lookup) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Feed URL must be a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') {
    throw new Error('Price feeds must use public HTTPS without embedded credentials or a custom port.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
    || hostname.endsWith('.internal') || hostname.endsWith('.test')) {
    throw new Error('Price feed host must be a public Internet host.');
  }
  const ipType = isIP(hostname);
  if (ipType) {
    if (!isPublicAddress(hostname)) throw new Error('Private and reserved network addresses are not valid price feed hosts.');
    return url;
  }
  let addresses;
  try { addresses = await resolveHost(hostname, { all: true, verbatim: true }); }
  catch { throw new Error('Price feed host could not be resolved.'); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Price feed host must resolve only to public Internet addresses.');
  }
  return url;
}

function loadFeedConfig(raw) {
  if (!isPlainObject(raw) || raw.schemaVersion !== FEED_CONFIG_VERSION || !Array.isArray(raw.feeds)) {
    throw new Error('Price feed config must contain schemaVersion 1 and a feeds array.');
  }
  if (raw.feeds.length > MAX_FEEDS) throw new Error(`Configure no more than ${MAX_FEEDS} price feeds.`);
  const ids = new Set();
  return raw.feeds.map((feed) => {
    if (!isPlainObject(feed)) throw new Error('Each price feed must be an object.');
    const id = String(feed.id || '').trim();
    const name = String(feed.name || '').trim();
    const url = String(feed.url || '').trim();
    const tokenEnv = String(feed.tokenEnv || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/i.test(id) || !name || name.length > 80 || !url) {
      throw new Error('Each price feed needs a short ID, display name, and URL.');
    }
    if (ids.has(id)) throw new Error(`Duplicate price feed ID: ${id}`);
    ids.add(id);
    if (tokenEnv && !/^[A-Z][A-Z0-9_]{0,63}$/.test(tokenEnv)) throw new Error(`Invalid tokenEnv name for feed ${id}.`);
    return { id, name, url, tokenEnv };
  });
}

function readIsoDate(value, fallback, { allowHistory = true } = {}) {
  const timestamp = value == null || value === '' ? fallback : Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + MAX_CLOCK_SKEW_MS) throw new Error('Observation time must be a valid date no later than the near future.');
  if (!allowHistory && timestamp < Date.now() - PRICE_REFRESH_INTERVAL_MS * 4) throw new Error('Live feed observations must be recent; use a dated manual import for history.');
  if (timestamp < HISTORY_START_MS) throw new Error(`Observation time must be in ${PRICE_HISTORY_START_YEAR} or later.`);
  return new Date(timestamp).toISOString();
}

function resolveProduct(raw) {
  const requestedId = String(raw.partId || '').trim();
  if (requestedId && PART_BY_ID.has(requestedId)) {
    const part = PART_BY_ID.get(requestedId);
    return { partId: part.id, name: part.name, brand: part.brand, category: part.cat, match: 'catalog-id' };
  }
  const name = String(raw.name || raw.title || '').trim().slice(0, 160);
  const brand = String(raw.brand || '').trim().slice(0, 80);
  if (requestedId && /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(requestedId) && name) {
    return { partId: requestedId, name, brand, category: String(raw.category || 'other').slice(0, 50), match: 'provider-id' };
  }
  if (!name) throw new Error('Each observation needs a catalog partId or product name.');
  const normalized = normalizeName(name);
  const exact = PARTS.find((part) => normalizeName(part.name) === normalized
    || normalizeName(`${part.brand} ${part.name}`) === normalized);
  if (exact) return { partId: exact.id, name: exact.name, brand: exact.brand, category: exact.cat, match: 'exact-name' };
  const category = String(raw.category || 'other').trim().slice(0, 50) || 'other';
  const partId = `custom-${slug(category)}-${slug(brand)}-${slug(name)}`.slice(0, 180);
  return { partId, name, brand, category, match: 'unmatched' };
}

export function normalizePriceObservation(raw, options = {}) {
  if (!isPlainObject(raw)) throw new Error('Each price observation must be an object.');
  const product = resolveProduct(raw);
  const condition = String(raw.condition || 'new').toLowerCase();
  if (!PRICE_CONDITIONS.has(condition)) throw new Error('Condition must be new, used, or free.');
  const currency = String(raw.currency || 'INR').toUpperCase();
  if (currency !== 'INR') throw new Error('Observations must already be in INR; conversions need a dated, attributed exchange rate.');
  const price = Number(raw.priceINR ?? raw.price);
  if (!Number.isFinite(price) || price < 0 || (condition === 'free' ? price !== 0 : price <= 0)) {
    throw new Error(condition === 'free' ? 'Free listings must have a price of zero.' : 'Paid listings must have a positive INR price.');
  }
  const source = String(raw.source || options.source || '').trim().slice(0, 100);
  if (!source) throw new Error('Each observation needs its original marketplace or retailer source.');
  const sourceUrl = String(raw.sourceUrl || raw.url || '').trim();
  if (sourceUrl) {
    let parsed;
    try { parsed = new URL(sourceUrl); } catch { throw new Error('Listing URL must be a valid HTTPS URL.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Listing URLs must use HTTPS and must not contain credentials.');
  }
  const observedAt = readIsoDate(raw.observedAt || raw.recordedAt, options.observedAt || Date.now(), { allowHistory: options.allowHistory !== false });
  const listingId = String(raw.listingId || raw.id || sourceUrl || normalizeName(`${source} ${product.brand} ${product.name} ${condition}`))
    .trim().slice(0, 200);
  const day = observedAt.slice(0, 10);
  const key = [source.toLowerCase(), product.partId, condition, listingId.toLowerCase(), day].join('\u001f');
  const id = createHash('sha256').update(key).digest('hex').slice(0, 32);
  return {
    id,
    partId: product.partId,
    name: product.name,
    brand: product.brand,
    category: product.category,
    match: product.match,
    condition,
    priceINR: price,
    currency: 'INR',
    source,
    sourceUrl,
    listingId,
    availability: String(raw.availability || 'available').toLowerCase().slice(0, 30),
    observedAt,
    capturedAt: Date.now(),
  };
}

async function readResponseLimited(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('Price feed response exceeded the size limit.');
  if (!response.body) throw new Error('Price feed returned an empty response.');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error('Price feed response exceeded the size limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function mergeObservations(existing, incoming) {
  const records = new Map(existing.map((record) => [record.id, record]));
  incoming.forEach((record) => records.set(record.id, record));
  const all = [...records.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  if (all.length > MAX_OBSERVATIONS) all.splice(0, all.length - MAX_OBSERVATIONS);
  return all;
}

export function summarizeYearHistory(observations, { partId, condition, year, launchYear, currentYear = new Date().getFullYear() }) {
  const matching = observations.filter((record) => record.partId === partId && record.condition === condition
    && new Date(record.observedAt).getUTCFullYear() === year);
  if (matching.length) {
    const prices = matching.map((record) => record.priceINR).sort((a, b) => a - b);
    return {
      year, status: 'observed', count: matching.length, minINR: prices[0], maxINR: prices.at(-1),
      lastObservedAt: matching.at(-1).observedAt,
      sources: [...new Set(matching.map((record) => record.source))],
    };
  }
  if (launchYear != null && year < launchYear) return { year, status: 'not-released', count: 0, minINR: null, maxINR: null, sources: [] };
  return { year, status: year > currentYear ? 'not-yet-tracked' : 'no-verified-data', count: 0, minINR: null, maxINR: null, sources: [] };
}

export async function createPCPriceTracker({
  root,
  dataPath,
  configPath,
  fetchImpl = fetch,
  resolveHost = lookup,
  now = () => Date.now(),
  logError = (error) => console.error('PC price feed refresh failed:', error),
} = {}) {
  if (!root || !dataPath || !configPath) throw new Error('PC price tracker paths are required.');
  const [configText, storedText] = await Promise.all([
    readFile(configPath, 'utf8').catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)),
    readFile(dataPath, 'utf8').catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)),
  ]);
  const config = configText == null ? [] : loadFeedConfig(JSON.parse(configText));
  const state = storedText == null ? { schemaVersion: 1, observations: [], lastRefreshAt: null, feeds: {} } : JSON.parse(storedText);
  if (!isPlainObject(state) || state.schemaVersion !== 1 || !Array.isArray(state.observations) || !isPlainObject(state.feeds)) {
    throw new Error('PC price tracker data file is corrupt or has an unsupported schema.');
  }
  let refreshPromise = null;
  let timer = null;
  let lastManualRefreshAt = 0;

  async function persist() {
    await mkdir(dirname(dataPath), { recursive: true });
    const tempPath = `${dataPath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, dataPath);
  }

  async function requestFeed(feed) {
    const url = await validateFeedUrl(feed.url, resolveHost);
    const headers = { Accept: 'application/json' };
    const token = feed.tokenEnv ? process.env[feed.tokenEnv] : '';
    if (feed.tokenEnv && !token) throw new Error(`The configured credential ${feed.tokenEnv} is not set.`);
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (response.status >= 300 && response.status < 400) throw new Error('Price feed redirects are not followed; configure its final HTTPS API URL.');
    if (!response.ok) throw new Error(`Price feed returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('json')) throw new Error('Price feed must return application/json.');
    const body = JSON.parse(await readResponseLimited(response, MAX_FEED_BYTES));
    if (!isPlainObject(body) || body.schemaVersion !== 1 || !Array.isArray(body.listings)) {
      throw new Error('Price feed must return schemaVersion 1 and a listings array.');
    }
    if (body.listings.length > MAX_LISTINGS_PER_FEED) throw new Error(`Price feed exceeded ${MAX_LISTINGS_PER_FEED} listings.`);
    const capturedAt = new Date(now()).toISOString();
    return body.listings.map((listing) => normalizePriceObservation(listing, {
      source: feed.name,
      observedAt: body.observedAt || capturedAt,
      allowHistory: false,
    }));
  }

  async function refresh({ manual = false } = {}) {
    if (refreshPromise) return refreshPromise;
    if (manual && now() - lastManualRefreshAt < 60_000) {
      return { ok: false, rateLimited: true, message: 'Wait one minute before requesting another manual feed refresh.' };
    }
    if (manual) lastManualRefreshAt = now();
    if (!config.length) {
      return { ok: false, noSources: true, message: 'No authorized live price feeds are configured. Add feeds to pc-price-feeds.local.json or enter/import source-attributed listings.' };
    }
    refreshPromise = (async () => {
      const runAt = new Date(now()).toISOString();
      const outcomes = await Promise.all(config.map(async (feed) => {
        try {
          const observations = await requestFeed(feed);
          state.observations = mergeObservations(state.observations, observations);
          state.feeds[feed.id] = { name: feed.name, ok: true, lastAttemptAt: runAt, lastSuccessAt: runAt, count: observations.length, error: '' };
          return { id: feed.id, name: feed.name, ok: true, count: observations.length };
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 300) : 'Unknown feed error.';
          state.feeds[feed.id] = { name: feed.name, ok: false, lastAttemptAt: runAt, lastSuccessAt: state.feeds[feed.id]?.lastSuccessAt || null, count: 0, error: message };
          logError(new Error(`${feed.name}: ${message}`));
          return { id: feed.id, name: feed.name, ok: false, count: 0, error: message };
        }
      }));
      state.lastRefreshAt = runAt;
      await persist();
      const succeeded = outcomes.filter((item) => item.ok).length;
      return {
        ok: succeeded > 0,
        refreshedAt: runAt,
        feeds: outcomes,
        message: `${succeeded} of ${outcomes.length} configured price feeds refreshed.`,
      };
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  function listManualStatuses() {
    return config.map((feed) => ({
      id: feed.id,
      name: feed.name,
      status: state.feeds[feed.id] || { ok: null, lastAttemptAt: null, lastSuccessAt: null, count: 0, error: '' },
    }));
  }

  async function addObservations(input) {
    if (!Array.isArray(input) || !input.length || input.length > 10_000) throw new Error('Import between 1 and 10,000 price observations at a time.');
    const normalized = input.map((record) => normalizePriceObservation(record, { allowHistory: true }));
    state.observations = mergeObservations(state.observations, normalized);
    await persist();
    return normalized.length;
  }

  async function start() {
    if (!config.length) return;
    if (timer) return;
    timer = setInterval(() => { void refresh().catch(logError); }, PRICE_REFRESH_INTERVAL_MS);
    timer.unref?.();
    void refresh().catch(logError);
  }

  return {
    start,
    refresh,
    addObservations,
    getStatus() {
      const latest = [...new Map(state.observations.slice().sort((a, b) => b.observedAt.localeCompare(a.observedAt))
        .map((record) => [`${record.partId}\u001f${record.condition}\u001f${record.source}\u001f${record.listingId}`, record])).values()]
        .slice(0, 5000);
      return {
        schemaVersion: 1,
        refreshIntervalMs: PRICE_REFRESH_INTERVAL_MS,
        lastRefreshAt: state.lastRefreshAt,
        nextRefreshAt: state.lastRefreshAt ? new Date(Date.parse(state.lastRefreshAt) + PRICE_REFRESH_INTERVAL_MS).toISOString() : null,
        observationCount: state.observations.length,
        feeds: listManualStatuses(),
        hasConfiguredFeeds: config.length > 0,
        latest,
      };
    },
    getHistory({ partId, condition, year } = {}) {
      return state.observations.filter((record) => (!partId || record.partId === partId)
        && (!condition || record.condition === condition)
        && (!year || new Date(record.observedAt).getUTCFullYear() === year))
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    },
  };
}
