/**
 * markets.js — the Vesper Market Terminal.
 *
 * Two boards share one page, one token registry and one component kit:
 *
 *  1. A stock-tracker-style PC-component market: per-year price rows for every
 *     tracked instrument in a selected market, a cross-market board, and a
 *     dense matrix screener. Every verified cell carries its source link and
 *     basis; every cell we could not verify prints NOT AVAILABLE or NOT
 *     RELEASED. Nothing is interpolated, converted, or inferred.
 *
 *  2. A loan-delinquency terminal (EMI, cards, auto, mortgages, LAP, microfinance)
 *     that re-checks on a one-hour cadence, separating verified table figures
 *     from search-index excerpts, and crediting every publisher.
 *
 * Everything renders through ui-kit/vesper-ui.js on top of tokens.css, which is
 * what keeps this page visually identical to the Studio, the Arcade, and the
 * desktop windows.
 */

import { TileCard, MetricBadge, DataChart, TerminalBox, el, formatNumber } from './ui-kit/vesper-ui.js';
import { applyPaletteTheme, PALETTES } from './theme-provider.js';

const state = {
  archive: null,
  market: 'in',
  key: null,
  delinquency: null,
  log: null,
  chart: null,
};

const money = (value, currency = 'INR') => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'NOT AVAILABLE';
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', {
      style: 'currency', currency, maximumFractionDigits: number < 100 ? 2 : 0,
    }).format(number);
  } catch {
    return `${currency} ${formatNumber(number)}`;
  }
};

const displayTime = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
};

const link = (label, url) => {
  const anchor = el('a', { class: 'vt-link', text: label, href: url, target: '_blank', rel: 'noopener noreferrer' });
  return anchor;
};

async function api(path) {
  const response = await fetch(path, { cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

/* ------------------------------------------------------------------ *
 *  Dense tables
 * ------------------------------------------------------------------ */

function table(headers, rows, className = 'vt-table') {
  const head = el('thead', {}, [el('tr', {}, headers.map((text) => el('th', { scope: 'col', text })) )]);
  const body = el('tbody', {}, rows.map((cells) => el('tr', {}, cells)));
  // Wrapped so a wide screener scrolls inside its tile instead of pushing text
  // out of the panel.
  return el('div', { class: 'vt-scroll-x' }, [el('table', { class: className }, [head, body])]);
}

const statusTag = (status) => {
  const label = status === 'verified' ? 'VERIFIED'
    : status === 'not-released' ? 'NOT RELEASED'
      : 'NOT AVAILABLE';
  return el('span', { class: `vt-tag vt-tag--${status}`, text: label });
};

/* ------------------------------------------------------------------ *
 *  Tile 1 · archive header
 * ------------------------------------------------------------------ */

function buildSummaryTile() {
  const body = el('div', { class: 'vt-stack', id: 'archive-summary' });
  return TileCard({ title: 'Verified archive', kicker: '01 / COVERAGE', span: 2, body });
}

function renderSummary(payload) {
  const root = document.getElementById('archive-summary');
  if (!root) return;
  const { summary } = payload;
  root.replaceChildren(
    el('div', { class: 'vt-row' }, [
      MetricBadge({ label: 'Snapshot', value: summary.snapshotDate }),
      MetricBadge({ label: 'Verified cells', value: String(summary.counts.verified), tone: 'good' }),
      MetricBadge({ label: 'Not available', value: String(summary.counts['not-available']), tone: 'warn', title: 'Years and markets we could not verify. Never estimated.' }),
      MetricBadge({ label: 'Not released yet', value: String(summary.counts['not-released']) }),
      MetricBadge({ label: 'Instruments', value: String(summary.instruments) }),
      MetricBadge({ label: 'Markets', value: `${summary.marketsWithData}/${summary.markets}`, unit: 'with data' }),
      MetricBadge({ label: 'Sources credited', value: String(summary.sources) }),
    ]),
    el('p', { class: 'vt-muted', text: 'Rows are priced only where a published page was read. Where no figure could be verified, the cell says NOT AVAILABLE; where the product did not exist yet it says NOT RELEASED. The two are never merged.' }),
  );
}

/* ------------------------------------------------------------------ *
 *  Tile 2 · single component, year by year
 * ------------------------------------------------------------------ */

function buildInstrumentTile() {
  const controls = el('div', { class: 'vt-row vt-controls', id: 'archive-controls' });
  const metrics = el('div', { class: 'vt-row', id: 'instrument-metrics' });
  const years = el('div', { id: 'instrument-years' });
  const chart = el('div', { id: 'instrument-chart' });
  const notes = el('div', { class: 'vt-stack', id: 'instrument-notes' });
  const body = el('div', { class: 'vt-stack' }, [controls, metrics, chart, years, notes]);
  return TileCard({ title: 'Component price history', kicker: '02 / YEAR BY YEAR', span: 2, body });
}

function renderControls(payload) {
  const root = document.getElementById('archive-controls');
  if (!root) return;
  const marketSelect = el('select', { class: 'vt-select', 'aria-label': 'Market' },
    payload.markets.map((market) => el('option', { value: market.id, text: `${market.name} (${market.currency})` })));
  marketSelect.value = state.market;
  marketSelect.addEventListener('change', () => { state.market = marketSelect.value; void loadArchive(); });

  const instrumentSelect = el('select', { class: 'vt-select', 'aria-label': 'Component' },
    payload.instruments.map((instrument) => el('option', { value: instrument.key, text: instrument.label })));
  instrumentSelect.value = state.key || payload.instruments[0].key;
  instrumentSelect.addEventListener('change', () => { state.key = instrumentSelect.value; void loadArchive(); });

  root.replaceChildren(
    el('label', { class: 'vt-field' }, [el('span', { text: 'MARKET' }), marketSelect]),
    el('label', { class: 'vt-field' }, [el('span', { text: 'COMPONENT' }), instrumentSelect]),
    el('span', { class: 'vt-pill', text: `SNAPSHOT ${payload.summary.snapshotDate}` }),
  );
}

function renderInstrument(payload) {
  const selection = payload.selection;
  const instrument = payload.instruments.find((entry) => entry.key === selection.key);
  const market = payload.markets.find((entry) => entry.id === selection.market);
  const currency = market?.currency || 'INR';
  const verified = selection.rows.filter((row) => row.status === 'verified');
  const unavailable = selection.rows.filter((row) => row.status === 'not-available');
  const unreleased = selection.rows.filter((row) => row.status === 'not-released');
  const badge = selection.badge;
  // "Most used" rule: the source with the most verified records for this
  // instrument in this market leads; ties break to the dated retailer record.
  const sourceName = (id) => payload.credits.find((source) => source.id === id)?.name || id;
  const preferredRow = verified.slice()
    .sort((a, b) => b.entries.length - a.entries.length || b.year - a.year)[0];
  const preferred = preferredRow?.preferred || null;
  const preferredCount = preferred ? verified.flatMap((row) => row.entries).filter((entry) => entry.sourceId === preferred.id).length : 0;

  const metrics = document.getElementById('instrument-metrics');
  metrics.replaceChildren(
    MetricBadge({ label: 'Instrument', value: instrument ? instrument.label : selection.key }),
    MetricBadge({ label: 'Market', value: market?.name || selection.market, unit: currency }),
    MetricBadge({ label: 'Verified years', value: String(verified.length), unit: `of ${selection.rows.length}`, tone: verified.length ? 'good' : 'warn' }),
    badge.available
      ? MetricBadge({
        label: 'Lowest verified',
        value: money(badge.lowest.value, currency),
        delta: badge.dropFromFirstPercent == null ? '' : `−${badge.dropFromFirstPercent}% vs first verified`,
        tone: 'good',
        title: `First verified: ${money(badge.first.value, currency)} (${badge.first.period}). Drop is computed inside one currency only.`,
      })
      : MetricBadge({ label: 'Lowest verified', value: 'NOT AVAILABLE', tone: 'warn', title: badge.reason }),
    MetricBadge({
      label: 'Preferred source',
      value: preferred ? `${preferred.name} (${preferredCount} record${preferredCount === 1 ? '' : 's'})` : '—',
      title: 'The source with the most verified records for this instrument; ties break to the dated retailer record. Every other source stays credited in the year table.',
    }),
    MetricBadge({ label: 'Gaps', value: String(unavailable.length + unreleased.length), unit: 'cells', tone: 'warn' }),
  );

  // Chart: only years with a verified figure. No interpolation between points.
  const chartHost = document.getElementById('instrument-chart');
  if (state.chart?.redraw && typeof state.chart.redraw === 'function') state.chart = null;
  if (verified.length) {
    state.chart = DataChart({
      title: `${instrument?.label || ''} — verified figures only`,
      height: 170,
      valueFormat: currency === 'INR' ? 'inr' : 'number',
      series: [{ name: `Verified (${currency})`, values: verified.map((row) => row.best) }],
      labels: verified.map((row) => String(row.year)),
    });
    chartHost.replaceChildren(
      state.chart,
      el('p', { class: 'vt-muted', text: `Points are plotted only for years with a verified figure (${verified.map((row) => row.year).join(', ')}). Years without one are omitted from the line rather than estimated.` }),
    );
  } else {
    chartHost.replaceChildren(el('p', { class: 'vt-muted', text: 'No verified figure exists for this component in this market, so there is nothing to plot.' }));
  }

  const years = document.getElementById('instrument-years');
  years.replaceChildren(table(
    ['Year', 'Status', 'Verified figures', 'Basis', 'Preferred source'],
    selection.rows.map((row) => {
      if (row.status !== 'verified') {
        return [
          el('th', { scope: 'row', text: String(row.year) }),
          statusTag(row.status),
          el('td', { text: row.label, class: 'vt-muted' }),
          el('td', { text: '—', class: 'vt-muted' }),
          el('td', { text: '—', class: 'vt-muted' }),
        ];
      }
      const figures = row.entries.map((entry) => el('div', { class: 'vt-figure' }, [
        el('b', { text: money(entry.value, currency) }),
        link(sourceName(entry.sourceId), entry.sourceUrl),
      ]));
      return [
        el('th', { scope: 'row', text: String(row.year) }),
        statusTag('verified'),
        el('td', {}, figures),
        el('td', { class: 'vt-muted', text: [...new Set(row.entries.map((entry) => entry.basis))].join(' · ') }),
        el('td', {}, [el('span', { class: 'vt-muted', text: row.preferred ? `${row.preferred.name} (${row.contributors.length} source${row.contributors.length === 1 ? '' : 's'})` : '—' })]),
      ];
    }),
  ));

  const notes = document.getElementById('instrument-notes');
  const entries = verified.flatMap((row) => row.entries);
  notes.replaceChildren(
    ...entries.map((entry) => el('p', { class: 'vt-note' }, [
      el('b', { text: `${entry.period || entry.year} · ` }),
      document.createTextNode(entry.note),
      el('span', { class: 'vt-muted', text: ` — ${entry.basis.replace('-', ' ')}` }),
    ])),
    unavailable.length
      ? el('p', { class: 'vt-muted', text: `NOT AVAILABLE for ${unavailable.map((row) => row.year).join(', ')} — no published figure for this component in this market was readable. Add a dated, sourced record to fill it in.` })
      : null,
    unreleased.length ? el('p', { class: 'vt-muted', text: `NOT RELEASED before ${unreleased.map((row) => row.year).join(', ')}.` }) : null,
  );
}

/* ------------------------------------------------------------------ *
 *  Tile 3 · cross-market board
 * ------------------------------------------------------------------ */

function buildCountryTile() {
  const body = el('div', { class: 'vt-stack', id: 'country-board' });
  return TileCard({ title: 'Cross-market board', kicker: '03 / ALL COUNTRIES', body });
}

function renderCountries(payload) {
  const root = document.getElementById('country-board');
  if (!root) return;
  const selection = payload.selection;
  const instrument = payload.instruments.find((entry) => entry.key === selection.key);
  root.replaceChildren(
    el('p', { class: 'vt-muted', text: `${instrument?.label || selection.key} — quoted in local currency. Markets without a verified figure stay visible so you can check their comparators by hand; no conversion is implied.` }),
    table(
      ['Market', 'Currency', 'Verified figure', 'Basis / source', 'Local comparators'],
      selection.countries.map((row) => [
        el('th', { scope: 'row', text: row.market.name }),
        el('td', { class: 'vt-mono', text: row.market.currency }),
        row.verified
          ? el('td', {}, [el('b', { text: money(row.lowest, row.market.currency) }), el('span', { class: 'vt-muted', text: row.highest !== row.lowest ? ` – ${money(row.highest, row.market.currency)}` : '' })])
          : el('td', {}, [statusTag('not-available')]),
        row.verified
          ? el('td', { class: 'vt-muted', text: `${row.points.at(-1).basis.replace('-', ' ')} · ${row.preferred?.name || '—'}` })
          : el('td', { class: 'vt-muted', text: 'No published figure read' }),
        el('td', { class: 'vt-muted', text: row.localTrackers.join(', ') }),
      ]),
    ),
  );
}

/* ------------------------------------------------------------------ *
 *  Tile 4 · matrix screener
 * ------------------------------------------------------------------ */

function buildMatrixTile() {
  const body = el('div', { class: 'vt-scroll', id: 'matrix-board' });
  return TileCard({ title: 'Matrix screener', kicker: '04 / EVERY COMPONENT × EVERY YEAR', span: 2, body });
}

function renderMatrix(payload) {
  const root = document.getElementById('matrix-board');
  if (!root) return;
  const market = payload.markets.find((entry) => entry.id === state.market);
  const currency = market?.currency || 'INR';
  const rows = payload.matrix.map(({ instrument, rows: yearRows }) => [
    el('th', { scope: 'row', text: instrument.label }),
    ...yearRows.map((row) => {
      if (row.status === 'verified') {
        return el('td', { class: 'vt-cell--verified', title: `${row.preferred?.name || ''} · ${row.entries.map((entry) => entry.basis).join(', ')}` }, [
          el('b', { text: money(row.best, currency, { compact: true }) }),
        ]);
      }
      return el('td', { class: 'vt-cell--muted', text: row.status === 'not-released' ? '—' : 'N/A' });
    }),
  ]);
  root.replaceChildren(
    el('p', { class: 'vt-muted', text: `${market?.name || state.market} (${currency}) · ${payload.years.join(' → ')} · VERIFIED = sourced figure, N/A = NOT AVAILABLE, — = NOT RELEASED. Every verified cell shows its source on hover.` }),
    table(
      ['Component', ...payload.years.map((year) => String(year))],
      rows,
      'vt-table vt-table--dense',
    ),
  );
}

/* ------------------------------------------------------------------ *
 *  Tile 5 · source credits (prices)
 * ------------------------------------------------------------------ */

function buildPriceCreditsTile() {
  const body = el('div', { class: 'vt-stack', id: 'price-credits' });
  return TileCard({ title: 'Price sources credited', kicker: '05 / ATTRIBUTION', body });
}

function renderPriceCredits(payload) {
  const root = document.getElementById('price-credits');
  if (!root) return;
  const contributed = payload.credits.filter((source) => source.contributed);
  const targets = payload.credits.filter((source) => !source.contributed);
  root.replaceChildren(
    table(
      ['Source', 'Kind', 'Coverage', 'Entries', 'Note'],
      contributed.map((source) => [
        el('th', { scope: 'row' }, [link(source.name, source.url)]),
        el('td', { class: 'vt-mono', text: source.kind }),
        el('td', { class: 'vt-muted', text: source.coverage }),
        el('td', { class: 'vt-mono', text: String(source.observations) }),
        el('td', { class: 'vt-muted', text: source.note }),
      ]),
    ),
    el('p', { class: 'vt-muted', text: 'Authorised-feed targets (listed so nothing is hidden, but contributing no archived figure yet):' }),
    table(
      ['Source', 'Kind', 'Coverage', 'Note'],
      targets.map((source) => [
        el('th', { scope: 'row' }, [link(source.name, source.url)]),
        el('td', { class: 'vt-mono', text: source.kind }),
        el('td', { class: 'vt-muted', text: source.coverage }),
        el('td', { class: 'vt-muted', text: source.note }),
      ]),
      'vt-table vt-table--dense',
    ),
    el('p', { class: 'vt-muted', text: payload.credits.find((source) => source.id === 'pcpricetracker-in')?.note || '' }),
  );
}

/* ------------------------------------------------------------------ *
 *  Tile 6 · loan delinquency (hourly)
 * ------------------------------------------------------------------ */

function buildDelinquencyTile() {
  const status = el('div', { class: 'vt-row', id: 'delinquency-status' });
  const controls = el('div', { class: 'vt-row' }, [
    el('button', {
      class: 'vt-btn vt-btn--primary', type: 'button', text: 'CHECK NOW',
      onclick: async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const response = await fetch('/api/delinquency/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          const result = await response.json().catch(() => ({}));
          state.log?.write({ text: response.ok ? result.message : (result.error || `check failed (${response.status})`), tone: response.ok ? 'ok' : 'warn' });
        } finally {
          button.disabled = false;
          await loadDelinquency();
        }
      },
    }),
    el('span', { class: 'vt-pill vt-pill--accent', text: 'HOURLY CADENCE' }),
  ]);
  const board = el('div', { class: 'vt-stack', id: 'delinquency-board' });
  const body = el('div', { class: 'vt-stack' }, [status, controls, board]);
  return TileCard({ title: 'Loan & EMI delinquency', kicker: '06 / HOURLY CREDIT WATCH', span: 2, body });
}

function renderDelinquency(payload) {
  state.delinquency = payload;
  const status = document.getElementById('delinquency-status');
  if (status) {
    status.replaceChildren(
      MetricBadge({ label: 'Cadence', value: '1', unit: 'hour' }),
      MetricBadge({ label: 'Last check', value: payload.lastRefreshAt ? displayTime(payload.lastRefreshAt) : 'Not yet' }),
      MetricBadge({ label: 'Next check', value: payload.nextRefreshAt ? displayTime(payload.nextRefreshAt) : '—' }),
      MetricBadge({ label: 'Observations', value: String(payload.summary.observations) }),
      MetricBadge({ label: 'Verified', value: String(payload.summary.verified), tone: 'good' }),
      MetricBadge({ label: 'Excerpt-only', value: String(payload.summary.excerpt), tone: 'warn', title: 'Read from a search index rather than a fetched table — treat as a lead to confirm.' }),
      MetricBadge({ label: 'Publishers', value: String(payload.summary.sources) }),
      MetricBadge({ label: 'Snapshot', value: payload.summary.snapshotDate }),
    );
  }

  const board = document.getElementById('delinquency-board');
  if (!board) return;
  board.replaceChildren(...payload.board.map((group) => el('div', { class: 'vt-stack' }, [
    el('h3', { class: 'vt-subhead', text: `${group.region} · ${group.rows.length} series` }),
    table(
      ['Series', 'Latest', 'Δ previous', 'Period', 'Kind', 'Confidence', 'Source'],
      group.rows.map((row) => {
        if (!row.available) {
          return [
            el('th', { scope: 'row', text: row.instrument.label }),
            el('td', {}, [statusTag('not-available')]),
            el('td', { text: '—', class: 'vt-muted' }),
            el('td', { text: '—', class: 'vt-muted' }),
            el('td', { class: 'vt-mono', text: row.instrument.kind }),
            el('td', { text: '—', class: 'vt-muted' }),
            el('td', { class: 'vt-muted', text: row.source ? row.source.name : '—' }),
          ];
        }
        const delta = row.change ? `${row.change.deltaPoints > 0 ? '+' : ''}${row.change.deltaPoints.toFixed(2)} pt` : '—';
        return [
          el('th', { scope: 'row' }, [
            el('span', { text: row.instrument.label }),
            el('small', { class: 'vt-muted', text: row.instrument.threshold }),
          ]),
          el('td', { class: 'vt-mono', text: `${row.observation.value.toFixed(2)}%` }),
          el('td', { class: `vt-mono ${row.change ? (row.change.deltaPoints > 0 ? 'is-bad' : 'is-good') : ''}`, text: delta }),
          el('td', { class: 'vt-mono', text: row.observation.period }),
          el('td', { class: 'vt-mono', text: row.instrument.kind }),
          el('td', {}, [row.excerptOnly ? el('span', { class: 'vt-tag vt-tag--excerpt', text: 'EXCERPT', title: row.observation.note }) : el('span', { class: 'vt-tag vt-tag--verified', text: 'VERIFIED' })]),
          el('td', {}, [link(row.source?.name || '—', row.observation.sourceUrl)]),
        ];
      }),
    ),
    ...group.rows.filter((row) => row.available).map((row) => el('p', { class: 'vt-note' }, [
      el('b', { text: `${row.instrument.label} · ` }),
      document.createTextNode(row.observation.note),
    ])),
    ...group.rows.filter((row) => !row.available).map((row) => el('p', { class: 'vt-note vt-note--warn' }, [
      el('b', { text: `${row.instrument.label} · NOT AVAILABLE — ` }),
      document.createTextNode(row.reason),
    ])),
  ])));
}

/* ------------------------------------------------------------------ *
 *  Tile 7 · delinquency publishers + refresh plan
 * ------------------------------------------------------------------ */

function buildDelinquencyCreditsTile() {
  const body = el('div', { class: 'vt-stack', id: 'delinquency-credits' });
  return TileCard({ title: 'Delinquency publishers', kicker: '07 / ATTRIBUTION', body });
}

function renderDelinquencyCredits(payload) {
  const root = document.getElementById('delinquency-credits');
  if (!root) return;
  root.replaceChildren(
    el('p', { class: 'vt-muted', text: payload.plan.note }),
    table(
      ['Publisher', 'Region', 'Cadence', 'Entries', 'Covers'],
      payload.credits.map((source) => [
        el('th', { scope: 'row' }, [link(source.name, source.url)]),
        el('td', { class: 'vt-muted', text: source.region }),
        el('td', { class: 'vt-mono', text: source.cadence }),
        el('td', { class: 'vt-mono', text: source.contributed ? String(source.observations) : '—' }),
        el('td', { class: 'vt-muted', text: source.covers }),
      ]),
    ),
    el('p', { class: 'vt-muted', text: 'Definitions differ by publisher: flow measures track balances moving into delinquency, stock measures track balances already late, arrears and Stage 2 use their own thresholds. They are never compared as though they were one number.' }),
  );
}

/* ------------------------------------------------------------------ *
 *  Tile 8 · sync log
 * ------------------------------------------------------------------ */

function buildLogTile() {
  const box = TerminalBox({ title: 'terminal' });
  state.log = box;
  return TileCard({ title: 'Sync log', kicker: '08 / CONSOLE', flush: true, body: [box] });
}

/* ------------------------------------------------------------------ *
 *  Data loading
 * ------------------------------------------------------------------ */

async function loadArchive() {
  if (!state.archive) return;
  try {
    const key = state.key || state.archive.instruments[0].key;
    const payload = await api(`/api/market-archive?key=${encodeURIComponent(key)}&market=${encodeURIComponent(state.market)}`);
    state.archive = payload;
    state.key = payload.selection.key;
    renderControls(payload);
    renderSummary(payload);
    renderInstrument(payload);
    renderCountries(payload);
    renderMatrix(payload);
    renderPriceCredits(payload);
    state.log?.write({ text: `archive ${payload.selection.key} · ${state.market} · ${payload.summary.counts.verified} verified / ${payload.summary.counts['not-available']} not available` });
  } catch (error) {
    state.log?.write({ text: error.message, tone: 'warn' });
  }
}

async function loadDelinquency() {
  try {
    const payload = await api('/api/delinquency');
    renderDelinquency(payload);
    renderDelinquencyCredits(payload);
    state.log?.write({ text: `delinquency checked ${payload.lastRefreshAt ? displayTime(payload.lastRefreshAt) : 'never'} · ${payload.summary.verified} verified / ${payload.summary.excerpt} excerpt-only / ${payload.summary.missing} not available` });
  } catch (error) {
    state.log?.write({ text: error.message, tone: 'warn' });
  }
}

/* ------------------------------------------------------------------ *
 *  Mount
 * ------------------------------------------------------------------ */

function mount() {
  const wall = document.getElementById('tile-wall');
  if (!wall) return;
  wall.append(
    buildSummaryTile(),
    buildInstrumentTile(),
    buildCountryTile(),
    buildDelinquencyTile(),
    buildMatrixTile(),
    buildDelinquencyCreditsTile(),
    buildPriceCreditsTile(),
    buildLogTile(),
  );

  // Theme cycling shares the Studio's palette engine, hotkey included via page.js.
  document.getElementById('markets-theme-cycle')?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'omarchy-quattro';
    const index = PALETTES.findIndex((palette) => palette.id === current);
    applyPaletteTheme(PALETTES[(index + 1 + PALETTES.length) % PALETTES.length].id);
  });

  void (async () => {
    try {
      state.archive = await api('/api/market-archive?market=in');
      state.key = state.archive.instruments[0].key;
      state.log?.write({ text: `archive loaded · ${state.archive.summary.points} sourced figures · ${state.archive.summary.sources} sources`, tone: 'ok' });
      await loadArchive();
    } catch (error) {
      state.log?.write({ text: error.message, tone: 'warn' });
    }
    await loadDelinquency();
  })();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
