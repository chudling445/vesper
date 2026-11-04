/**
 * studio.js — the unified Omarchy tiling layout shell.
 *
 * Every view in Vesper renders as a standardized tile here. The tiles share one
 * design-token registry (tokens.css), one component kit (ui-kit/vesper-ui.js),
 * and one core method surface (vesper-core.mjs), which is what stops the app
 * from reading like several different sites bolted together.
 *
 * Layout (order, span, collapsed) persists locally in localStorage.
 */

import { TileCard, MetricBadge, DataChart, TerminalBox, el, formatINR, formatNumber } from './ui-kit/vesper-ui.js';
import {
  calculateAllSectorFinancials, calculatePCPartCompatibility, calculateTDEEAndDeficit,
  syncIndianPCPrices, PC_SYNC_INTERVAL_MS, INDIAN_PC_VENDORS,
} from './vesper-core.mjs';
import { ANIMATION_PACK, ANIMATION_SEQUENCES } from './proceduralAnimations.js';
import { mountThemeSelector } from './theme-selector.js';
import { applyPaletteTheme, PALETTES } from './theme-provider.js';

const LAYOUT_KEY = 'vesper-studio-layout-v2';
const PORTFOLIO_KEY = 'vesper-studio-portfolio';
const scratchNotes = new Map();

/* ------------------------------------------------------------------ *
 *  Layout persistence
 * ------------------------------------------------------------------ */

function loadLayout() {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch { return {}; }
}
function saveLayout(state) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(state)); } catch { /* layout is best-effort */ }
}

/* ------------------------------------------------------------------ *
 *  Small form helpers
 * ------------------------------------------------------------------ */

function field(labelText, control) {
  return el('label', { class: 'studio-field' }, [
    el('span', { class: 'studio-field__label', text: labelText }),
    control,
  ]);
}
function numberInput(value, extra = {}) {
  return el('input', { type: 'number', value, inputmode: 'decimal', ...extra });
}
function selectInput(options, value) {
  const select = el('select', {}, options.map(([key, label]) => el('option', { value: key, text: label })));
  select.value = value;
  return select;
}
function readPortfolio() {
  try { return JSON.parse(localStorage.getItem(PORTFOLIO_KEY)) || {}; } catch { return {}; }
}

/* ------------------------------------------------------------------ *
 *  Tile builders — each returns a TileCard element
 * ------------------------------------------------------------------ */

const TILE_DEFS = [
  { id: 'dashboard', kicker: '01 / OVERVIEW', title: 'Dashboard', span: 2, render: buildDashboard },
  { id: 'chat', kicker: '02 / CONVERSATION', title: 'Chat Hub', render: buildChat },
  { id: 'avatar', kicker: '03 / COMPANION', title: '3D Studio', span: 2, render: buildAvatarStudio },
  { id: 'pc', kicker: '04 / BUILDS', title: 'PC Builder', render: buildPcBuilder },
  { id: 'sync', kicker: '04b / PRICES', title: 'India Price Sync', render: buildPriceSync },
  { id: 'markets', kicker: '05 / FINANCE', title: 'Markets & Finance', span: 2, render: buildMarkets },
  { id: 'health', kicker: '06 / WELLNESS', title: 'Health & TDEE', render: buildHealth },
  { id: 'arcade', kicker: '07 / ARCADE', title: 'Arcade', render: buildArcade },
  { id: 'settings', kicker: '08 / SYSTEM', title: 'Settings', render: buildSettings },
  { id: 'scratch', kicker: '09 / SCRATCH', title: 'Scratchpad', render: buildScratch },
];

/* ---- 01 Dashboard ------------------------------------------------- */
function buildDashboard() {
  const body = el('div', { class: 'vt-stack' });
  const metrics = el('div', { class: 'vt-row' });
  const chartHost = el('div');
  body.append(metrics, chartHost);

  function refresh() {
    const portfolio = readPortfolio();
    const result = calculateAllSectorFinancials(portfolio);
    metrics.replaceChildren(
      MetricBadge({ label: 'Invested', value: formatINR(result.totals.investedINR, { compact: true }) }),
      MetricBadge({ label: 'Current', value: formatINR(result.totals.currentINR, { compact: true }) }),
      MetricBadge({
        label: 'Net P&L',
        value: formatINR(result.totals.pnlINR, { compact: true }),
        tone: result.totals.pnlINR >= 0 ? 'good' : 'bad',
        delta: result.totals.pnlPct == null ? '' : `${result.totals.pnlPct >= 0 ? '+' : ''}${result.totals.pnlPct}%`,
      }),
      MetricBadge({
        label: 'Real return',
        value: result.inflation.realReturnPct == null ? '—' : `${result.inflation.realReturnPct}%`,
        unit: result.inflation.realReturnPct == null ? '' : `vs ${result.inflation.ratePct}% CPI`,
        tone: (result.inflation.realReturnPct ?? 0) >= 0 ? 'good' : 'bad',
      }),
    );
    const sectors = Object.entries(result.sectors).filter(([, sector]) => sector.count > 0);
    chartHost.replaceChildren(sectors.length
      ? DataChart({
        title: 'Holdings by sector (INR)',
        height: 150,
        valueFormat: 'inr',
        series: [{ name: 'Current value', values: sectors.map(([, sector]) => sector.currentINR) }],
        labels: sectors.map(([name]) => name),
      })
      : el('p', { class: 'vt-muted', text: 'No holdings recorded yet. Open Markets & Finance and load the labelled sample, or import your own ledger.' }));
  }
  refresh();
  window.addEventListener('vesper-studio-portfolio-change', refresh);
  body.append(el('a', { class: 'vt-pill vt-pill--accent', href: '/planner', text: 'OPEN IN BUILDS & MONEY →' }));
  return body;
}

/* ---- 02 Chat Hub -------------------------------------------------- */
function buildChat() {
  const facts = [
    ['Local', 'Ollama on 127.0.0.1 — stays on this PC'],
    ['Hosted', 'OpenAI · Anthropic · xAI · OpenAI-compatible'],
    ['Voice', 'Anime-dub speech profiles with viseme lip-sync'],
    ['Memory', 'Local fact graph + editable sidebar drawer'],
  ];
  return el('div', { class: 'vt-stack' }, [
    el('p', { class: 'vt-muted', text: 'Dual-engine routing: pick a local WebGPU/WASM model or a keyed cloud provider, then talk to Vesper with the avatar live beside the transcript.' }),
    el('div', { class: 'vt-grid-2' }, facts.map(([label, copy]) => el('div', { class: 'studio-fact' }, [
      el('b', { text: label }), el('span', { text: copy }),
    ]))),
    el('div', { class: 'vt-row' }, [
      el('a', { class: 'vt-btn vt-btn--primary', href: '/chat', text: 'OPEN CHAT' }),
      el('a', { class: 'vt-btn', href: '/quick-capture', text: 'QUICK CAPTURE' }),
      el('a', { class: 'vt-btn', href: '/voices', text: 'VOICE LAB' }),
    ]),
  ]);
}

/* ---- 03 3D Studio ------------------------------------------------- */
function buildAvatarStudio() {
  const poses = Object.keys(ANIMATION_PACK);
  const sequences = Object.keys(ANIMATION_SEQUENCES);
  return el('div', { class: 'vt-stack' }, [
    el('p', { class: 'vt-muted', text: 'VRM 1.0/2.0 viewport with MToon cel shading, spring-bone hair and cloth, a 14-channel expression cross-fader, and the authored gesture pack below.' }),
    el('div', { class: 'vt-row' }, [
      MetricBadge({ label: 'Expressions', value: '14', unit: 'channels' }),
      MetricBadge({ label: 'Gestures', value: String(poses.length), unit: 'poses' }),
      MetricBadge({ label: 'Sequences', value: String(sequences.length), unit: 'scripts' }),
      MetricBadge({ label: 'Lip-sync', value: '5', unit: 'visemes' }),
    ]),
    el('div', { class: 'vt-row' }, [
      el('a', { class: 'vt-btn vt-btn--primary', href: '/chat', text: 'OPEN 3D STUDIO' }),
      el('a', { class: 'vt-btn', href: '/model-only', text: 'MODEL-ONLY WINDOW' }),
    ]),
    el('div', { class: 'vt-grid-2' }, [
      el('div', { class: 'studio-fact' }, [el('b', { text: 'Poses' }), el('span', { text: poses.join(' · ') })]),
      el('div', { class: 'studio-fact' }, [el('b', { text: 'Sequences' }), el('span', { text: sequences.join(' · ') })]),
    ]),
  ]);
}

/* ---- 04 PC Builder ------------------------------------------------ */
function buildPcBuilder() {
  const socket = selectInput([['AM5', 'AM5'], ['AM4', 'AM4'], ['LGA1700', 'LGA1700'], ['LGA1851', 'LGA1851']], 'AM5');
  const cpuTdp = numberInput(105, { min: 0, step: 5 });
  const boardSocket = selectInput([['AM5', 'AM5'], ['AM4', 'AM4'], ['LGA1700', 'LGA1700'], ['LGA1851', 'LGA1851']], 'AM5');
  const ramType = selectInput([['DDR5', 'DDR5'], ['DDR4', 'DDR4']], 'DDR5');
  const ramSticks = numberInput(2, { min: 1, max: 8 });
  const gpuLength = numberInput(300, { min: 0 });
  const gpuTdp = numberInput(250, { min: 0 });
  const coolerHeight = numberInput(155, { min: 0 });
  const caseClearance = numberInput(330, { min: 0 });
  const psuWattage = numberInput(750, { min: 0 });

  const results = el('div', { class: 'vt-stack' });
  const terminal = TerminalBox({ title: 'compatibility solver' });

  const controls = el('div', { class: 'studio-form' }, [
    field('CPU socket', socket), field('CPU TDP (W)', cpuTdp),
    field('Board socket', boardSocket), field('Board memory', ramType),
    field('RAM sticks', ramSticks), field('GPU length (mm)', gpuLength),
    field('GPU TDP (W)', gpuTdp), field('Cooler height (mm)', coolerHeight),
    field('Case GPU clearance (mm)', caseClearance), field('PSU (W)', psuWattage),
  ]);

  function solve() {
    const build = {
      cpu: { socket: socket.value, tdp: Number(cpuTdp.value) },
      motherboard: { socket: boardSocket.value, ramType: ramType.value, ramSlots: Math.max(Number(ramSticks.value), 1), formFactor: 'ATX' },
      ram: Array.from({ length: Math.max(1, Number(ramSticks.value)) }, () => ({ type: ramType.value, modules: 1 })),
      gpu: { lengthMm: Number(gpuLength.value), tdp: Number(gpuTdp.value) },
      cooler: { heightMm: Number(coolerHeight.value), socketSupport: [socket.value] },
      pcCase: { maxGpuLengthMm: Number(caseClearance.value), maxCoolerHeightMm: Number(coolerHeight.value) + 20, formFactorSupport: ['ATX'] },
      psu: { wattage: Number(psuWattage.value) },
    };
    const result = calculatePCPartCompatibility(build);
    results.replaceChildren(
      MetricBadge({ label: 'Verdict', value: result.compatible ? 'COMPATIBLE' : 'ISSUES', tone: result.compatible ? 'good' : 'bad' }),
      MetricBadge({ label: 'Est. load', value: String(result.estimatedTotalTdp), unit: 'W' }),
      MetricBadge({
        label: 'PSU target', value: String(result.recommendedPsuWattage), unit: 'W',
        tone: result.headroomWattage != null && result.headroomWattage < 0 ? 'bad' : 'good',
      }),
      MetricBadge({ label: 'Headroom', value: result.headroomWattage == null ? '—' : String(result.headroomWattage), unit: result.headroomWattage == null ? '' : 'W' }),
    );
    terminal.write({ text: `solver → ${result.compatible ? 'compatible' : `${result.issues.length} issue(s)`}`, tone: result.compatible ? 'good' : 'bad' });
    for (const issue of result.issues) terminal.write({ text: issue.message, tone: 'bad' });
    for (const warning of result.warnings) terminal.write({ text: warning.message, tone: 'warn' });
    terminal.write({ text: result.assumptions });
  }

  for (const control of [socket, boardSocket, ramType]) control.addEventListener('change', solve);
  for (const control of [cpuTdp, ramSticks, gpuLength, gpuTdp, coolerHeight, caseClearance, psuWattage]) control.addEventListener('input', solve);
  solve();
  return el('div', { class: 'vt-stack' }, [controls, results, terminal]);
}

/* ---- 04b India Price Sync ----------------------------------------- */
function buildPriceSync() {
  const terminal = TerminalBox({ title: 'indian pc price engine' });
  const status = el('div', { class: 'vt-row' });
  let handle = null;

  function start(recurring) {
    handle?.stop();
    status.replaceChildren(MetricBadge({ label: 'Cadence', value: '2', unit: 'hours' }), MetricBadge({ label: 'Vendors', value: String(INDIAN_PC_VENDORS.length) }));
    terminal.write({ text: `sync start · ${recurring ? 'recurring every 2h' : 'one pass'}`, tone: 'accent' });
    // No vendor fetchers ship with Vesper: it does not scrape retailers on its own.
    handle = syncIndianPCPrices({
      recurring,
      log: (line) => terminal.write({ text: line, tone: line.includes('failed') ? 'bad' : undefined }),
      onSnapshot: (snapshot) => terminal.write({
        text: `snapshot · ${snapshot.totalObservations} observation(s) · ${snapshot.failedVendors.length} vendor(s) without data`,
        tone: snapshot.totalObservations ? 'good' : 'warn',
      }),
    });
    handle.refresh();
    if (handle.nextSyncAt) terminal.write({ text: `next sync at ${handle.nextSyncAt}` });
  }

  const body = el('div', { class: 'vt-stack' }, [
    el('p', { class: 'vt-muted', text: 'Historical INR price trends for CPUs, GPUs, boards, RAM, SSDs, PSUs, coolers, and cases. Vesper ships no scraper: point fetchers at sources you are permitted to read, and the engine logs snapshots and keeps the 2-hour cadence.' }),
    status,
    el('div', { class: 'vt-row' }, [
      el('button', { class: 'vt-btn vt-btn--primary', type: 'button', text: 'RUN ONE SYNC', onclick: () => start(false) }),
      el('button', { class: 'vt-btn', type: 'button', text: 'START 2H TIMER', onclick: () => start(true) }),
      el('button', { class: 'vt-btn', type: 'button', text: 'STOP', onclick: () => { handle?.stop(); terminal.write({ text: 'sync stopped', tone: 'warn' }); } }),
    ]),
    terminal,
  ]);
  status.replaceChildren(MetricBadge({ label: 'Cadence', value: '2', unit: 'hours' }), MetricBadge({ label: 'Vendors', value: String(INDIAN_PC_VENDORS.length) }));
  terminal.write({ text: `engine ready · interval ${PC_SYNC_INTERVAL_MS / 3600000}h` });
  return body;
}

/* ---- 05 Markets & Finance ----------------------------------------- */
function buildMarkets() {
  const host = el('div', { class: 'vt-stack' });
  const terminal = TerminalBox({ title: 'all-sector rollup' });

  function refresh() {
    const portfolio = readPortfolio();
    const result = calculateAllSectorFinancials(portfolio);
    const rows = Object.entries(result.sectors).map(([name, sector]) => el('div', { class: 'studio-sector' }, [
      el('span', { class: 'studio-sector__name', text: name }),
      el('span', { class: 'studio-sector__value', text: formatINR(sector.currentINR, { compact: true }) }),
      el('span', { class: `studio-sector__pnl${sector.pnlINR >= 0 ? ' is-good' : ' is-bad'}`, text: `${sector.pnlPct == null ? '—' : `${sector.pnlPct >= 0 ? '+' : ''}${sector.pnlPct}%`}` }),
    ]));
    host.replaceChildren(
      el('div', { class: 'vt-row' }, [
        MetricBadge({ label: 'Portfolio', value: formatINR(result.totals.currentINR, { compact: true }) }),
        MetricBadge({ label: 'P&L', value: formatINR(result.totals.pnlINR, { compact: true }), tone: result.totals.pnlINR >= 0 ? 'good' : 'bad' }),
        MetricBadge({ label: 'CPI', value: `${result.inflation.ratePct}%` }),
      ]),
      el('div', { class: 'vt-grid-2' }, rows),
    );
    terminal.write({ text: result.notes });
  }

  const body = el('div', { class: 'vt-stack' }, [
    el('p', { class: 'vt-muted', text: 'Indian equities & funds, global equities, direct mutual funds with XIRR, commodities, forex, fixed income, crypto, and real-estate yield — rolled up into one INR view with an inflation-adjusted return.' }),
    host,
    el('div', { class: 'vt-row' }, [
      el('button', {
        class: 'vt-btn vt-btn--primary', type: 'button', text: 'LOAD LABELLED SAMPLE',
        onclick: () => {
          localStorage.setItem(PORTFOLIO_KEY, JSON.stringify({
            inflationPct: 6,
            equities: [{ symbol: 'NIFTY50-INDEX', qty: 1, avgCost: 18000, lastPrice: 24500 }],
            mutualFunds: [{ name: 'Sample index fund', units: 500, nav: 52, invested: 20000 }],
            commodities: [{ name: 'Gold (g)', qty: 20, buyPrice: 5800, lastPrice: 7400 }],
            forex: [{ pair: 'USD/INR', amount: 2000, buyRate: 78, lastRate: 84 }],
            fixedIncome: [{ name: 'Sample PPF', type: 'PPF', principal: 150000, ratePct: 7.1, startDate: '2021-04-01' }],
            crypto: [{ symbol: 'BTC', qty: 0.005, avgCost: 40000, lastPrice: 62000, currency: 'USD' }],
            realEstate: [{ name: 'Sample flat', value: 6000000, annualRent: 216000, purchasePrice: 4800000, purchaseDate: '2020-06-01' }],
          }));
          terminal.write({ text: 'labelled sample loaded into local storage', tone: 'warn' });
          window.dispatchEvent(new CustomEvent('vesper-studio-portfolio-change'));
          refresh();
        },
      }),
      el('button', {
        class: 'vt-btn', type: 'button', text: 'CLEAR',
        onclick: () => { localStorage.removeItem(PORTFOLIO_KEY); window.dispatchEvent(new CustomEvent('vesper-studio-portfolio-change')); refresh(); },
      }),
      el('a', { class: 'vt-btn', href: '/planner', text: 'FULL TRACKERS →' }),
      el('a', { class: 'vt-btn vt-btn--primary', href: '/markets', text: 'OPEN MARKET TERMINAL →' }),
    ]),
    terminal,
  ]);
  refresh();
  window.addEventListener('vesper-studio-portfolio-change', refresh);
  return body;
}

/* ---- 06 Health & TDEE --------------------------------------------- */
function buildHealth() {
  const sex = selectInput([['male', 'Male'], ['female', 'Female']], 'male');
  const method = selectInput([['mifflin', 'Mifflin–St Jeor'], ['katch', 'Katch–McArdle']], 'mifflin');
  const age = numberInput(30, { min: 13, max: 100 });
  const weight = numberInput(70, { min: 25, max: 350, step: 0.1 });
  const height = numberInput(175, { min: 100, max: 250 });
  const activity = numberInput(1.5, { min: 1.2, max: 1.9, step: 0.05 });
  const deficit = numberInput(400, { min: 0, max: 1000, step: 50 });
  const out = el('div', { class: 'vt-row' });

  function solve() {
    const result = calculateTDEEAndDeficit({
      sex: sex.value, method: method.value, age: Number(age.value), weightKg: Number(weight.value),
      heightCm: Number(height.value), activityFactor: Number(activity.value), deficitKcal: Number(deficit.value),
      bodyFatPercent: 18,
    });
    if (result.error) { out.replaceChildren(el('p', { class: 'vt-muted', text: result.error })); return; }
    out.replaceChildren(
      MetricBadge({ label: 'BMR', value: String(result.bmr), unit: 'kcal' }),
      MetricBadge({ label: 'TDEE', value: String(result.tdee), unit: 'kcal' }),
      MetricBadge({ label: 'Target', value: String(result.targetCalories), unit: 'kcal', tone: 'good' }),
      MetricBadge({ label: 'Protein / Carbs / Fat', value: `${result.macros.proteinG}/${result.macros.carbsG}/${result.macros.fatG}`, unit: 'g' }),
      MetricBadge({ label: 'Goal date', value: result.targetDate || '—' }),
    );
  }
  for (const control of [sex, method]) control.addEventListener('change', solve);
  for (const control of [age, weight, height, activity, deficit]) control.addEventListener('input', solve);
  solve();
  return el('div', { class: 'vt-stack' }, [
    el('p', { class: 'vt-muted', text: 'Multi-formula energy solver with a macro split and a calorie-deficit target date, plus local nutrition, hydration, and fasting tracking on the full page.' }),
    el('div', { class: 'studio-form' }, [
      field('Profile', sex), field('Formula', method),
      field('Age', age), field('Weight (kg)', weight),
      field('Height (cm)', height), field('Activity factor', activity),
      field('Deficit (kcal)', deficit),
    ]),
    out,
    el('p', { class: 'vt-muted', text: 'Planning estimate only. Real energy needs vary; discuss diet or weight changes with a qualified clinician.' }),
  ]);
}

/* ---- 07 Arcade ---------------------------------------------------- */
function buildArcade() {
  const games = ['Chess vs AI', '2048', 'Wordle', 'Cookie Clicker', 'Dino Runner', 'Snake', 'Tetris', 'Fluid Simulation', 'Generative Art'];
  return el('div', { class: 'vt-stack' }, [
    el('p', { class: 'vt-muted', text: 'Offline arcade with a global IndexedDB high-score leaderboard. Every module runs locally with no network and no trackers.' }),
    el('div', { class: 'studio-chips' }, games.map((game) => el('span', { class: 'vt-pill', text: game }))),
    el('a', { class: 'vt-btn vt-btn--primary', href: '/games', text: 'ENTER THE ARCADE' }),
  ]);
}

/* ---- 08 Settings -------------------------------------------------- */
function buildSettings() {
  const themeHost = el('div');
  mountThemeSelector(themeHost);
  const transparentButton = el('button', {
    class: 'vt-btn', type: 'button', text: 'APPLY TRANSPARENT THEME',
    onclick: () => applyPaletteTheme('transparent'),
  });
  return el('div', { class: 'vt-stack' }, [
    el('p', { class: 'vt-muted', text: 'One palette engine drives the site and the desktop windows. Transparent clears the page background for floating windows and overlays.' }),
    el('div', { class: 'vt-row' }, [
      transparentButton,
      el('a', { class: 'vt-btn', href: '/workspace', text: 'WORKSPACE & BACKUPS →' }),
      el('a', { class: 'vt-btn', href: '/about', text: 'STUDIO GUIDE →' }),
    ]),
    themeHost,
    el('p', { class: 'vt-muted', text: `${PALETTES.length} shared themes available; press Ctrl/Cmd + Shift + T anywhere to cycle.` }),
  ]);
}

/* ---- 09 Scratchpad ------------------------------------------------ */
function buildScratch() {
  const textarea = el('textarea', {
    class: 'studio-scratch', rows: 6, maxlength: 4000,
    placeholder: 'Notes stay in this browser…',
    value: scratchNotes.get('scratch') || '',
  });
  textarea.addEventListener('input', () => scratchNotes.set('scratch', textarea.value));
  return el('div', { class: 'vt-stack' }, [
    el('p', { class: 'vt-muted', text: 'A local scratchpad tile. Resize it, drag it anywhere in the wall, or collapse it with a double-click on the header.' }),
    textarea,
  ]);
}

/* ------------------------------------------------------------------ *
 *  Wall assembly: order, span, collapse, drag, persistence
 * ------------------------------------------------------------------ */

const wall = document.querySelector('#tile-wall');
const layout = loadLayout();
const tiles = new Map();

function applySpan(tile, span) {
  tile.style.gridColumn = `span ${span}`;
  tile.dataset.span = String(span);
}
function cycleSpan(tile) {
  const next = Number(tile.dataset.span || '1') >= 2 ? 1 : 2;
  applySpan(tile, next);
  persist();
}
function persist() {
  const order = [...wall.children].map((tile) => tile.dataset.tileId);
  const spans = {};
  const collapsed = {};
  for (const tile of wall.children) {
    spans[tile.dataset.tileId] = Number(tile.dataset.span || '1');
    collapsed[tile.dataset.tileId] = tile.dataset.collapsed === 'true';
  }
  saveLayout({ order, spans, collapsed });
}

function makeDraggable(tile) {
  const head = tile.querySelector('.vt-tile__head');
  head.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.vt-tile__actions')) return;
    const startY = event.clientY;
    let dragging = false;
    try { head.setPointerCapture(event.pointerId); } catch { /* pointer capture is best-effort */ }
    const move = (moveEvent) => {
      if (!dragging && Math.abs(moveEvent.clientY - startY) < 6) return;
      dragging = true;
      tile.classList.add('vt-tile--dragging');
      const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('.vt-tile');
      if (!under || under === tile) return;
      const rect = under.getBoundingClientRect();
      const before = moveEvent.clientY < rect.top + rect.height / 2;
      wall.insertBefore(tile, before ? under : under.nextSibling);
    };
    const end = () => {
      try { head.releasePointerCapture(event.pointerId); } catch { /* already released */ }
      tile.classList.remove('vt-tile--dragging');
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', end);
      if (dragging) persist();
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', end);
  });
  head.addEventListener('dblclick', () => {
    const collapsed = tile.dataset.collapsed === 'true';
    tile.dataset.collapsed = String(!collapsed);
    tile.querySelector('.vt-tile__body').style.display = collapsed ? '' : 'none';
    persist();
  });
}

function buildTile(definition) {
  const tile = TileCard({
    title: definition.title,
    kicker: definition.kicker,
    interactive: true,
    body: definition.render(),
    actions: [
      el('button', {
        class: 'vt-btn', type: 'button', text: '⌗', title: 'Resize tile',
        onclick: (event) => { event.stopPropagation(); cycleSpan(tile); },
      }),
    ],
  });
  tile.dataset.tileId = definition.id;
  tile.dataset.span = String(layout.spans?.[definition.id] || definition.span || 1);
  tile.style.gridColumn = `span ${tile.dataset.span}`;
  if (layout.collapsed?.[definition.id] || (definition.id === 'scratch' && layout.order === undefined)) {
    tile.dataset.collapsed = 'true';
    tile.querySelector('.vt-tile__body').style.display = 'none';
  }
  makeDraggable(tile);
  tiles.set(definition.id, tile);
  return tile;
}

const ordered = [...TILE_DEFS].sort((a, b) => {
  const order = layout.order || [];
  const ia = order.indexOf(a.id);
  const ib = order.indexOf(b.id);
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
});
for (const definition of ordered) wall.append(buildTile(definition));
// The scratchpad starts hidden so the default wall shows the core eight views.
if (!layout.order) { persist(); }

document.querySelector('#studio-reset-layout')?.addEventListener('click', () => {
  try { localStorage.removeItem(LAYOUT_KEY); } catch { /* nothing to clear */ }
  location.reload();
});
document.querySelector('#studio-add-tile')?.addEventListener('click', () => {
  const tile = tiles.get('scratch');
  if (!tile) return;
  wall.append(tile);
  tile.dataset.collapsed = 'false';
  tile.querySelector('.vt-tile__body').style.display = '';
  persist();
});
