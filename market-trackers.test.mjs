import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createIndiaMoneyTracker, normalizeFundObservation, normalizeStressObservation, parseAMFINavText } from './india-money-tracker.mjs';
import { createPCPriceTracker, normalizePriceObservation, validateFeedUrl } from './pc-price-tracker.mjs';
import { calculateEmi, forecastObservedPrice, summarizeCurrentPrices, summarizeMarketStress, summarizePriceYears } from './tracker-calculations.mjs';

const publicDns = async () => [{ address: '8.8.8.8', family: 4 }];

test('feed URL validation accepts public HTTPS and rejects internal addresses', async () => {
  await validateFeedUrl('https://feed.example/prices', publicDns);
  await assert.rejects(validateFeedUrl('http://feed.example/prices', publicDns), /public HTTPS/);
  await assert.rejects(validateFeedUrl('https://127.0.0.1/private', publicDns), /Private and reserved/);
  await assert.rejects(validateFeedUrl('https://feed.example/private', async () => [{ address: '10.0.0.4', family: 4 }]), /resolve only to public/);
  await assert.rejects(validateFeedUrl('https://localhost/private', publicDns), /public Internet host/);
});

test('unconfigured PC tracker exposes manual-only status without crashing', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'vesper-pc-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const tracker = await createPCPriceTracker({
    root: directory,
    dataPath: join(directory, 'history.json'),
    configPath: join(directory, 'missing-feeds.json'),
  });
  assert.equal(tracker.getStatus().hasConfiguredFeeds, false);
  assert.deepEqual(tracker.getStatus().feeds, []);
  const refresh = await tracker.refresh({ manual: true });
  assert.equal(refresh.noSources, true);
});

test('price observation validation keeps free, paid, INR, and source rules distinct', () => {
  const free = normalizePriceObservation({
    partId: 'cpu-ryzen-5-5600', condition: 'free', priceINR: 0,
    source: 'Local reuse group', observedAt: new Date().toISOString(),
  });
  assert.equal(free.condition, 'free');
  assert.equal(free.priceINR, 0);
  assert.throws(() => normalizePriceObservation({ name: 'GPU', condition: 'new', priceINR: 0, source: 'Store' }), /positive INR/);
  assert.throws(() => normalizePriceObservation({ name: 'GPU', condition: 'used', price: 12, currency: 'USD', source: 'Store' }), /already be in INR/);
});

test('current price summaries use the latest recent sample per listing', () => {
  const now = Date.now();
  const records = [
    { partId: 'part-a', condition: 'new', priceINR: 100, source: 'Shop A', listingId: 'sku-1', observedAt: new Date(now - 86_400_000).toISOString() },
    { partId: 'part-a', condition: 'new', priceINR: 90, source: 'Shop A', listingId: 'sku-1', observedAt: new Date(now - 1000).toISOString() },
    { partId: 'part-a', condition: 'new', priceINR: 120, source: 'Shop B', listingId: 'sku-2', observedAt: new Date(now - 1000).toISOString() },
  ];
  const summary = summarizeCurrentPrices(records, { partId: 'part-a', condition: 'new', now });
  assert.equal(summary.count, 2);
  assert.equal(summary.minINR, 90);
  assert.equal(summary.medianINR, 105);
  assert.equal(summary.averageINR, 105);
  assert.equal(summary.bestListing.source, 'Shop A');
});

test('annual history explicitly identifies unreleased and unverified years', () => {
  const summaries = summarizePriceYears([{
    partId: 'part-a', condition: 'used', priceINR: 50, source: 'Archive', observedAt: '2023-07-01T00:00:00.000Z',
  }], { partId: 'part-a', condition: 'used', launchYear: 2022, currentYear: 2024 });
  assert.deepEqual(summaries.map((item) => item.status), ['not-released', 'not-released', 'no-verified-data', 'observed', 'no-verified-data']);
});

test('2027 and 2028 forecasts use observed annual data and are withheld when thin', () => {
  const sparse = forecastObservedPrice([], { partId: 'part-a' });
  assert.equal(sparse.available, false);
  const rows = [
    ['2024-01-01', 100], ['2024-08-01', 110],
    ['2025-01-01', 120], ['2025-09-01', 130],
    ['2026-01-01', 140], ['2026-10-01', 150],
  ].map(([date, price], index) => ({
    partId: 'part-a', condition: 'new', priceINR: price, source: `Source ${index % 3}`,
    listingId: `listing-${index % 3}`, observedAt: `${date}T12:00:00.000Z`,
  }));
  const forecast = forecastObservedPrice(rows, { partId: 'part-a', condition: 'new', now: Date.parse('2026-10-12T12:00:00.000Z') });
  assert.equal(forecast.available, true);
  assert.deepEqual(forecast.forecasts.map((item) => item.year), [2027, 2028]);
  assert.ok(forecast.forecasts.every((item) => item.lowINR <= item.estimateINR && item.estimateINR <= item.highINR));
  assert.match(forecast.caveat, /not a statistical guarantee/);
});

test('AMFI parser records dated index-scheme NAVs and skips unrelated schemes', () => {
  const current = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = `${current.getUTCDate()}-${months[current.getUTCMonth()]}-${current.getUTCFullYear()}`;
  const text = [
    'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date',
    `10001;INF000000001;-;Example Nifty 50 Index Fund;Direct Plan;Growth Option;125.1234;${date}`,
    `10002;INF000000002;-;Example Balanced Advantage Fund;Direct Plan;Growth Option;42.5000;${date}`,
    `10003;INF000000003;-;Example Sensex Index Fund;Direct Plan;Growth Option;0;bad-date`,
  ].join('\n');
  const records = parseAMFINavText(text);
  assert.equal(records.length, 1);
  assert.equal(records[0].instrumentId, '10001-direct-plan-growth-option');
  assert.equal(records[0].valueType, 'nav');
  assert.equal(records[0].currency, 'INR');
  assert.equal(records[0].source, 'AMFI published daily NAV file');
  assert.ok(records[0].checkedAt);
});

test('fund observations reject mixed index points, NAV currency, and missing source evidence', () => {
  const base = {
    instrumentId: 'nifty-50', name: 'Nifty 50', instrumentType: 'index', valueType: 'index-level',
    value: 25000, unit: 'points', source: 'Exchange', sourceUrl: 'https://exchange.example/index',
    observedAt: new Date().toISOString(), returnBasis: 'price-index',
  };
  assert.equal(normalizeFundObservation(base).valueType, 'index-level');
  assert.throws(() => normalizeFundObservation({ ...base, valueType: 'nav' }), /never mix/);
  assert.throws(() => normalizeFundObservation({ ...base, sourceUrl: '' }), /source URL/);
  assert.throws(() => normalizeFundObservation({ ...base, returnBasis: 'guess' }), /returnBasis/);
});

test('EMI calculator validates inputs and discloses unknown versus entered fees', () => {
  const zeroRate = calculateEmi({ principal: 100_000, annualRatePercent: 0, tenureMonths: 10 });
  assert.equal(zeroRate.emiINR, 10_000);
  assert.equal(zeroRate.processingFeeINR, null);
  assert.equal(zeroRate.totalWithKnownFeeINR, null);
  const withFees = calculateEmi({ principal: 100_000, annualRatePercent: 0, tenureMonths: 10, processingFeePercent: 1, processingFeeINR: 1000 });
  assert.equal(withFees.processingFeeINR, 2000);
  assert.equal(withFees.totalWithKnownFeeINR, 102_000);
  assert.throws(() => calculateEmi({ principal: -1, annualRatePercent: 9, tenureMonths: 60 }), /positive loan amount/);
});

test('market-stress observations preserve source scoring and summarize represented categories equally', () => {
  const now = Date.parse('2026-10-12T12:00:00.000Z');
  const records = [
    { market: 'india', category: 'volatility', indicatorId: 'india-vix', name: 'India VIX', value: 20, unit: 'points', stressScore: 20, scoreMethod: 'Scale source percentile to 0–100', source: 'Exchange', sourceUrl: 'https://exchange.example/vix', observedAt: '2026-10-10T12:00:00.000Z', checkedAt: '2026-10-10T12:01:00.000Z' },
    { market: 'india', category: 'volatility', indicatorId: 'options-spread', name: 'Options spread', value: 5, unit: '%', stressScore: 80, scoreMethod: 'Higher spread maps to higher stress', source: 'Exchange', sourceUrl: 'https://exchange.example/spread', observedAt: '2026-10-11T12:00:00.000Z', checkedAt: '2026-10-11T12:01:00.000Z' },
    { market: 'india', category: 'drawdown', indicatorId: 'index-drawdown', name: 'Index drawdown', value: -12, unit: '%', stressScore: 70, scoreMethod: 'Historical drawdown percentile', source: 'Exchange', sourceUrl: 'https://exchange.example/drawdown', observedAt: '2026-10-11T12:00:00.000Z', checkedAt: '2026-10-11T12:01:00.000Z' },
    { market: 'global', category: 'credit', indicatorId: 'global-credit', name: 'Credit spread', value: 2, unit: 'bps', stressScore: 99, scoreMethod: 'Higher spread maps to higher stress', source: 'Provider', sourceUrl: 'https://provider.example/credit', observedAt: '2026-10-11T12:00:00.000Z', checkedAt: '2026-10-11T12:01:00.000Z' },
  ];
  const summary = summarizeMarketStress(records, { market: 'india', now });
  assert.equal(summary.score, 60);
  assert.equal(summary.indicatorCount, 3);
  assert.equal(summary.categoryCount, 2);
  assert.equal(summary.coveragePercent, 29);
  assert.equal(summary.staleIndicatorCount, 0);
  const normalized = normalizeStressObservation({ ...records[0], observedAt: new Date(now).toISOString() }, { checkedAt: now });
  assert.equal(normalized.stressScore, 20);
  assert.equal(normalized.market, 'india');
  assert.throws(() => normalizeStressObservation({ ...records[0], stressScore: 101 }), /between 0 and 100/);
  assert.throws(() => normalizeStressObservation({ ...records[0], sourceUrl: 'http://exchange.example/vix' }), /HTTPS/);
  const historical = normalizeStressObservation({
    ...records[0], market: 'reference-2008', observedAt: '2008-10-10T12:00:00.000Z',
  }, { checkedAt: now });
  const reference = summarizeMarketStress([historical], { market: 'reference-2008', now });
  assert.equal(reference.score, 20);
  assert.equal(reference.staleIndicatorCount, 0);
  assert.throws(() => normalizeStressObservation({
    ...records[0], market: 'reference-2008', observedAt: '2026-10-10T12:00:00.000Z',
  }, { checkedAt: now }), /dated in 2008/);
});

test('configured loan and stress feeds persist attributed records and respect their polling intervals', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'vesper-market-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, 'feeds.json');
  const dataPath = join(directory, 'history.json');
  await writeFile(configPath, JSON.stringify({
    schemaVersion: 1,
    fundFeeds: [],
    loanFeeds: [{ id: 'test-loans', name: 'Test lender source', url: 'https://feed.example/loans', tokenEnv: 'VESPER_TEST_FEED_TOKEN' }],
    stressFeeds: [{ id: 'test-stress', name: 'Test stress source', url: 'https://feed.example/stress' }],
  }));
  const originalToken = process.env.VESPER_TEST_FEED_TOKEN;
  process.env.VESPER_TEST_FEED_TOKEN = 'test-only-token';
  context.after(() => {
    if (originalToken == null) delete process.env.VESPER_TEST_FEED_TOKEN;
    else process.env.VESPER_TEST_FEED_TOKEN = originalToken;
  });
  let requests = 0;
  const tracker = await createIndiaMoneyTracker({
    configPath, dataPath, resolveHost: publicDns,
    fetchImpl: async (url, options) => {
      requests += 1;
      if (String(url).endsWith('/stress')) return new Response(JSON.stringify({
        schemaVersion: 1,
        type: 'stress',
        stress: [{
          market: 'global', category: 'volatility', indicatorId: 'test-volatility',
          name: 'Test volatility', value: 24, unit: 'points', stressScore: 55,
          scoreMethod: 'Source percentile mapped to a 0–100 scale',
          observedAt: new Date().toISOString(), sourceUrl: 'https://provider.example/stress',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      assert.equal(options.headers.Authorization, 'Bearer test-only-token');
      return new Response(JSON.stringify({
        schemaVersion: 1,
        type: 'loan',
        loans: [{
          lender: 'Example Bank', productName: 'Salaried', loanType: 'home-loan',
          annualRateMinPercent: 8.5, annualRateMaxPercent: 9.25,
          publishedAt: new Date().toISOString(), sourceUrl: 'https://lender.example/home-loan-rates',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    logError: (error) => { throw error; },
  });
  const first = await tracker.refresh('loan', { manual: true });
  assert.equal(first.ok, true);
  assert.equal(tracker.getStatus().latestLoans[0].annualRateMinPercent, 8.5);
  assert.equal(tracker.getStatus().latestLoans[0].annualRateMaxPercent, 9.25);
  const stored = JSON.parse(await readFile(dataPath, 'utf8'));
  assert.equal(stored.loans[0].source, 'Test lender source');
  assert.ok(stored.loans[0].checkedAt);
  const stressResult = await tracker.refresh('stress', { manual: true });
  assert.equal(stressResult.ok, true);
  assert.equal(tracker.getStatus().latestStress[0].stressScore, 55);
  const stressHistory = tracker.getHistory('stress', 'global');
  assert.equal(stressHistory.length, 1);
  assert.equal(stressHistory[0].source, 'Test stress source');
  assert.equal(requests, 2);
  const skippedStress = await tracker.refresh('stress');
  assert.equal(skippedStress.ok, false);
  assert.equal(skippedStress.feeds[0].skipped, true);
  assert.equal(requests, 2);
  const skipped = await tracker.refresh('loan');
  assert.equal(skipped.ok, false);
  assert.equal(skipped.feeds[0].skipped, true);
  assert.equal(requests, 2);
});
