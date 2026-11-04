import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VESPER_DB_SCHEMA,
  initVesperDatabase,
  normalizePcPriceObservation,
  calculatePCPartCompatibility,
  calculateAllSectorFinancials,
  xirr,
  syncIndianPCPrices,
  PC_SYNC_INTERVAL_MS,
  updateExpressionBlendshapes,
  EMOTION_BLENDSHAPES,
  loadVRMModel,
  calculateTDEEAndDeficit,
  applyTheme,
  THEME_PALETTES,
} from './vesper-core.mjs';

/* ---- Part 2: database --------------------------------------------- */

test('initVesperDatabase falls back to an in-memory store without IndexedDB', async () => {
  const db = await initVesperDatabase({ indexedDB: undefined, force: true });
  assert.equal(db.provider, 'memory');
  assert.deepEqual(db.stores, Object.keys(VESPER_DB_SCHEMA.stores));
  await db.put('memories', { id: 'm1', category: 'preference', pinned: true });
  await db.put('memories', { id: 'm2', category: 'project', pinned: false });
  assert.equal((await db.get('memories', 'm1')).category, 'preference');
  assert.equal((await db.getAll('memories')).length, 2);
  assert.equal(await db.delete('memories', 'm1'), true);
  assert.equal((await db.getAll('memories')).length, 1);
  await db.clear('memories');
  assert.equal((await db.getAll('memories')).length, 0);
  await db.close();
});

/* ---- Part 5: PC compatibility ------------------------------------- */

const GOOD_BUILD = {
  cpu: { socket: 'AM5', tdp: 105 },
  motherboard: { socket: 'AM5', ramType: 'DDR5', ramSlots: 4, formFactor: 'ATX', tdp: 40 },
  ram: [{ type: 'DDR5', modules: 2 }],
  gpu: { lengthMm: 300, tdp: 250 },
  cooler: { heightMm: 155, socketSupport: ['AM5'] },
  pcCase: { maxGpuLengthMm: 330, maxCoolerHeightMm: 165, formFactorSupport: ['ATX'] },
  psu: { wattage: 850 },
};

test('calculatePCPartCompatibility passes a matched build and estimates power', () => {
  const result = calculatePCPartCompatibility(GOOD_BUILD);
  assert.equal(result.compatible, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.estimatedTotalTdp, 105 + 250 + 40 + 2 * 5 + 15);
  assert.equal(result.recommendedPsuWattage, 650);
  assert.ok(result.headroomWattage > 0);
});

test('calculatePCPartCompatibility reports socket, memory, clearance and PSU problems', () => {
  const build = {
    cpu: { socket: 'LGA1700', tdp: 125 },
    motherboard: { socket: 'AM5', ramType: 'DDR5', ramSlots: 2, formFactor: 'ATX' },
    ram: [{ type: 'DDR4', modules: 2 }, { type: 'DDR4', modules: 2 }],
    gpu: { lengthMm: 360, tdp: 300 },
    cooler: { heightMm: 175, socketSupport: ['AM4'] },
    pcCase: { maxGpuLengthMm: 330, maxCoolerHeightMm: 165, formFactorSupport: ['MATX'] },
    psu: { wattage: 500 },
  };
  const result = calculatePCPartCompatibility(build);
  assert.equal(result.compatible, false);
  const codes = result.issues.map((issue) => issue.code);
  for (const expected of ['socket-mismatch', 'ram-type-mismatch', 'ram-slot-overflow', 'gpu-length', 'cooler-height', 'cooler-socket', 'case-form-factor']) {
    assert.ok(codes.includes(expected), `expected issue ${expected}`);
  }
  assert.ok(result.warnings.some((warning) => warning.code === 'psu-headroom'));
});

test('normalizePcPriceObservation rejects invalid prices and keeps valid ones', () => {
  assert.throws(() => normalizePcPriceObservation({ vendor: 'MDComputers', partId: 'rtx-4070', priceINR: -5 }));
  assert.throws(() => normalizePcPriceObservation({ vendor: '', partId: 'x', priceINR: 100 }));
  const observation = normalizePcPriceObservation({ vendor: 'PrimeABGB', partId: 'ryzen-7600', category: 'cpu', priceINR: 18999, url: 'https://example.invalid/p' });
  assert.equal(observation.priceINR, 18999);
  assert.equal(observation.url, 'https://example.invalid/p');
});

/* ---- Part 5: sync -------------------------------------------------- */

test('syncIndianPCPrices normalizes vendor readings and records failures', async () => {
  const snapshots = [];
  const handle = await syncIndianPCPrices({
    vendors: ['MDComputers', 'Vedant Computers'],
    fetchers: {
      MDComputers: async () => [{ partId: 'rtx-4070', category: 'gpu', priceINR: 52999 }],
      'Vedant Computers': async () => { throw new Error('offline'); },
    },
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    recurring: false,
    now: () => 1_700_000_000_000,
  }).refresh();
  assert.equal(handle.totalObservations, 1);
  assert.deepEqual(handle.observations[0].vendor, 'MDComputers');
  assert.ok(handle.failedVendors.includes('Vedant Computers'));
  assert.equal(snapshots.length, 1);
});

test('syncIndianPCPrices sets the two-hour timer and stop() clears it', async () => {
  let registered = 0;
  let cleared = 0;
  const scheduler = { setInterval: (fn, ms) => { registered = ms; return 7; }, clearInterval: (id) => { cleared = id; } };
  const handle = syncIndianPCPrices({ vendors: ['Amazon.in'], fetchers: {}, scheduler, recurring: true, intervalMs: PC_SYNC_INTERVAL_MS });
  assert.equal(registered, PC_SYNC_INTERVAL_MS);
  assert.ok(handle.nextSyncAt);
  handle.stop();
  assert.equal(cleared, 7);
  assert.equal(handle.nextSyncAt, null);
});

/* ---- Part 6: financials ------------------------------------------- */

test('xirr solves a simple one-year return', () => {
  const rate = xirr([
    { date: '2024-01-01', amount: -100000 },
    { date: '2025-01-01', amount: 110000 },
  ]);
  assert.ok(Math.abs(rate - 10) < 0.2, `expected ~10%, got ${rate}`);
  assert.equal(xirr([{ date: '2024-01-01', amount: -100 }]), null);
});

test('calculateAllSectorFinancials aggregates every sector into INR with a real return', () => {
  const result = calculateAllSectorFinancials({
    equities: [{ symbol: 'RELIANCE', qty: 10, avgCost: 2500, lastPrice: 2900 }],
    mutualFunds: [{ name: 'Index fund', units: 100, nav: 45, invested: 4000 }],
    commodities: [{ name: 'Gold', qty: 10, buyPrice: 6000, lastPrice: 7200 }],
    forex: [{ pair: 'USD/INR', amount: 1000, buyRate: 80, lastRate: 84 }],
    fixedIncome: [{ name: 'PPF', type: 'PPF', principal: 100000, ratePct: 7.1, startDate: '2020-01-01' }],
    crypto: [{ symbol: 'BTC', qty: 0.01, avgCost: 50000, lastPrice: 60000, currency: 'USD' }],
    realEstate: [{ name: 'Flat', value: 5000000, annualRent: 180000, purchasePrice: 4000000, purchaseDate: '2019-01-01' }],
    inflationPct: 6,
  }, { now: Date.parse('2026-01-01'), fxToINR: { INR: 1, USD: 83 } });

  assert.equal(result.currency, 'INR');
  // Equities: 10 * (2900 - 2500) = 4000 profit.
  assert.equal(result.sectors.equities.pnlINR, 4000);
  // Forex: 1000 * (84 - 80) = 4000 profit.
  assert.equal(result.sectors.forex.pnlINR, 4000);
  // Crypto in USD converted at 83: 0.01 * 10000 * 83 = 8300 profit.
  assert.equal(result.sectors.crypto.pnlINR, 8300);
  // Fixed income accrues above principal.
  assert.ok(result.sectors.fixedIncome.currentINR > 100000);
  assert.equal(result.sectors.realEstate.items[0].rentalYieldPct, 3.6);
  assert.ok(result.totals.investedINR > 0);
  assert.ok(result.inflation.realReturnPct < result.totals.pnlPct);
});

/* ---- Part 3: expressions ------------------------------------------ */

test('updateExpressionBlendshapes lerps toward an emotion target', () => {
  const first = updateExpressionBlendshapes('happy', 1, 0.05, { current: {} });
  assert.equal(first.emotion, 'happy');
  assert.ok(first.weights.happy > 0 && first.weights.happy < 1);
  let state = {};
  for (let i = 0; i < 200; i += 1) state = updateExpressionBlendshapes('blush', 1, 1 / 60, { current: state }).weights;
  assert.ok(Math.abs(state.blush - 0.68) < 0.01);
  assert.ok(Math.abs(state.relaxed - 0.18) < 0.01);
  const coerced = updateExpressionBlendshapes('lookUp', 1, 1, { current: {} });
  assert.equal(coerced.emotion, 'lookup');
  assert.equal(coerced.weights.lookUp, 1);
  const clamped = updateExpressionBlendshapes('angry', 5, 1, { current: {} });
  assert.equal(clamped.weight, 1);
  assert.deepEqual(Object.keys(EMOTION_BLENDSHAPES).length, 14);
});

test('loadVRMModel refuses to run outside a browser', async () => {
  await assert.rejects(() => loadVRMModel('/models/character.vrm'), /needs a browser document/);
});

/* ---- Re-exports ---------------------------------------------------- */

test('core re-exports the health and theme helpers', () => {
  const tdee = calculateTDEEAndDeficit({ sex: 'male', age: 30, weightKg: 70, heightCm: 175, activityFactor: 1.5, deficitKcal: 400 });
  assert.ok(tdee.tdee > tdee.bmr);
  assert.equal(typeof applyTheme, 'function');
  assert.ok(THEME_PALETTES.some((theme) => theme.id === 'transparent'));
});
