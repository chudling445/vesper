/**
 * vesper-core.mjs — Vesper's unified core method surface.
 *
 * This module is the single import point for the platform-level operations the
 * rest of the app builds on. Everything here is written to run in a plain ES
 * module graph so it can be unit-tested in Node and imported directly by the
 * browser pages:
 *
 *   initVesperDatabase()              IndexedDB schema + store adapter
 *   calculatePCPartCompatibility()    sockets, RAM, clearance, TDP/PSU solver
 *   calculateAllSectorFinancials()    equities, funds, commodities, forex, FD, crypto, inflation
 *   syncIndianPCPrices()              Indian vendor snapshot fetcher + 2-hour timer
 *   updateExpressionBlendshapes()     VRM expression cross-fade maths
 *   loadVRMModel()                    browser VRM loader adapter
 *   calculateTDEEAndDeficit()         re-exported from health-tools.mjs
 *   applyTheme()                      re-exported from themeManager.js
 *
 * The pure functions take everything they need as arguments (no globals) so
 * they are deterministic and testable. Browser-only helpers fail loudly with a
 * helpful message instead of silently doing nothing.
 */

export { calculateTDEEAndDeficit } from './health-tools.mjs';
export { applyTheme, THEME_PALETTES } from './themeManager.js';

/* ================================================================== *
 *  Part 5 — Indian PC component price engine
 * ================================================================== */

/** Vendors the local fetcher layer knows how to request. */
export const INDIAN_PC_VENDORS = Object.freeze([
  'MDComputers', 'Vedant Computers', 'PrimeABGB', 'PCPriceTracker.in', 'PickPCParts.in', 'Amazon.in',
]);

/** The recurring sync cadence: every two hours. */
export const PC_SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** Component categories tracked by the price history. */
export const PC_COMPONENT_CATEGORIES = Object.freeze([
  'cpu', 'gpu', 'motherboard', 'ram', 'ssd', 'psu', 'cooler', 'case',
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const finiteOr = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** Normalize one vendor reading into a storable observation. */
export function normalizePcPriceObservation(input = {}, { now = Date.now() } = {}) {
  const vendor = String(input.vendor || '').trim();
  const partId = String(input.partId || '').trim();
  const priceINR = Number(input.priceINR);
  if (!vendor) throw new Error('A PC price observation needs a vendor.');
  if (!partId) throw new Error('A PC price observation needs a part id.');
  if (!Number.isFinite(priceINR) || priceINR <= 0 || priceINR > 10_000_000) {
    throw new Error('PC price must be a positive amount under ₹1,00,00,000.');
  }
  const category = PC_COMPONENT_CATEGORIES.includes(input.category) ? input.category : 'cpu';
  const observedAt = Number.isFinite(Date.parse(input.observedAt)) ? new Date(input.observedAt).toISOString() : new Date(now).toISOString();
  return {
    vendor, partId, category,
    priceINR: Math.round(priceINR),
    url: /^https?:\/\//i.test(String(input.url || '')) ? String(input.url) : '',
    observedAt,
  };
}

/**
 * Fetch one snapshot from every configured vendor, normalize the readings, hand
 * them to the caller's persistence hook, and (optionally) set the recurring
 * two-hour timer.
 *
 * Network access is injected through `fetchers` — Vesper does not ship a
 * scraper that reaches out to retailers on its own, and this function never
 * fabricates a price when a vendor has no fetcher.
 *
 * @param {object} [config]
 * @param {string[]} [config.vendors] vendors to attempt
 * @param {Record<string, () => Promise<Array>>} [config.fetchers] vendor → async readings
 * @param {(snapshot: object) => (void|Promise<void>)} [config.onSnapshot] persistence hook
 * @param {number} [config.intervalMs]
 * @param {boolean} [config.recurring] set the repeating timer (default true when a scheduler is present)
 * @param {() => number} [config.now]
 * @param {{setInterval:Function, clearInterval:Function}} [config.scheduler]
 * @param {(line: string) => void} [config.log]
 */
export function syncIndianPCPrices({
  vendors = INDIAN_PC_VENDORS,
  fetchers = {},
  onSnapshot = () => {},
  intervalMs = PC_SYNC_INTERVAL_MS,
  recurring = true,
  now = () => Date.now(),
  scheduler = (typeof setInterval === 'function' ? { setInterval, clearInterval } : null),
  log = () => {},
} = {}) {
  const vendorIds = (Array.isArray(vendors) ? vendors : []).filter((vendor) => typeof vendor === 'string');
  if (vendorIds.length === 0) throw new Error('syncIndianPCPrices needs at least one vendor.');
  let stopped = false;
  let timer = 0;
  let lastSnapshot = null;

  async function refresh() {
    const startedAt = new Date(now()).toISOString();
    const results = [];
    const observations = [];
    for (const vendor of vendorIds) {
      const fetcher = fetchers[vendor];
      if (typeof fetcher !== 'function') {
        log(`${vendor}: no fetcher configured, skipped`);
        results.push({ vendor, ok: false, count: 0, error: 'no-fetcher' });
        continue;
      }
      try {
        const readings = await fetcher();
        const normalized = (Array.isArray(readings) ? readings : [])
          .map((reading) => normalizePcPriceObservation({ ...reading, vendor: reading?.vendor || vendor }, { now: now() }))
          .filter(Boolean);
        observations.push(...normalized);
        results.push({ vendor, ok: true, count: normalized.length, error: null });
        log(`${vendor}: ${normalized.length} observation(s)`);
      } catch (error) {
        results.push({ vendor, ok: false, count: 0, error: String(error?.message || error) });
        log(`${vendor}: failed — ${error?.message || error}`);
      }
    }
    lastSnapshot = {
      startedAt,
      finishedAt: new Date(now()).toISOString(),
      intervalMs,
      vendors: results,
      observations,
      totalObservations: observations.length,
      failedVendors: results.filter((result) => !result.ok).map((result) => result.vendor),
    };
    await onSnapshot(lastSnapshot);
    return lastSnapshot;
  }

  const handle = {
    refresh,
    get lastSnapshot() { return lastSnapshot; },
    nextSyncAt: null,
    stop() {
      stopped = true;
      if (timer && scheduler?.clearInterval) scheduler.clearInterval(timer);
      timer = 0;
      handle.nextSyncAt = null;
    },
  };

  if (recurring && scheduler?.setInterval) {
    timer = scheduler.setInterval(() => { if (!stopped) refresh().catch((error) => log(`sync error: ${error?.message || error}`)); }, intervalMs);
    handle.nextSyncAt = new Date(now() + intervalMs).toISOString();
  }
  return handle;
}

/** Validate one component against a build's motherboard, case, and PSU limits. */
export function calculatePCPartCompatibility(build = {}) {
  const {
    cpu = {}, motherboard = {}, ram = [], gpu = {}, cooler = {}, pcCase = {}, psu = {},
  } = build;
  const issues = [];
  const warnings = [];
  const add = (list, code, message) => list.push({ code, message });

  const cpuSocket = String(cpu.socket || '').toUpperCase();
  const boardSocket = String(motherboard.socket || '').toUpperCase();
  if (!cpuSocket || !boardSocket) add(warnings, 'socket-unknown', 'Enter both the CPU and motherboard socket to verify the fit.');
  else if (cpuSocket !== boardSocket) add(issues, 'socket-mismatch', `CPU socket ${cpuSocket} does not match motherboard socket ${boardSocket}.`);

  const boardRam = String(motherboard.ramType || '').toUpperCase();
  const ramModules = Array.isArray(ram) ? ram : [];
  if (boardRam && ramModules.length) {
    for (const module of ramModules) {
      const type = String(module?.type || '').toUpperCase();
      if (type && type !== boardRam) add(issues, 'ram-type-mismatch', `Installed ${type} memory does not match the board's ${boardRam} slots.`);
    }
  } else if (!boardRam) {
    add(warnings, 'ram-type-unknown', 'Set the motherboard memory type (DDR4/DDR5) to check memory fitment.');
  }
  const slots = finiteOr(motherboard.ramSlots, 0);
  const totalSticks = ramModules.reduce((sum, module) => sum + Math.max(1, finiteOr(module?.modules, 1)), 0);
  if (slots > 0 && totalSticks > slots) add(issues, 'ram-slot-overflow', `${totalSticks} memory modules exceed the board's ${slots} slots.`);

  const gpuLength = finiteOr(gpu.lengthMm, 0);
  const maxGpuLength = finiteOr(pcCase.maxGpuLengthMm, 0);
  if (gpuLength > 0 && maxGpuLength > 0 && gpuLength > maxGpuLength) {
    add(issues, 'gpu-length', `GPU is ${gpuLength}mm but the case clears ${maxGpuLength}mm.`);
  }

  const coolerHeight = finiteOr(cooler.heightMm, 0);
  const maxCoolerHeight = finiteOr(pcCase.maxCoolerHeightMm, 0);
  if (coolerHeight > 0 && maxCoolerHeight > 0 && coolerHeight > maxCoolerHeight) {
    add(issues, 'cooler-height', `Cooler is ${coolerHeight}mm tall but the case clears ${maxCoolerHeight}mm.`);
  }

  const coolerSockets = (Array.isArray(cooler.socketSupport) ? cooler.socketSupport : []).map((socket) => String(socket).toUpperCase());
  if (cpuSocket && coolerSockets.length && !coolerSockets.includes(cpuSocket)) {
    add(issues, 'cooler-socket', `Cooler does not list ${cpuSocket} mounting support.`);
  }

  const boardForm = String(motherboard.formFactor || '').toUpperCase();
  const caseForms = (Array.isArray(pcCase.formFactorSupport) ? pcCase.formFactorSupport : []).map((form) => String(form).toUpperCase());
  if (boardForm && caseForms.length && !caseForms.includes(boardForm)) {
    add(issues, 'case-form-factor', `Case does not list ${boardForm} motherboard support.`);
  }

  const estimatedTotalTdp = Math.round(
    finiteOr(cpu.tdp, 0) + finiteOr(gpu.tdp, 0)
    + finiteOr(motherboard.tdp, 40) + totalSticks * 5 + 15,
  );
  const recommendedPsuWattage = Math.ceil((estimatedTotalTdp * 1.5) / 50) * 50;
  const psuWattage = finiteOr(psu.wattage, 0);
  const headroomWattage = psuWattage ? psuWattage - estimatedTotalTdp : null;
  if (psuWattage && psuWattage < recommendedPsuWattage) {
    add(warnings, 'psu-headroom', `A ${psuWattage}W PSU leaves thin headroom for an estimated ${estimatedTotalTdp}W load; ${recommendedPsuWattage}W is the suggested target.`);
  } else if (!psuWattage) {
    add(warnings, 'psu-unknown', 'Enter a PSU wattage to check system power headroom.');
  }

  return {
    compatible: issues.length === 0,
    issues,
    warnings,
    estimatedTotalTdp,
    recommendedPsuWattage,
    headroomWattage,
    assumptions: 'TDP figures are manufacturer reference values plus a fixed platform allowance. Transient power spikes, overclocking, drive count, and fan/ARGB load are not modelled. Confirm the exact SKU, BIOS support, mounting kit, and connector count.',
  };
}

/* ================================================================== *
 *  Part 6 — All-sector financial aggregation
 * ================================================================== */

/** Default heuristic fx table; callers should supply live rates when available. */
export const DEFAULT_FX_TO_INR = Object.freeze({ INR: 1, USD: 83.4, EUR: 90.5, GBP: 106.2, JPY: 0.55 });

/** Compute the money-weighted (XIRR) return of dated cashflows via Newton–Raphson. */
export function xirr(cashflows = [], guess = 0.1) {
  const dated = (Array.isArray(cashflows) ? cashflows : [])
    .map((flow) => ({ amount: Number(flow?.amount), date: Date.parse(flow?.date) }))
    .filter((flow) => Number.isFinite(flow.amount) && Number.isFinite(flow.date))
    .sort((a, b) => a.date - b.date);
  if (dated.length < 2) return null;
  if (!dated.some((flow) => flow.amount < 0) || !dated.some((flow) => flow.amount > 0)) return null;
  const t0 = dated[0].date;
  const years = (date) => (date - t0) / (365.2425 * 86_400_000);
  let rate = guess;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    let value = 0;
    let derivative = 0;
    for (const flow of dated) {
      const t = years(flow.date);
      const discount = Math.pow(1 + rate, t);
      value += flow.amount / discount;
      derivative -= (t * flow.amount) / (discount * (1 + rate));
    }
    if (Math.abs(value) < 1e-7) break;
    if (derivative === 0) break;
    const next = rate - value / derivative;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - rate) < 1e-10) { rate = next; break; }
    rate = next;
  }
  if (!Number.isFinite(rate) || rate <= -0.999) return null;
  return Math.round(rate * 1_000_000) / 10_000; // percentage with 4 dp
}

function sectorResult(items) {
  const investedINR = items.reduce((sum, item) => sum + item.investedINR, 0);
  const currentINR = items.reduce((sum, item) => sum + item.currentINR, 0);
  const pnlINR = currentINR - investedINR;
  return {
    count: items.length,
    investedINR: Math.round(investedINR),
    currentINR: Math.round(currentINR),
    pnlINR: Math.round(pnlINR),
    pnlPct: investedINR > 0 ? Math.round((pnlINR / investedINR) * 10_000) / 100 : null,
    items,
  };
}

/**
 * Aggregate every asset class into one INR view, including an
 * inflation-adjusted ("real") return for the whole portfolio.
 *
 * All figures are derived only from the supplied records; nothing is invented
 * to fill a gap. Missing prices keep the last supplied value and are flagged.
 */
export function calculateAllSectorFinancials(portfolioData = {}, { fxToINR = DEFAULT_FX_TO_INR, now = Date.now() } = {}) {
  const rate = (currency) => finiteOr(fxToINR[String(currency || 'INR').toUpperCase()], null) ?? 1;

  const equities = (portfolioData.equities || []).map((holding) => {
    const conversion = rate(holding.currency);
    const qty = finiteOr(holding.qty);
    const investedINR = qty * finiteOr(holding.avgCost) * conversion;
    const currentINR = qty * finiteOr(holding.lastPrice, holding.avgCost) * conversion;
    return { name: holding.symbol || holding.name || 'Equity', investedINR, currentINR };
  });

  const mutualFunds = (portfolioData.mutualFunds || []).map((fund) => {
    const units = finiteOr(fund.units);
    const nav = finiteOr(fund.nav);
    const investedINR = finiteOr(fund.invested, units * finiteOr(fund.avgNav));
    const currentINR = units * nav;
    const cashflows = (Array.isArray(fund.cashflows) ? fund.cashflows : []).map((flow) => ({ date: flow.date, amount: -Math.abs(finiteOr(flow.amount)) }));
    const ratePct = cashflows.length >= 2 && units && nav
      ? xirr([...cashflows, { date: new Date(now).toISOString(), amount: currentINR }])
      : null;
    return { name: fund.name || 'Mutual fund', investedINR, currentINR, xirrPct: ratePct };
  });

  const commodities = (portfolioData.commodities || []).map((item) => {
    const qty = finiteOr(item.qty);
    const investedINR = qty * finiteOr(item.buyPrice) * rate(item.currency);
    const currentINR = qty * finiteOr(item.lastPrice, item.buyPrice) * rate(item.currency);
    return { name: item.name || 'Commodity', investedINR, currentINR };
  });

  const forex = (portfolioData.forex || []).map((pair) => {
    const amount = finiteOr(pair.amount);
    return {
      name: pair.pair || 'FX position',
      investedINR: amount * finiteOr(pair.buyRate),
      currentINR: amount * finiteOr(pair.lastRate, pair.buyRate),
    };
  });

  const fixedIncome = (portfolioData.fixedIncome || []).map((position) => {
    const principal = finiteOr(position.principal);
    const startMs = Date.parse(position.startDate || '');
    const elapsedYears = Number.isFinite(startMs) ? Math.max(0, (now - startMs) / (365.2425 * 86_400_000)) : 0;
    const maturityMs = Date.parse(position.maturityDate || '');
    const cappedYears = Number.isFinite(maturityMs) && maturityMs > startMs
      ? Math.min(elapsedYears, (maturityMs - startMs) / (365.2425 * 86_400_000)) : elapsedYears;
    const ratePct = finiteOr(position.ratePct);
    const currentINR = principal * Math.pow(1 + ratePct / 100, cappedYears);
    return { name: position.name || position.type || 'Fixed income', kind: position.type || 'FD', investedINR: principal, currentINR };
  });

  const crypto = (portfolioData.crypto || []).map((coin) => {
    const conversion = rate(coin.currency);
    const qty = finiteOr(coin.qty);
    return {
      name: coin.symbol || 'Crypto',
      investedINR: qty * finiteOr(coin.avgCost) * conversion,
      currentINR: qty * finiteOr(coin.lastPrice, coin.avgCost) * conversion,
    };
  });

  const realEstate = (portfolioData.realEstate || []).map((property) => {
    const valueINR = finiteOr(property.value);
    const annualRent = finiteOr(property.annualRent);
    const purchaseMs = Date.parse(property.purchaseDate || '');
    const heldYears = Number.isFinite(purchaseMs) ? Math.max(0, (now - purchaseMs) / (365.2425 * 86_400_000)) : 0;
    const investedINR = finiteOr(property.purchasePrice, valueINR);
    return {
      name: property.name || 'Property',
      investedINR,
      currentINR: valueINR,
      rentalYieldPct: valueINR > 0 ? Math.round((annualRent / valueINR) * 10_000) / 100 : null,
      heldYears: Math.round(heldYears * 10) / 10,
    };
  });

  const sectors = {
    equities: sectorResult(equities),
    mutualFunds: sectorResult(mutualFunds),
    commodities: sectorResult(commodities),
    forex: sectorResult(forex),
    fixedIncome: sectorResult(fixedIncome),
    crypto: sectorResult(crypto),
    realEstate: sectorResult(realEstate),
  };

  const investedINR = Object.values(sectors).reduce((sum, sector) => sum + sector.investedINR, 0);
  const currentINR = Object.values(sectors).reduce((sum, sector) => sum + sector.currentINR, 0);
  const pnlINR = currentINR - investedINR;
  const nominalReturnPct = investedINR > 0 ? (pnlINR / investedINR) * 100 : null;
  const inflationPct = finiteOr(portfolioData.inflationPct, 0);
  const realReturnPct = nominalReturnPct == null ? null
    : ((1 + nominalReturnPct / 100) / (1 + inflationPct / 100) - 1) * 100;

  return {
    currency: 'INR',
    sectors,
    totals: {
      investedINR: Math.round(investedINR),
      currentINR: Math.round(currentINR),
      pnlINR: Math.round(pnlINR),
      pnlPct: nominalReturnPct == null ? null : Math.round(nominalReturnPct * 100) / 100,
    },
    inflation: {
      ratePct: inflationPct,
      realReturnPct: realReturnPct == null ? null : Math.round(realReturnPct * 100) / 100,
    },
    fxToINR: { ...fxToINR },
    notes: 'Non-INR holdings are converted with the supplied fx table; those rates are heuristics unless you update them. Fixed income accrues at a flat compounded rate to the maturity date. Values come only from the records you enter.',
  };
}

/* ================================================================== *
 *  Part 3 — VRM expression + loader adapters
 * ================================================================== */

/** The 14 VRM expressions mapped to blend channels, matching expressionManager presets. */
export const EMOTION_BLENDSHAPES = Object.freeze({
  neutral: {},
  happy: { happy: 1 },
  angry: { angry: 1 },
  sad: { sad: 1 },
  surprised: { surprised: 1 },
  relaxed: { relaxed: 1 },
  joy: { joy: 1, happy: 0.25 },
  fun: { fun: 1, happy: 0.2 },
  lookup: { lookUp: 1 },
  lookdown: { lookDown: 1 },
  lookleft: { lookLeft: 1 },
  lookright: { lookRight: 1 },
  blush: { blush: 0.68, relaxed: 0.18 },
  wink: { blinkLeft: 1 },
});

/**
 * Advance an expression cross-fade by one frame. Pure: it returns the next
 * weights map instead of mutating three-vrm directly, so it can be unit-tested
 * and reused by the avatar loop.
 *
 * @param {string} emotion one of the 14 VRM expressions
 * @param {number} weight target intensity 0–1
 * @param {number} delta seconds since the last frame
 * @param {object} [context]
 * @param {Record<string, number>} [context.current] current channel weights
 * @param {number} [context.speed] blend speed (per second)
 */
export function updateExpressionBlendshapes(emotion = 'neutral', weight = 1, delta = 1 / 60, { current = {}, speed = 7.5, mappings = EMOTION_BLENDSHAPES } = {}) {
  const key = String(emotion || 'neutral').toLowerCase().replace(/[\s_-]/g, '');
  const resolved = Object.keys(mappings).find((name) => name.toLowerCase() === key) || 'neutral';
  const target = mappings[resolved] || {};
  const intensity = clamp(weight, 0, 1);
  const step = clamp(delta * speed, 0, 1);
  const channels = new Set([...Object.keys(current), ...Object.keys(target)]);
  const next = {};
  for (const channel of channels) {
    const desired = (target[channel] || 0) * intensity;
    const from = finiteOr(current[channel]);
    next[channel] = Math.round((from + (desired - from) * step) * 10000) / 10000;
  }
  return { emotion: resolved, weight: intensity, weights: next };
}

/**
 * Load a local `.vrm` through the page's import map (three + @pixiv/three-vrm).
 * Browser-only: it needs a DOM and the bundled viewer.
 *
 * @param {string} modelUrl same-origin path to a `.vrm` file
 * @param {object} [options]
 * @param {object} [options.THREE] an already-imported three namespace
 * @returns {Promise<{ vrm: object, dispose: () => void }>}
 */
export async function loadVRMModel(modelUrl, { THREE: injectedTHREE } = {}) {
  if (typeof document === 'undefined') {
    throw new Error('loadVRMModel() needs a browser document. Import it from a page, not from Node.');
  }
  if (!/^\/|^\.\//.test(String(modelUrl || ''))) throw new Error('loadVRMModel() only accepts a same-origin path such as /models/character.vrm.');
  const THREE = injectedTHREE || await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { VRMLoaderPlugin } = await import('@pixiv/three-vrm');

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  loader.register((parser) => {
    // Decode embedded textures through <img> rather than fetch(), which a
    // strict content-security policy can block and leave a white model.
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: 'VesperTextureLoader' };
  });

  const gltf = await loader.loadAsync(modelUrl);
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error(`${modelUrl} is not a VRM avatar.`);
  return {
    vrm,
    animations: gltf.animations || [],
    dispose() {
      vrm.scene?.traverse?.((node) => {
        node.geometry?.dispose?.();
        for (const material of [].concat(node.material || [])) {
          material.map?.dispose?.();
          material.dispose?.();
        }
      });
      vrm.scene?.parent?.remove(vrm.scene);
      vrm.dispose?.();
    },
  };
}

/* ================================================================== *
 *  Part 2 — Local-first database
 * ================================================================== */

/** Declarative IndexedDB schema for every Vesper subsystem. */
export const VESPER_DB_SCHEMA = Object.freeze({
  name: 'vesper-db',
  version: 1,
  stores: {
    messages: { keyPath: 'id', indexes: [['sessionId', 'sessionId'], ['createdAt', 'createdAt']] },
    memories: { keyPath: 'id', indexes: [['category', 'category'], ['pinned', 'pinned']] },
    memoryEdges: { keyPath: 'id', indexes: [['from', 'from'], ['to', 'to']] },
    pcPriceHistory: { keyPath: 'id', indexes: [['partId', 'partId'], ['observedAt', 'observedAt'], ['vendor', 'vendor']] },
    priceSyncLog: { keyPath: 'id', indexes: [['finishedAt', 'finishedAt']] },
    ledger: { keyPath: 'id', indexes: [['accountId', 'accountId'], ['date', 'date']] },
    accounts: { keyPath: 'id', indexes: [['kind', 'kind']] },
    healthLogs: { keyPath: 'id', indexes: [['date', 'date'], ['kind', 'kind']] },
    arcadeScores: { keyPath: 'id', indexes: [['gameId', 'gameId'], ['score', 'score']] },
    characterCards: { keyPath: 'id', indexes: [['source', 'source']] },
    settings: { keyPath: 'key', indexes: [] },
  },
});

/** A Map-backed store used when IndexedDB is unavailable (Node, private mode). */
function createMemoryDatabase() {
  const tables = new Map();
  const table = (store) => {
    if (!tables.has(store)) tables.set(store, new Map());
    return tables.get(store);
  };
  return {
    provider: 'memory',
    stores: Object.keys(VESPER_DB_SCHEMA.stores),
    async put(store, value) { const key = value?.[VESPER_DB_SCHEMA.stores[store]?.keyPath] ?? value?.key; table(store).set(key, value); return value; },
    async get(store, key) { return table(store).get(key) ?? null; },
    async getAll(store) { return [...table(store).values()]; },
    async delete(store, key) { return table(store).delete(key); },
    async clear(store) { table(store).clear(); },
    async close() { tables.clear(); },
  };
}

let sharedDatabase = null;

/**
 * Open (or create) the Vesper IndexedDB database and return a small store
 * adapter. Falls back to an in-memory store when IndexedDB is missing so the
 * caller never has to branch on the environment.
 */
export async function initVesperDatabase({ indexedDB = globalThis.indexedDB, name = VESPER_DB_SCHEMA.name, version = VESPER_DB_SCHEMA.version, force = false } = {}) {
  if (sharedDatabase && !force) return sharedDatabase;
  if (!indexedDB || typeof indexedDB.open !== 'function') {
    sharedDatabase = createMemoryDatabase();
    return sharedDatabase;
  }

  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const [storeName, config] of Object.entries(VESPER_DB_SCHEMA.stores)) {
        const store = database.objectStoreNames.contains(storeName)
          ? request.transaction.objectStore(storeName)
          : database.createObjectStore(storeName, { keyPath: config.keyPath });
        for (const [indexName, keyPath] of config.indexes) {
          if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const run = (store, mode, work) => new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = work(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  sharedDatabase = {
    provider: 'indexeddb',
    raw: db,
    dbName: name,
    stores: Object.keys(VESPER_DB_SCHEMA.stores),
    put: (store, value) => run(store, 'readwrite', (objectStore) => objectStore.put(value)),
    get: (store, key) => run(store, 'readonly', (objectStore) => objectStore.get(key)),
    getAll: (store) => run(store, 'readonly', (objectStore) => objectStore.getAll()),
    delete: (store, key) => run(store, 'readwrite', (objectStore) => objectStore.delete(key)),
    clear: (store) => run(store, 'readwrite', (objectStore) => objectStore.clear()),
    close() { db.close(); sharedDatabase = null; },
  };
  return sharedDatabase;
}
