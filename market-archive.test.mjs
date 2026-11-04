import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ARCHIVE_INSTRUMENTS, ARCHIVE_YEARS, MARKETS, PRICE_POINTS, PRICE_SOURCES,
  archiveSummary, archiveYearTable, countryBoard, lowestPriceBadge,
  preferredSourceFor, sourceCredits, pointsFor,
} from './market-archive.mjs';

import {
  DELINQUENCY_INSTRUMENTS, DELINQUENCY_OBSERVATIONS, DELINQUENCY_REFRESH_INTERVAL_MS,
  delinquencyBoard, delinquencySourceCredits, delinquencySummary,
  latestObservation, latestChange, refreshPlan, seriesHistory, createDelinquencyTracker,
} from './delinquency-tracker.mjs';

/* ── market-archive.mjs ──────────────────────────────────────────────────── */

test('every price point cites a registered source and a known instrument', () => {
  const sourceIds = new Set(PRICE_SOURCES.map((source) => source.id));
  const instrumentKeys = new Set(ARCHIVE_INSTRUMENTS.map((instrument) => instrument.key));
  const marketIds = new Set(MARKETS.map((market) => market.id));
  for (const point of PRICE_POINTS) {
    assert.ok(sourceIds.has(point.sourceId), `unknown source ${point.sourceId}`);
    assert.ok(instrumentKeys.has(point.key), `unknown instrument ${point.key}`);
    assert.ok(marketIds.has(point.market), `unknown market ${point.market}`);
    assert.ok(/^https:\/\//.test(point.sourceUrl), `non-HTTPS sourceUrl for ${point.key}`);
    assert.ok(point.value > 0, `non-positive value for ${point.key}`);
    assert.ok(Number.isInteger(point.year));
  }
});

test('every ARCHIVE_YEARS row is verified, not-available, or not-released — never a guess', () => {
  const rows = archiveYearTable('gpu-rtx-4060', { market: 'in' });
  assert.equal(rows.length, ARCHIVE_YEARS.length);
  for (const row of rows) {
    assert.ok(['verified', 'not-available', 'not-released'].includes(row.status));
    if (row.status !== 'verified') {
      assert.equal(row.entries.length, 0);
      assert.equal(row.best, null);
      assert.equal(row.preferred, null);
    } else {
      assert.ok(row.entries.length >= 1);
      assert.equal(row.best, Math.min(...row.entries.map((entry) => entry.value)));
    }
  }
  // A 2023 part cannot report 2020-2022 anything but "not released".
  const early = rows.filter((row) => row.year < 2023);
  assert.ok(early.every((row) => row.status === 'not-released'));
  // A year with no verified figure must say "not available", not a number.
  const unavailable = rows.filter((row) => row.status === 'not-available');
  assert.ok(unavailable.length > 0, 'expected explicit not-available years');
  assert.ok(unavailable.every((row) => row.label === 'Not available' && row.worst == null));
});

test('multi-source records resolve to the most-used source while crediting all of them', () => {
  const points = pointsFor('cpu-ryzen-7-7800x3d', { market: 'in' });
  assert.ok(points.length >= 2, 'expected multiple sources for the 7800X3D');
  const { source, contributors } = preferredSourceFor(points);
  assert.ok(source);
  const counts = new Map();
  for (const point of points) counts.set(point.sourceId, (counts.get(point.sourceId) || 0) + 1);
  const maxCount = Math.max(...counts.values());
  assert.equal(counts.get(source.id), maxCount, 'winner must be the most-used source');
  assert.equal(contributors.length, counts.size, 'every source is still credited');
  assert.ok(contributors.every((entry) => entry.count > 0));
});

test('ties break on the documented usage rank (retailer over press)', () => {
  const { source, contributors } = preferredSourceFor([
    { sourceId: 'ign-7800x3d' },
    { sourceId: 'vedant-in' },
  ]);
  assert.equal(source.id, 'vedant-in', 'rank 1 retailer beats rank 4 press at equal counts');
  assert.equal(contributors.length, 2);
});

test('lowest-price badge reports drop percentages inside one currency', () => {
  const badge = lowestPriceBadge('cpu-ryzen-5-7600', { market: 'jp' });
  assert.equal(badge.available, true);
  assert.equal(badge.currency, 'JPY');
  assert.equal(badge.lowest.value, 26480);
  assert.equal(badge.first.value, 37326);
  assert.equal(badge.dropFromFirstPercent, 29.1);
  const missing = lowestPriceBadge('gpu-rtx-4060', { market: 'de' });
  assert.equal(missing.available, false);
  assert.match(missing.reason, /No verified/);
  assert.equal(missing.dropFromFirstPercent, null);
});

test('country board keeps unverified markets visible with their local comparators', () => {
  const board = countryBoard('gpu-rtx-4060');
  assert.equal(board.length, MARKETS.length);
  const germany = board.find((row) => row.market.id === 'de');
  assert.equal(germany.verified, false);
  assert.equal(germany.lowest, null);
  assert.ok(germany.localTrackers.length > 0, 'unverified markets still list where to look');
  const japan = board.find((row) => row.market.id === 'jp');
  assert.equal(japan.verified, true);
  assert.equal(japan.preferred.id, 'kakaku-rtx4060');
});

test('archive summary counts verified, unavailable and unreleased rows', () => {
  const summary = archiveSummary();
  assert.equal(summary.points, PRICE_POINTS.length);
  assert.equal(summary.sources, PRICE_SOURCES.length);
  assert.ok(summary.counts['not-available'] > 0, 'gaps must be reported, not omitted');
  assert.ok(summary.counts.verified > 0);
  assert.equal(
    summary.counts.verified + summary.counts['not-available'] + summary.counts['not-released'],
    ARCHIVE_INSTRUMENTS.length * summary.marketsWithData * ARCHIVE_YEARS.length,
  );
});

test('source credits list every source with its observation count', () => {
  const credits = sourceCredits();
  assert.equal(credits.length, PRICE_SOURCES.length);
  assert.ok(credits.every((entry) => typeof entry.observations === 'number'));
  const total = credits.reduce((sum, entry) => sum + entry.observations, 0);
  assert.equal(total, PRICE_POINTS.length);
  assert.ok(credits.some((entry) => !entry.contributed), 'feed-only targets are listed too');
});

/* ── delinquency-tracker.mjs ─────────────────────────────────────────────── */

test('delinquency archive separates verified from excerpt-only figures', () => {
  const summary = delinquencySummary();
  assert.equal(summary.observations, DELINQUENCY_OBSERVATIONS.length);
  assert.equal(summary.verified + summary.excerpt, DELINQUENCY_OBSERVATIONS.length);
  assert.ok(summary.excerpt > 0, 'excerpts are labelled, not silently promoted');
  assert.ok(summary.missing > 0, 'missing series are reported as missing');
  const sourceIds = new Set(DELINQUENCY_INSTRUMENTS.map((instrument) => instrument.sourceId));
  for (const sourceId of sourceIds) assert.ok(sourceId, 'instruments must name a publisher');
});

test('series history is chronological and latest observation matches it', () => {
  const history = seriesHistory('us-auto-90-flow');
  assert.ok(history.length >= 6);
  const ranks = history.map((row) => row.period);
  assert.deepEqual(ranks, [...ranks].sort());
  const latest = latestObservation('us-auto-90-flow');
  assert.equal(latest.available, true);
  assert.equal(latest.observation.period, history.at(-1).period);
  const change = latestChange('us-auto-90-flow');
  assert.ok(Math.abs(change.deltaPoints) < 5);
});

test('stock and flow metrics stay distinct instruments', () => {
  const flow = latestObservation('us-student-90-flow');
  const stock = latestObservation('us-student-90-stock');
  assert.equal(flow.instrument.kind, 'flow');
  assert.equal(stock.instrument.kind, 'stock');
  assert.notEqual(flow.observation.value, stock.observation.value);
  assert.match(flow.instrument.threshold, /annualised/i);
});

test('LAP and microfinance gaps report a reason instead of a number', () => {
  const lap = latestObservation('in-lap-loan-delinquency');
  assert.equal(lap.available, false);
  assert.equal(lap.observation, null);
  assert.match(lap.reason, /loans against property/i);
  const mfi = latestObservation('in-microfinance-delinquency');
  assert.equal(mfi.available, false);
  assert.match(mfi.reason, /microfinance/i);
});

test('refresh plan is hourly and never claims a release cadence it does not have', () => {
  const plan = refreshPlan({ now: Date.parse('2026-10-13T12:00:00.000Z') });
  assert.equal(plan.refreshIntervalMs, 60 * 60 * 1000);
  assert.equal(DELINQUENCY_REFRESH_INTERVAL_MS, 60 * 60 * 1000);
  assert.equal(plan.nextCheckAt, '2026-10-13T13:00:00.000Z');
  assert.ok(plan.publishers.length >= 10);
  assert.match(plan.note, /change only when a publisher releases/);
});

test('delinquency board groups instruments by region with credits attached', () => {
  const board = delinquencyBoard();
  const regions = board.map((group) => group.region);
  assert.ok(regions.includes('United States') && regions.includes('India'));
  const credits = delinquencySourceCredits();
  const total = credits.reduce((sum, source) => sum + source.observations, 0);
  assert.equal(total, DELINQUENCY_OBSERVATIONS.length);
  const nyfed = credits.find((source) => source.id === 'nyfed-hhdc');
  assert.ok(nyfed.observations > 10, 'the NY Fed contributes the bulk of the series');
});

test('hourly engine runs a check, persists a ledger, and rate-limits manual refreshes', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'vesper-delinquency-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dataPath = join(dir, 'delinquency.json');
  let clock = Date.parse('2026-10-13T12:00:00.000Z');

  const tracker = await createDelinquencyTracker({ dataPath, now: () => clock });
  const first = await tracker.refresh();
  assert.equal(first.ok, true);
  assert.equal(first.fetched, 0);
  assert.match(first.message, /hourly cadence/);

  const status = tracker.getStatus();
  assert.equal(status.refreshIntervalMs, 60 * 60 * 1000);
  assert.equal(status.lastRefreshAt, '2026-10-13T12:00:00.000Z');
  assert.equal(status.nextRefreshAt, '2026-10-13T13:00:00.000Z');
  assert.equal(status.hasAuthorisedFeed, false);

  const manual = await tracker.refresh({ manual: true });
  assert.equal(manual.ok, true, 'the first manual check is allowed');
  const limited = await tracker.refresh({ manual: true });
  assert.equal(limited.rateLimited, true, 'manual checks are limited to one per minute');

  clock += 60 * 60 * 1000;
  const second = await tracker.refresh();
  assert.equal(second.ok, true);
  // initial tick + the allowed manual check + the advanced hourly tick.
  assert.equal(tracker.getStatus().checks.length, 3, 'each tick is logged');
  await rm(dir, { recursive: true, force: true });
});

test('hourly engine accepts only sourced, dated observations and rejects invented rows', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'vesper-delinquency-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tracker = await createDelinquencyTracker({ dataPath: join(dir, 'ledger.json') });

  const count = await tracker.addObservations([
    { key: 'in-lap-loan-delinquency', period: '2026-Q2', value: 1.4, source: 'Sample bank risk report', sourceUrl: 'https://example.org/risk', note: 'Sample entry.' },
  ]);
  assert.equal(count, 1);
  const status = tracker.getStatus();
  assert.equal(status.userObservations.at(-1).key, 'in-lap-loan-delinquency');

  await assert.rejects(() => tracker.addObservations([{ key: 'in-lap-loan-delinquency', period: '2026-Q2', value: 1.4, source: '' }]), /publisher/i);
  await assert.rejects(() => tracker.addObservations([{ key: 'in-lap-loan-delinquency', period: 'next quarter', value: 1.4, source: 'X' }]), /period/i);
  await assert.rejects(() => tracker.addObservations([{ key: 'in-lap-loan-delinquency', period: '2026-Q2', value: 400, source: 'X' }]), /between 0 and 100/i);
  await assert.rejects(() => tracker.addObservations([{ key: 'made-up-instrument', period: '2026-Q2', value: 1, source: 'X' }]), /known delinquency instrument/i);
  await assert.rejects(() => tracker.addObservations([{ key: 'in-lap-loan-delinquency', period: '2026-Q2', value: 1.4, source: 'X', sourceUrl: 'http://insecure.example' }]), /HTTPS/i);
  await rm(dir, { recursive: true, force: true });
});

test('hourly engine surfaces authorised feed failures instead of swallowing them', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'vesper-delinquency-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tracker = await createDelinquencyTracker({
    dataPath: join(dir, 'ledger.json'),
    fetchRows: () => Promise.reject(new Error('Feed unreachable')),
    logError: () => {},
  });
  const result = await tracker.refresh();
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Feed unreachable');
  assert.match(result.message, /Checked configured sources/);
  assert.equal(tracker.getStatus().hasAuthorisedFeed, true);
  await rm(dir, { recursive: true, force: true });
});
