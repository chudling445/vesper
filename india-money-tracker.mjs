import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { validateFeedUrl } from './pc-price-tracker.mjs';

export const FUND_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
export const LOAN_REFRESH_INTERVAL_MS = 48 * 60 * 60 * 1000;
export const STRESS_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;
const MAX_FEEDS = 12;
const MAX_RECORDS_PER_FEED = 3000;
const MAX_HISTORY = 100_000;
const MAX_FEED_BYTES = 4 * 1024 * 1024;
const INTERVALS = { fund: FUND_REFRESH_INTERVAL_MS, loan: LOAN_REFRESH_INTERVAL_MS, stress: STRESS_REFRESH_INTERVAL_MS };
const TYPES = { fund: 'funds', loan: 'loans', stress: 'stress' };
const STRESS_CATEGORIES = new Set(['volatility', 'drawdown', 'credit', 'liquidity', 'breadth', 'currency', 'flows']);
const STRESS_MARKETS = new Set(['india', 'global', 'reference-2008']);
const AMFI_NAV_FEED = {
  id: 'amfi-nav', name: 'AMFI published daily NAV file',
  url: 'https://portal.amfiindia.com/spages/NAVAll.txt', tokenEnv: '', type: 'fund', kind: 'amfi',
};
const MFAPI_HISTORY_URL = 'https://api.mfapi.in/mf/';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const slug = (value) => String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'item';

function parseFeedConfig(raw) {
  if (!isObject(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.fundFeeds) || !Array.isArray(raw.loanFeeds)
    || (raw.stressFeeds != null && !Array.isArray(raw.stressFeeds))) {
    throw new Error('India market feed config must contain schemaVersion 1 and fundFeeds and loanFeeds arrays; stressFeeds is optional.');
  }
  const stressFeeds = raw.stressFeeds || [];
  if (raw.fundFeeds.length + raw.loanFeeds.length + stressFeeds.length > MAX_FEEDS) throw new Error(`Configure no more than ${MAX_FEEDS} total market feeds.`);
  const ids = new Set();
  const read = (items, type) => items.map((feed) => {
    if (!isObject(feed)) throw new Error(`Each ${type} feed must be an object.`);
    const id = String(feed.id || '').trim();
    const name = String(feed.name || '').trim();
    const url = String(feed.url || '').trim();
    const tokenEnv = String(feed.tokenEnv || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/i.test(id) || id === 'amfi-nav' || !name || name.length > 80 || !url) throw new Error(`Each ${type} feed needs a unique ID, display name, and URL.`);
    if (ids.has(id)) throw new Error(`Duplicate market feed ID: ${id}`);
    if (tokenEnv && !/^[A-Z][A-Z0-9_]{0,63}$/.test(tokenEnv)) throw new Error(`Invalid tokenEnv name for feed ${id}.`);
    ids.add(id);
    return { id, name, url, tokenEnv, type };
  });
  return [...read(raw.fundFeeds, 'fund'), ...read(raw.loanFeeds, 'loan'), ...read(stressFeeds, 'stress')];
}

function isoTimestamp(value, label, { required = true, maxFutureMs = 5 * 60_000 } = {}) {
  if ((value == null || value === '') && !required) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + maxFutureMs) throw new Error(`${label} must be a valid date no later than the near future.`);
  return new Date(timestamp).toISOString();
}

function httpsSourceUrl(value) {
  const urlText = String(value || '').trim();
  if (!urlText) throw new Error('Each market observation needs a source URL.');
  let url;
  try { url = new URL(urlText); } catch { throw new Error('Source URL must be a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Source URLs must use HTTPS and must not contain credentials.');
  return url.toString();
}

export function normalizeFundObservation(raw, { source, checkedAt = Date.now(), allowHistory = true } = {}) {
  if (!isObject(raw)) throw new Error('Each fund/index observation must be an object.');
  const name = String(raw.name || raw.instrumentName || '').trim().slice(0, 140);
  const instrumentId = String(raw.instrumentId || raw.schemeCode || '').trim().slice(0, 100);
  if (!name || !instrumentId) throw new Error('Fund/index observations need an instrument name and stable instrumentId or schemeCode.');
  const instrumentType = String(raw.instrumentType || '').toLowerCase();
  const valueType = String(raw.valueType || '').toLowerCase();
  if (!['index', 'index-fund', 'etf', 'other'].includes(instrumentType)) throw new Error('Instrument type must be index, index-fund, etf, or other.');
  if (!['index-level', 'nav'].includes(valueType) || (instrumentType === 'index' ? valueType !== 'index-level' : valueType !== 'nav')) {
    throw new Error('Use index-level for an index and NAV for a fund or ETF; never mix index points and rupee NAV.');
  }
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Index level or NAV must be a positive number.');
  const currency = valueType === 'nav' ? String(raw.currency || 'INR').toUpperCase() : '';
  if (valueType === 'nav' && currency !== 'INR') throw new Error('NAV observations must already be in INR.');
  const sourceName = String(raw.source || source || '').trim().slice(0, 100);
  if (!sourceName) throw new Error('Each observation needs its data source.');
  const sourceUrl = httpsSourceUrl(raw.sourceUrl || raw.url);
  const observedAt = isoTimestamp(raw.observedAt || raw.asOf || raw.publishedAt, 'Observed/as-of timestamp');
  if (!allowHistory && Date.now() - Date.parse(observedAt) > 30 * 86_400_000) throw new Error('Live fund/index feed observations older than 30 days must be imported as dated history.');
  const checked = new Date(checkedAt).toISOString();
  const unit = valueType === 'index-level' ? String(raw.unit || 'points').trim().slice(0, 20) : 'INR per unit';
  const idSeed = `${sourceName.toLowerCase()}\u001f${instrumentId.toLowerCase()}\u001f${valueType}\u001f${observedAt}`;
  const returnBasis = String(raw.returnBasis || (valueType === 'nav' ? 'nav-change-excludes-distributions' : 'not-stated')).slice(0, 50);
  if (valueType === 'index-level' && !['price-index', 'total-return-index', 'not-stated'].includes(returnBasis)) {
    throw new Error('Index returnBasis must be price-index, total-return-index, or not-stated.');
  }
  return {
    id: createHash('sha256').update(idSeed).digest('hex').slice(0, 32),
    instrumentId, name, instrumentType, valueType, value, currency, unit, source: sourceName, sourceUrl,
    observedAt, publishedAt: isoTimestamp(raw.publishedAt, 'Published timestamp', { required: false }), returnBasis,
    checkedAt: checked, capturedAt: checked,
  };
}

function amfiDate(value) {
  const match = String(value).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = months.indexOf(match[2].toLowerCase());
  if (month < 0) return null;
  const timestamp = Date.UTC(Number(match[3]), month, Number(match[1]));
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== Number(match[3]) || date.getUTCMonth() !== month || date.getUTCDate() !== Number(match[1])) return null;
  return date.toISOString();
}

export function parseAMFINavText(text, { checkedAt = Date.now() } = {}) {
  if (typeof text !== 'string') throw new Error('AMFI NAV response must be text.');
  const checked = new Date(checkedAt).toISOString();
  const checkedTimestamp = Date.parse(checked);
  const observations = [];
  for (const line of text.split(/\r?\n/)) {
    const fields = line.split(';');
    if (fields.length < 8 || !/^\d{4,9}$/.test(fields[0].trim())) continue;
    const [schemeCode, , , schemeName, plan, option, rawNav, rawDate] = fields.map((field) => field.trim());
    const nav = Number(rawNav);
    const observedAt = amfiDate(rawDate);
    if (!schemeName || !/\b(index|nifty|sensex|bse\s?\d{2,3})\b/i.test(schemeName)
      || !plan || !option || !Number.isFinite(nav) || nav <= 0 || !observedAt) continue;
    if (Date.parse(observedAt) < checkedTimestamp - 30 * 86_400_000) continue;
    const instrumentId = `${schemeCode}-${slug(plan)}-${slug(option)}`;
    observations.push(normalizeFundObservation({
      instrumentId,
      name: `${schemeName} · ${plan} · ${option}`,
      instrumentType: 'index-fund',
      valueType: 'nav',
      value: nav,
      currency: 'INR',
      source: AMFI_NAV_FEED.name,
      sourceUrl: AMFI_NAV_FEED.url,
      observedAt,
    }, { checkedAt: checked, allowHistory: false }));
  }
  if (!observations.length) throw new Error('AMFI NAV file contained no parseable index-scheme observations.');
  return observations;
}

function parseMFAPIDate(value) {
  const match = String(value || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) throw new Error('Historical NAV source returned an invalid date.');
  const [, day, month, year] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) {
    throw new Error('Historical NAV source returned an invalid calendar date.');
  }
  return parsed.toISOString();
}

function comparableSchemeName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function parseMFAPIHistoricalNav(body, { schemeCode, instrumentId, name, verifiedDate, checkedAt = Date.now() } = {}) {
  if (!isObject(body) || !isObject(body.meta) || !Array.isArray(body.data)
    || String(body.meta.scheme_code) !== String(schemeCode) || body.data.length > MAX_HISTORY
    || comparableSchemeName(body.meta.scheme_name) !== comparableSchemeName(name)) {
    throw new Error('Historical NAV response does not match the selected AMFI scheme or exceeds the record limit.');
  }
  if (!/^\d{4,9}$/.test(String(schemeCode)) || !instrumentId || !name) throw new Error('A valid AMFI scheme selection is required.');
  const verifiedTimestamp = Date.parse(verifiedDate);
  if (!Number.isFinite(verifiedTimestamp)) throw new Error('AMFI verification date is invalid.');
  const checked = new Date(checkedAt).toISOString();
  const source = 'MFAPI.in historical NAV mirror (latest NAV cross-checked with AMFI)';
  const sourceUrl = `${MFAPI_HISTORY_URL}${encodeURIComponent(schemeCode)}`;
  const observations = [];
  const seenDates = new Set();
  for (const row of body.data) {
    if (!isObject(row)) throw new Error('Historical NAV source returned an invalid record.');
    const observedAt = parseMFAPIDate(row.date);
    const timestamp = Date.parse(observedAt);
    const value = Number(row.nav);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Historical NAV source returned a non-positive or invalid NAV.');
    if (timestamp < Date.UTC(2020, 0, 1) || timestamp > verifiedTimestamp) continue;
    if (seenDates.has(observedAt)) throw new Error('Historical NAV source returned duplicate dates.');
    seenDates.add(observedAt);
    observations.push(normalizeFundObservation({
      instrumentId, name, instrumentType: 'index-fund', valueType: 'nav', value, currency: 'INR',
      source, sourceUrl, observedAt,
    }, { checkedAt: checked, allowHistory: true }));
  }
  if (!observations.some((record) => record.observedAt === verifiedDate)) {
    throw new Error('Historical NAV mirror has no observation for the date verified against AMFI.');
  }
  return observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

function normalizeLoanObservation(raw, { source, checkedAt = Date.now() } = {}) {
  if (!isObject(raw)) throw new Error('Each lender term must be an object.');
  const lender = String(raw.lender || '').trim().slice(0, 100);
  const loanType = String(raw.loanType || '').toLowerCase();
  if (!lender || !['home-loan', 'lap'].includes(loanType)) throw new Error('Lender terms need a lender name and loanType home-loan or lap.');
  const productName = String(raw.productName || '').trim().slice(0, 100);
  const annualRateMinPercent = Number(raw.annualRateMinPercent ?? raw.annualRatePercent);
  const annualRateMaxPercent = raw.annualRateMaxPercent == null || raw.annualRateMaxPercent === ''
    ? annualRateMinPercent : Number(raw.annualRateMaxPercent);
  if (!Number.isFinite(annualRateMinPercent) || annualRateMinPercent <= 0 || annualRateMinPercent > 100
    || !Number.isFinite(annualRateMaxPercent) || annualRateMaxPercent < annualRateMinPercent || annualRateMaxPercent > 100) {
    throw new Error('Published annual rate or rate range must be positive, ordered percentages no greater than 100.');
  }

  const feePercent = raw.processingFeePercent == null || raw.processingFeePercent === '' ? null : Number(raw.processingFeePercent);
  const feeINR = raw.processingFeeINR == null || raw.processingFeeINR === '' ? null : Number(raw.processingFeeINR);
  if (feePercent != null && (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100)) throw new Error('Processing fee percentage is invalid.');
  if (feeINR != null && (!Number.isFinite(feeINR) || feeINR < 0)) throw new Error('Processing fee amount is invalid.');
  const minTenureMonths = raw.minTenureMonths == null || raw.minTenureMonths === '' ? null : Number(raw.minTenureMonths);
  const maxTenureMonths = raw.maxTenureMonths == null || raw.maxTenureMonths === '' ? null : Number(raw.maxTenureMonths);
  if (minTenureMonths != null && (!Number.isInteger(minTenureMonths) || minTenureMonths < 1 || minTenureMonths > 600)) throw new Error('Minimum tenure must be from 1 to 600 months.');
  if (maxTenureMonths != null && (!Number.isInteger(maxTenureMonths) || maxTenureMonths < 1 || maxTenureMonths > 600)) throw new Error('Maximum tenure must be from 1 to 600 months.');
  if (minTenureMonths && maxTenureMonths && minTenureMonths > maxTenureMonths) throw new Error('Minimum tenure must not exceed maximum tenure.');
  const maxLtvPercent = raw.maxLtvPercent == null || raw.maxLtvPercent === '' ? null : Number(raw.maxLtvPercent);
  if (maxLtvPercent != null && (!Number.isFinite(maxLtvPercent) || maxLtvPercent <= 0 || maxLtvPercent > 100)) throw new Error('Maximum loan-to-value percentage must be between 0 and 100.');
  const sourceName = String(raw.source || source || '').trim().slice(0, 100);
  if (!sourceName) throw new Error('Each lender term needs its source.');
  const sourceUrl = httpsSourceUrl(raw.sourceUrl || raw.url);
  const publishedAt = isoTimestamp(raw.publishedAt, 'Published timestamp', { required: false });
  const checked = new Date(checkedAt).toISOString();
  const terms = String(raw.terms || '').trim().slice(0, 1500);
  const idSeed = `${sourceName.toLowerCase()}\u001f${lender.toLowerCase()}\u001f${loanType}\u001f${productName.toLowerCase()}\u001f${checked.slice(0, 10)}`;
  return {
    id: createHash('sha256').update(idSeed).digest('hex').slice(0, 32),
    lender, loanType, productName,
    annualRatePercent: annualRateMinPercent, annualRateMinPercent, annualRateMaxPercent,
    processingFeePercent: feePercent, processingFeeINR: feeINR,
    minTenureMonths, maxTenureMonths, maxLtvPercent,
    eligibility: String(raw.eligibility || '').trim().slice(0, 1000),
    terms, source: sourceName, sourceUrl, publishedAt, checkedAt: checked, capturedAt: checked,
  };
}

export function normalizeStressObservation(raw, { source, checkedAt = Date.now(), allowHistory = true } = {}) {
  if (!isObject(raw)) throw new Error('Each stress indicator must be an object.');
  const market = String(raw.market || '').toLowerCase();
  if (!STRESS_MARKETS.has(market)) throw new Error('Stress market must be india, global, or reference-2008.');
  const category = String(raw.category || '').toLowerCase();
  if (!STRESS_CATEGORIES.has(category)) throw new Error('Stress category must be volatility, drawdown, credit, liquidity, breadth, currency, or flows.');
  const indicatorId = String(raw.indicatorId || '').trim().slice(0, 100);
  const name = String(raw.name || '').trim().slice(0, 140);
  const value = Number(raw.value);
  const stressScore = Number(raw.stressScore);
  if (!indicatorId || !name || !Number.isFinite(value)) throw new Error('Stress observations need an indicator ID, name, and numeric source value.');
  if (!Number.isFinite(stressScore) || stressScore < 0 || stressScore > 100) throw new Error('Normalized stressScore must be between 0 and 100.');
  const scoreMethod = String(raw.scoreMethod || '').trim().slice(0, 500);
  if (scoreMethod.length < 8) throw new Error('Document how the raw indicator was normalized to a 0–100 stress score.');
  const sourceName = String(raw.source || source || '').trim().slice(0, 100);
  if (!sourceName) throw new Error('Each stress observation needs its data source.');
  const sourceUrl = httpsSourceUrl(raw.sourceUrl || raw.url);
  const observedAt = isoTimestamp(raw.observedAt || raw.asOf, 'Observed timestamp');
  if (market === 'reference-2008' && new Date(observedAt).getUTCFullYear() !== 2008) {
    throw new Error('Historical 2008 reference indicators must use observations dated in 2008.');
  }
  if (!allowHistory && Date.now() - Date.parse(observedAt) > 30 * 86_400_000) throw new Error('Live stress feed observations older than 30 days must be imported as dated reference history.');
  const checked = new Date(checkedAt).toISOString();
  const unit = String(raw.unit || 'source units').trim().slice(0, 40);
  const idSeed = `${market}\u001f${indicatorId.toLowerCase()}\u001f${sourceName.toLowerCase()}\u001f${observedAt}`;
  return {
    id: createHash('sha256').update(idSeed).digest('hex').slice(0, 32),
    market, category, indicatorId, name, value, unit, stressScore, scoreMethod,
    source: sourceName, sourceUrl, observedAt, checkedAt: checked, capturedAt: checked,
  };
}

async function responseText(response) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_FEED_BYTES) throw new Error('Market feed response exceeded the size limit.');
  if (!response.body) throw new Error('Market feed returned an empty response.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FEED_BYTES) { await reader.cancel(); throw new Error('Market feed response exceeded the size limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function mergeRecords(current, incoming) {
  const byId = new Map(current.map((record) => [record.id, record]));
  incoming.forEach((record) => byId.set(record.id, record));
  const records = [...byId.values()].sort((a, b) => (a.observedAt || a.checkedAt).localeCompare(b.observedAt || b.checkedAt));
  if (records.length > MAX_HISTORY) records.splice(0, records.length - MAX_HISTORY);
  return records;
}

export async function createIndiaMoneyTracker({ dataPath, configPath, fetchImpl = fetch, resolveHost, now = () => Date.now(), logError = (error) => console.error('India money feed refresh failed:', error) } = {}) {
  if (!dataPath || !configPath) throw new Error('India money tracker paths are required.');
  const [configText, storedText] = await Promise.all([
    readFile(configPath, 'utf8').catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)),
    readFile(dataPath, 'utf8').catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)),
  ]);
  const config = configText == null ? { schemaVersion: 1, fundFeeds: [], loanFeeds: [], stressFeeds: [] } : JSON.parse(configText);
  const feeds = parseFeedConfig(config);
  const state = storedText == null
    ? { schemaVersion: 1, funds: [], loans: [], stress: [], feedStatus: {}, lastRefreshAt: { fund: null, loan: null, stress: null } }
    : JSON.parse(storedText);
  if (!isObject(state) || state.schemaVersion !== 1 || !Array.isArray(state.funds) || !Array.isArray(state.loans)
    || !isObject(state.feedStatus) || !isObject(state.lastRefreshAt)) throw new Error('India money tracker data is corrupt or uses an unsupported schema.');
  if (state.stress == null) state.stress = [];
  if (!Array.isArray(state.stress)) throw new Error('India money tracker stress history is corrupt.');
  if (state.lastRefreshAt.stress == null) state.lastRefreshAt.stress = null;
  const inFlight = new Map();
  const lastManualAt = new Map();
  let timer = null;
  let lastHistoryImportAt = 0;

  async function persist() {
    await mkdir(dirname(dataPath), { recursive: true });
    const tempPath = `${dataPath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, dataPath);
  }

  async function loadFeed(feed) {
    const url = await validateFeedUrl(feed.url, resolveHost);
    const token = feed.tokenEnv ? process.env[feed.tokenEnv] : '';
    if (feed.tokenEnv && !token) throw new Error(`The configured credential ${feed.tokenEnv} is not set.`);
    const headers = { Accept: feed.kind === 'amfi' ? 'text/plain, text/csv;q=0.9' : 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if (response.status >= 300 && response.status < 400) throw new Error('Market feed redirects are not followed; configure its final HTTPS API URL.');
    if (!response.ok) throw new Error(`Market feed returned HTTP ${response.status}.`);
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (feed.kind === 'amfi') {
      if (!contentType.includes('text/plain') && !contentType.includes('text/csv')) throw new Error('AMFI NAV file must be text.');
      return { normalized: parseAMFINavText(await responseText(response), { checkedAt: now() }), checkedAt: new Date(now()).toISOString() };
    }
    if (!contentType.includes('json')) throw new Error('Market feed must return application/json.');
    const body = JSON.parse(await responseText(response));
    const key = TYPES[feed.type];
    if (!isObject(body) || body.schemaVersion !== 1 || body.type !== feed.type || !Array.isArray(body[key])) {
      throw new Error(`Market feed must return schemaVersion 1, type "${feed.type}", and a ${key} array.`);
    }
    if (body[key].length > MAX_RECORDS_PER_FEED) throw new Error(`Market feed exceeded ${MAX_RECORDS_PER_FEED} records.`);
    const checkedAt = new Date(now()).toISOString();
    const normalized = feed.type === 'fund'
      ? body.funds.map((record) => normalizeFundObservation(record, { source: feed.name, checkedAt, allowHistory: false }))
      : feed.type === 'loan'
        ? body.loans.map((record) => normalizeLoanObservation(record, { source: feed.name, checkedAt }))
        : body.stress.map((record) => normalizeStressObservation(record, { source: feed.name, checkedAt, allowHistory: false }));
    return { normalized, checkedAt };
  }

  async function refresh(type, { manual = false } = {}) {
    if (!INTERVALS[type]) throw new Error('Market tracker type must be fund, loan, or stress.');
    if (inFlight.has(type)) return inFlight.get(type);
    const typeFeeds = [...feeds.filter((feed) => feed.type === type), ...(type === 'fund' ? [AMFI_NAV_FEED] : [])];
    if (!typeFeeds.length) return { ok: false, noSources: true, message: `No authorized ${type} data feeds are configured. Add them to money-tracker-feeds.local.json; dated manual entries remain available.` };
    if (manual && now() - (lastManualAt.get(type) || 0) < 60_000) return { ok: false, rateLimited: true, message: 'Wait one minute before requesting another refresh.' };
    if (manual) lastManualAt.set(type, now());
    const work = (async () => {
      const attemptedAt = new Date(now()).toISOString();
      const outcomes = await Promise.all(typeFeeds.map(async (feed) => {
        if (!manual) {
          const lastAttempt = Date.parse(state.feedStatus[feed.id]?.lastAttemptAt || '');
          if (Number.isFinite(lastAttempt) && now() - lastAttempt < INTERVALS[type]) return { id: feed.id, name: feed.name, ok: true, skipped: true };
        }
        try {
          const { normalized, checkedAt } = await loadFeed(feed);
          state[TYPES[type]] = mergeRecords(state[TYPES[type]], normalized);
          state.feedStatus[feed.id] = { type, name: feed.name, ok: true, lastAttemptAt: checkedAt, lastSuccessAt: checkedAt, recordCount: normalized.length, error: '' };
          return { id: feed.id, name: feed.name, ok: true, recordCount: normalized.length };
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 300) : 'Unknown market feed error.';
          state.feedStatus[feed.id] = {
            type, name: feed.name, ok: false, lastAttemptAt: attemptedAt,
            lastSuccessAt: state.feedStatus[feed.id]?.lastSuccessAt || null, recordCount: 0, error: message,
          };
          logError(new Error(`${feed.name}: ${message}`));
          return { id: feed.id, name: feed.name, ok: false, error: message };
        }
      }));
      state.lastRefreshAt[type] = attemptedAt;
      await persist();
      return { ok: outcomes.some((item) => item.ok && !item.skipped), refreshedAt: attemptedAt, feeds: outcomes, message: `Checked ${outcomes.length} ${type} feed(s).` };
    })().finally(() => inFlight.delete(type));
    inFlight.set(type, work);
    return work;
  }

  async function addObservations(type, records) {
    if (!TYPES[type] || !Array.isArray(records) || !records.length || records.length > 10_000) throw new Error('Import between 1 and 10,000 records for a supported tracker type.');
    const checkedAt = new Date(now()).toISOString();
    const normalized = type === 'fund'
      ? records.map((record) => normalizeFundObservation(record, { checkedAt, allowHistory: true }))
      : type === 'loan'
        ? records.map((record) => normalizeLoanObservation(record, { checkedAt }))
        : records.map((record) => normalizeStressObservation(record, { checkedAt, allowHistory: true }));
    state[TYPES[type]] = mergeRecords(state[TYPES[type]], normalized);
    await persist();
    return normalized.length;
  }

  async function importAmfiSchemeHistory(instrumentId) {
    const selected = state.funds.find((record) => record.instrumentId === instrumentId
      && record.source === AMFI_NAV_FEED.name && record.instrumentType === 'index-fund' && record.valueType === 'nav');
    if (!selected) throw new Error('Choose an index-fund scheme currently observed in AMFI’s official NAV file.');
    if (now() - lastHistoryImportAt < 60_000) throw new Error('Wait one minute before importing another historical scheme.');
    lastHistoryImportAt = now();
    const schemeCode = instrumentId.match(/^(\d{4,9})-/)?.[1];
    if (!schemeCode) throw new Error('The selected AMFI scheme does not have a valid scheme code.');

    const [official, url] = await Promise.all([
      loadFeed(AMFI_NAV_FEED),
      validateFeedUrl(`${MFAPI_HISTORY_URL}${encodeURIComponent(schemeCode)}`, resolveHost),
    ]);
    const officialRecord = official.normalized.find((record) => record.instrumentId === instrumentId);
    if (!officialRecord) throw new Error('AMFI’s current NAV file no longer contains the selected scheme.');

    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400) throw new Error('Historical NAV endpoint redirects; no redirect was followed.');
    if (!response.ok) throw new Error(`Historical NAV endpoint returned HTTP ${response.status}.`);
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('json')) {
      throw new Error('Historical NAV endpoint must return application/json.');
    }
    const body = JSON.parse(await responseText(response));
    const rawRows = body?.data;
    if (!Array.isArray(rawRows) || rawRows.length > MAX_HISTORY) {
      throw new Error('Historical NAV response is missing its data array or exceeds the record limit.');
    }
    const sameDay = rawRows.find((row) => parseMFAPIDate(row?.date) === officialRecord.observedAt);
    if (!sameDay || Math.round(Number(sameDay.nav) * 10_000) !== Math.round(officialRecord.value * 10_000)) {
      throw new Error('Historical NAV was not imported: MFAPI.in has no matching current-date value, or it disagrees with AMFI. Check back after the sources update.');
    }
    const checkedAt = new Date(now()).toISOString();
    const observations = parseMFAPIHistoricalNav(body, {
      schemeCode, instrumentId, name: selected.name, verifiedDate: officialRecord.observedAt, checkedAt,
    });
    state.funds = mergeRecords(state.funds, [...official.normalized, ...observations]);
    state.feedStatus[AMFI_NAV_FEED.id] = {
      type: 'fund', name: AMFI_NAV_FEED.name, ok: true, lastAttemptAt: checkedAt, lastSuccessAt: checkedAt,
      recordCount: official.normalized.length, error: '',
    };
    state.lastRefreshAt.fund = checkedAt;
    await persist();
    return {
      count: observations.length,
      firstDate: observations[0]?.observedAt || null,
      verifiedDate: officialRecord.observedAt,
      checkedAt,
      source: 'MFAPI.in historical NAV mirror, cross-checked with AMFI',
    };
  }

  async function refreshDue() {
    await Promise.all(['fund', 'loan', 'stress'].map((type) => refresh(type).catch(logError)));
  }

  function statusFor(type) {
    const statusFeeds = [...feeds.filter((feed) => feed.type === type), ...(type === 'fund' ? [AMFI_NAV_FEED] : [])];
    const statusList = statusFeeds.map((feed) => {
      const saved = state.feedStatus[feed.id] || {};
      const lastAttempt = Date.parse(saved.lastAttemptAt || '');
      return {
        id: feed.id,
        name: feed.name,
        lastAttemptAt: saved.lastAttemptAt || null,
        lastSuccessAt: saved.lastSuccessAt || null,
        nextCheckAt: Number.isFinite(lastAttempt) ? new Date(lastAttempt + INTERVALS[type]).toISOString() : null,
        ok: saved.ok ?? null,
        recordCount: saved.recordCount || 0,
        error: saved.error || '',
      };
    });
    const next = statusList.map((feed) => Date.parse(feed.nextCheckAt || '')).filter(Number.isFinite).sort((a, b) => a - b)[0];
    return {
      refreshIntervalMs: INTERVALS[type],
      lastRefreshAt: state.lastRefreshAt[type],
      nextRefreshAt: next ? new Date(next).toISOString() : null,
      hasConfiguredFeeds: statusList.length > 0,
      feeds: statusList,
    };
  }

  return {
    async start() {
      if (timer) return;
      timer = setInterval(() => { void refreshDue(); }, 60 * 60 * 1000);
      timer.unref?.();
      await refreshDue();
    },
    refresh,
    addObservations,
    importAmfiSchemeHistory,
    getStatus() {
      const latestBy = (records, keyFor, dateField) => [...new Map(records.slice()
        .sort((a, b) => b[dateField].localeCompare(a[dateField]))
        .map((record) => [keyFor(record), record])).values()].slice(0, 5000);
      return {
        schemaVersion: 1,
        funds: statusFor('fund'),
        loans: statusFor('loan'),
        stress: statusFor('stress'),
        fundCount: state.funds.length,
        loanCount: state.loans.length,
        stressCount: state.stress.length,
        latestFunds: latestBy(state.funds, (record) => `${record.instrumentId}\u001f${record.valueType}\u001f${record.source}`, 'observedAt'),
        latestLoans: latestBy(state.loans, (record) => `${record.lender}\u001f${record.loanType}\u001f${record.productName}\u001f${record.source}`, 'checkedAt'),
        latestStress: latestBy(state.stress, (record) => `${record.market}\u001f${record.indicatorId}\u001f${record.source}`, 'observedAt'),
      };
    },
    getHistory(type, instrumentId) {
      const records = state[TYPES[type]] || [];
      return records.filter((record) => !instrumentId || record.instrumentId === instrumentId || record.id === instrumentId
        || (type === 'stress' && (record.market === instrumentId || record.indicatorId === instrumentId))
        || (type === 'loan' && (`${record.lender}|${record.loanType}` === instrumentId
          || `${record.lender}|${record.loanType}|${record.productName}` === instrumentId)))
        .slice().sort((a, b) => {
          const dateField = type === 'loan' ? 'checkedAt' : 'observedAt';
          return a[dateField].localeCompare(b[dateField]);
        }).reverse();
    },
  };
}
