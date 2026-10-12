import { CATEGORIES, PARTS } from './pc-price-catalog.mjs';
import { calculateEmi, forecastObservedPrice, summarizeCurrentPrices, summarizeMarketStress, summarizePriceYears } from './tracker-calculations.mjs';

const $ = (id) => document.getElementById(id);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = String(text);
  return element;
};
const money = (value) => Number.isFinite(Number(value))
  ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value))
  : 'Not available';
const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const displayDate = (value, includeTime = true) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-IN', includeTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }) : 'Not recorded';
};
const pct = (value) => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : 'Not enough dated data';
const escapeKey = (parts) => parts.join('\u001f');
const state = { pcStatus: null, marketStatus: null, pcHistory: [], fundHistory: [], loanHistory: [], stressHistory: [], selectedFund: '', selectedPcPart: '', selectedLoan: '' };

async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || `Request failed (${response.status}).`);
  return result;
}

async function saveRecords(path, body) {
  const result = await api(path, { method: 'POST', body: JSON.stringify(body) });
  return result.count;
}

function isoDayAtNoon(value) { return new Date(`${value}T12:00:00.000Z`).toISOString(); }

function buildPartList() {
  const extras = (state.pcStatus?.latest || []).filter((item) => !PARTS.some((part) => part.id === item.partId))
    .map((item) => ({ id: item.partId, name: item.name, brand: item.brand || 'Unbranded', cat: item.category || 'other', launch: '' }));
  const unique = new Map([...PARTS, ...extras].map((part) => [part.id, part]));
  return [...unique.values()].sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
}

function fillPCSelects() {
  const parts = buildPartList();
  const category = $('pc-tracker-category');
  const previousCategory = category.value;
  category.replaceChildren(new Option('All categories', 'all'));
  const categories = [...new Map([...CATEGORIES, ...parts.map((part) => [part.cat, part.cat])].map(([id, label]) => [id, label]))];
  categories.forEach(([id, label]) => category.add(new Option(label, id)));
  if ([...category.options].some((option) => option.value === previousCategory)) category.value = previousCategory;
  const filterParts = () => {
    const picker = $('pc-tracker-part');
    const previous = state.selectedPcPart || picker.value;
    const filtered = parts.filter((part) => category.value === 'all' || part.cat === category.value);
    picker.replaceChildren(...filtered.map((part) => new Option(`${part.brand} · ${part.name}`, part.id)));
    if (filtered.some((part) => part.id === previous)) picker.value = previous;
    else picker.selectedIndex = 0;
    state.selectedPcPart = picker.value;
    const formPicker = $('pc-observation-part');
    const oldFormValue = formPicker.value;
    formPicker.replaceChildren(...parts.map((part) => new Option(`${part.brand} · ${part.name}`, part.id)));
    if (parts.some((part) => part.id === oldFormValue)) formPicker.value = oldFormValue;
    renderPC();
  };
  category.onchange = filterParts;
  $('pc-tracker-part').onchange = () => { state.selectedPcPart = $('pc-tracker-part').value; void loadPCHistory(); };
  filterParts();
}

function partById(id) { return buildPartList().find((part) => part.id === id); }

function feedStatusMarkup(status, intervalLabel) {
  const feedSummary = status?.feeds?.length
    ? status.feeds.map((feed) => `${feed.name}: ${feed.ok === true ? 'last check succeeded' : feed.ok === false ? `last check failed${feed.error ? ` — ${feed.error}` : ''}` : 'not checked yet'}${feed.lastSuccessAt ? ` · last successful check ${displayDate(feed.lastSuccessAt)}` : ''}`).join(' | ')
    : 'No live feeds configured. Manual source-attributed records and JSON import remain available.';
  const checked = status?.lastRefreshAt ? `Last refresh attempt ${displayDate(status.lastRefreshAt)}.` : 'No refresh attempt yet.';
  const next = status?.nextRefreshAt ? ` Next scheduled check ${displayDate(status.nextRefreshAt)}.` : '';
  return `${feedSummary} ${checked}${next} Refresh interval: ${intervalLabel}.`;
}

function setStatus(id, text, error = false) {
  const element = $(id);
  element.textContent = text;
  element.dataset.state = error ? 'error' : '';
}

function recordLink(record) {
  if (!record.sourceUrl) return null;
  const link = node('a', '', record.source || 'Source');
  link.href = record.sourceUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.referrerPolicy = 'no-referrer';
  return link;
}

function renderMetric(container, label, value, note = '') {
  const card = node('div', 'tracker-metric');
  card.append(node('span', '', label), node('b', '', value), node('small', '', note));
  container.append(card);
}

function renderPC() {
  const part = partById($('pc-tracker-part').value);
  const condition = $('pc-tracker-condition').value;
  const matching = state.pcHistory.filter((record) => record.condition === condition);
  const metrics = $('pc-tracker-metrics');
  metrics.replaceChildren();
  const recent = summarizeCurrentPrices(state.pcHistory, { partId: part?.id, condition, maxAgeMs: 30 * 86_400_000 });
  if (condition === 'free') {
    renderMetric(metrics, 'FREE LISTINGS · LAST 30 DAYS', String(recent.count), `${recent.sources.length} source(s)`);
    renderMetric(metrics, 'LATEST FREE OBSERVATION', recent.lastObservedAt ? displayDate(recent.lastObservedAt) : 'No recent data', 'Zero-price listing, not a paid-price estimate');
    const paidNew = summarizeCurrentPrices(state.pcHistory, { partId: part?.id, condition: 'new', maxAgeMs: 30 * 86_400_000 });
    const paidUsed = summarizeCurrentPrices(state.pcHistory, { partId: part?.id, condition: 'used', maxAgeMs: 30 * 86_400_000 });
    renderMetric(metrics, 'NEW PAID LISTINGS · LAST 30 DAYS', String(paidNew.count), paidNew.medianINR == null ? 'No recent verified price' : `Median ${money(paidNew.medianINR)}`);
    renderMetric(metrics, 'USED PAID LISTINGS · LAST 30 DAYS', String(paidUsed.count), paidUsed.medianINR == null ? 'No recent verified price' : `Median ${money(paidUsed.medianINR)}`);
  } else {
    renderMetric(metrics, 'BEST MATCH · LAST 30 DAYS', recent.bestListing ? money(recent.minINR) : 'No recent data', recent.bestListing ? `${recent.bestListing.source} · ${recent.count} listing(s)` : 'No verified current-price quote');
    renderMetric(metrics, 'MEDIAN · LAST 30 DAYS', recent.medianINR == null ? 'Not available' : money(recent.medianINR), `${recent.count} distinct listings`);
    renderMetric(metrics, 'AVERAGE · LAST 30 DAYS', recent.averageINR == null ? 'Not available' : money(recent.averageINR), `From ${recent.sources.length} source(s)`);
    renderMetric(metrics, 'LATEST OBSERVATION', recent.lastObservedAt ? displayDate(recent.lastObservedAt) : 'No recent data', 'Listings older than 30 days are excluded from current comparisons');
  }
  const comparison = $('pc-tracker-comparison');
  comparison.replaceChildren();
  const newStats = summarizeCurrentPrices(state.pcHistory, { partId: part?.id, condition: 'new', maxAgeMs: 30 * 86_400_000 });
  const usedStats = summarizeCurrentPrices(state.pcHistory, { partId: part?.id, condition: 'used', maxAgeMs: 30 * 86_400_000 });
  if (newStats.medianINR && usedStats.medianINR) {
    const difference = ((newStats.medianINR - usedStats.medianINR) / newStats.medianINR) * 100;
    comparison.textContent = `Observed new-vs-used comparison over the last 30 days: the used-listing median is ${pct(difference)} lower than the new-listing median (${money(usedStats.medianINR)} vs ${money(newStats.medianINR)}). Samples: ${usedStats.count} used and ${newStats.count} new listings. Listings are not guaranteed equivalent in condition, warranty, seller quality, or shipping.`;
  } else {
    comparison.textContent = 'New-vs-used median comparison needs recent observations for both conditions. No current value is inferred from launch prices or modeled curves.';
  }
  if (recent.bestListing) {
    const detail = node('span', '', ` Best match: ${money(recent.minINR)} at ${recent.bestListing.source}.`);
    const link = recordLink(recent.bestListing);
    if (link) detail.append(' ', link);
    comparison.append(detail);
  }
  const listingRoot = $('pc-tracker-listings');
  listingRoot.replaceChildren();
  matching.slice().sort((a, b) => b.observedAt.localeCompare(a.observedAt)).slice(0, 20).forEach((record) => {
    const row = node('div', 'tracker-observation-row');
    row.append(node('b', '', condition === 'free' ? 'Free listing' : money(record.priceINR)));
    row.append(node('span', '', displayDate(record.observedAt)));
    const source = node('small', '', `${record.condition} · ${record.source} · ${record.availability || 'availability not stated'}`);
    const link = recordLink(record);
    if (link) source.append(' · ', link);
    row.append(source);
    listingRoot.append(row);
  });
  if (!matching.length) listingRoot.append(node('p', 'empty-state', 'No observations for this product and condition yet.'));
  const partLaunchYear = part?.launch ? Number(part.launch.slice(0, 4)) : null;
  const years = summarizePriceYears(state.pcHistory, { partId: part?.id, condition, launchYear: partLaunchYear });
  const yearRoot = $('pc-tracker-years');
  yearRoot.replaceChildren();
  years.forEach((year) => {
    const card = node('div', 'tracker-year');
    card.dataset.state = year.status;
    card.append(node('b', '', year.year));
    let text = year.status === 'observed' ? condition === 'free'
      ? `${year.count} free listing(s) observed`
      : `${money(year.minINR)}–${money(year.maxINR)} observed`
      : year.status === 'not-released' ? 'Not released'
        : 'No verified data';
    card.append(node('span', '', text));
    if (year.status === 'observed') card.append(node('small', '', `${year.count} record(s) · ${year.sources.join(', ')}`));
    yearRoot.append(card);
  });
  const forecastRoot = $('pc-tracker-forecast');
  forecastRoot.replaceChildren();
  if (condition === 'free') {
    forecastRoot.append(node('p', 'empty-state', 'A numeric forecast is not meaningful for free listings.'));
  } else {
    const forecast = forecastObservedPrice(matching, { partId: part?.id, condition, targetYears: [2027, 2028] });
    if (!forecast.available) forecastRoot.append(node('p', 'empty-state', `No forecast shown. ${forecast.reason}`));
    else {
      forecastRoot.append(node('p', 'empty-state', `${forecast.method}. Uses ${forecast.observationCount} dated listing observations from ${forecast.observedYears.join(', ')}; ${forecast.caveat}`));
      forecast.forecasts.forEach((item) => {
        const card = node('article', 'tracker-forecast-card');
        card.append(node('b', '', `${item.year} · estimate, not a quote`), node('strong', '', money(item.estimateINR)));
        card.append(node('span', '', `Heuristic range ${money(item.lowINR)}–${money(item.highINR)} · approximate uncertainty ±${item.uncertaintyPercent.toFixed(0)}% · ${item.observationCount} records`));
        forecastRoot.append(card);
      });
    }
  }
}

async function loadPCHistory() {
  const partId = $('pc-tracker-part').value;
  if (!partId) return;
  try {
    const result = await api(`/api/pc-prices/history?partId=${encodeURIComponent(partId)}`);
    state.pcHistory = result.observations || [];
    renderPC();
  } catch (error) { setStatus('pc-tracker-status', error.message, true); }
}

function latestFunds() { return state.marketStatus?.latestFunds || []; }
function instrumentKey(record) { return escapeKey([record.instrumentId, record.valueType, record.source]); }

function fillFundSelect() {
  const select = $('fund-tracker-instrument');
  const previous = state.selectedFund || select.value;
  select.replaceChildren();
  latestFunds().forEach((record) => {
    const measure = record.valueType === 'nav' ? 'NAV' : 'Index level';
    select.add(new Option(`${record.name} · ${measure} · ${record.source}`, instrumentKey(record)));
  });
  state.selectedFund = [...select.options].some((option) => option.value === previous) ? previous : select.options[0]?.value || '';
  select.value = state.selectedFund;
  select.onchange = () => { state.selectedFund = select.value; void loadFundHistory(); };
  void loadFundHistory();
}

function trailingReturn(records, days) {
  if (records.length < 2) return null;
  const latest = records.at(-1);
  const latestAt = Date.parse(latest.observedAt);
  const cutoff = latestAt - days * 86_400_000;
  const baseline = records.filter((record) => Date.parse(record.observedAt) <= cutoff).at(-1);
  if (!baseline || latestAt - Date.parse(baseline.observedAt) > (days + 45) * 86_400_000 || Number(baseline.value) <= 0) return null;
  return ((Number(latest.value) / Number(baseline.value)) - 1) * 100;
}

function renderFundHistory() {
  const select = $('fund-tracker-instrument');
  const chosen = latestFunds().find((record) => instrumentKey(record) === select.value);
  const records = state.fundHistory.filter((record) => chosen && record.source === chosen.source && record.valueType === chosen.valueType)
    .slice().sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const metrics = $('fund-tracker-metrics');
  metrics.replaceChildren();
  if (!chosen || !records.length) {
    metrics.append(node('p', 'empty-state', 'No sourced index/fund observations yet. Configure an authorized feed or add/import a dated record.'));
    $('fund-tracker-history').replaceChildren();
    renderFundComparisons();
    return;
  }
  const latest = records.at(-1);
  const current = latest.valueType === 'nav' ? money(latest.value) : `${Number(latest.value).toLocaleString('en-IN')} ${latest.unit || 'points'}`;
  const oneYear = trailingReturn(records, 365);
  const sinceFirst = records.length > 1 && Number(records[0].value) > 0 ? (Number(latest.value) / Number(records[0].value) - 1) * 100 : null;
  renderMetric(metrics, latest.valueType === 'nav' ? 'LATEST NAV' : 'LATEST INDEX LEVEL', current, `Observed ${displayDate(latest.observedAt)}`);
  renderMetric(metrics, 'CHECKED BY VESPER', displayDate(latest.checkedAt), `Source: ${latest.source}`);
  renderMetric(metrics, 'OBSERVED 1-YEAR VALUE CHANGE', oneYear == null ? 'Not enough dated data' : pct(oneYear), 'Matched value change; not a guaranteed return');
  renderMetric(metrics, 'VALUE CHANGE ACROSS AVAILABLE HISTORY', sinceFirst == null ? 'Not enough dated data' : pct(sinceFirst), `${records.length} dated observations; fund NAV change excludes distributions`);
  const returnNote = latest.valueType === 'nav'
    ? 'NAV value change only; cash distributions are excluded.'
    : `Index basis: ${latest.returnBasis || 'not stated'}; price-index changes do not include dividends.`;
  metrics.append(node('p', 'tracker-comparison', returnNote));
  const history = $('fund-tracker-history');
  history.replaceChildren();
  records.slice().reverse().slice(0, 30).forEach((record) => {
    const row = node('div', 'tracker-observation-row');
    row.append(node('b', '', record.valueType === 'nav' ? money(record.value) : `${Number(record.value).toLocaleString('en-IN')} ${record.unit}`));
    row.append(node('span', '', displayDate(record.observedAt)));
    const source = node('small', '', `${record.source} · checked ${displayDate(record.checkedAt)}${record.publishedAt ? ` · published ${displayDate(record.publishedAt)}` : ''}`);
    const link = recordLink(record);
    if (link) source.append(' · ', link);
    row.append(source);
    history.append(row);
  });
  renderFundComparisons();
}

function renderFundComparisons() {
  const target = $('fund-tracker-comparisons');
  if (!target) return;
  target.replaceChildren();
  const summary = node('div', 'loan-offer-grid');
  const selected = $('fund-tracker-instrument')?.value || '';
  const instruments = latestFunds().filter((record) => record.valueType === 'nav' || record.valueType === 'index-level');
  if (!instruments.length) {
    target.append(node('p', 'empty-state', 'Cross-instrument comparisons appear after sourced observations are added.'));
    return;
  }
  instruments.forEach((record) => {
    const card = node('article', 'loan-offer-card');
    const sameSource = state.fundHistory.filter((entry) => entry.instrumentId === record.instrumentId && entry.source === record.source && entry.valueType === record.valueType)
      .slice().sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const oneYear = trailingReturn(sameSource, 365);
    card.append(node('b', '', `${record.name} · ${record.valueType === 'nav' ? 'NAV' : 'index level'}`));
    card.append(node('strong', '', record.valueType === 'nav' ? money(record.value) : `${Number(record.value).toLocaleString('en-IN')} ${record.unit || 'points'}`));
    card.append(node('span', '', `1-year observed value change: ${oneYear == null ? 'not enough dated observations' : pct(oneYear)}`));
    card.append(node('small', '', `${record.source} · as of ${displayDate(record.observedAt)}${selected === instrumentKey(record) ? ' · selected' : ''}`));
    summary.append(card);
  });
  target.append(summary);
}

async function loadFundHistory() {
  const select = $('fund-tracker-instrument');
  const chosen = latestFunds().find((record) => instrumentKey(record) === select.value);
  if (!chosen) { state.fundHistory = []; renderFundHistory(); return; }
  try {
    const result = await api(`/api/money-tracker/history?type=fund&instrumentId=${encodeURIComponent(chosen.instrumentId)}`);
    state.fundHistory = result.observations || [];
    renderFundHistory();
  } catch (error) { setStatus('fund-tracker-status', error.message, true); }
}

function selectedLoans() { return state.marketStatus?.latestLoans || []; }
function loanKey(record) { return escapeKey([record.id]); }

function renderStress() {
  const root = $('stress-market-dashboard');
  root.replaceChildren();
  const sources = state.marketStatus?.latestStress || [];
  const markets = [
    ['india', 'India'],
    ['global', 'Global'],
    ['reference-2008', 'Historical 2008 reference'],
  ];
  markets.forEach(([market, label]) => {
    const records = state.stressHistory.length
      ? state.stressHistory.filter((record) => record.market === market)
      : sources.filter((record) => record.market === market);
    const summary = summarizeMarketStress(records, { market });
    const card = node('section', 'stress-market-card');
    card.append(node('h4', '', label));
    if (summary.score == null) {
      card.append(node('p', 'empty-state', market === 'reference-2008'
        ? 'Unavailable. Add source-dated, comparable historical indicators before making a reference panel.'
        : 'Unavailable. No configured or manually recorded source indicators are available.'));
    } else {
      const overview = node('div', 'stress-overview');
      overview.append(node('strong', '', `${summary.score.toFixed(1)} / 100`));
      const meter = node('span', 'stress-meter');
      meter.setAttribute('role', 'img');
      meter.setAttribute('aria-label', `Normalized observed stress score ${summary.score.toFixed(1)} out of 100; not a crash probability`);
      meter.style.setProperty('--stress-score', `${summary.score}%`);
      const fill = node('i');
      meter.append(fill);
      overview.append(meter);
      card.append(overview);
      card.append(node('p', 'stress-coverage', `${summary.indicatorCount} indicator(s) · ${summary.categoryCount} of 7 categories · ${summary.coveragePercent}% category coverage${summary.staleIndicatorCount ? ` · ${summary.staleIndicatorCount} stale indicator(s)` : ''}`));
      card.append(node('small', 'stress-coverage', `Latest indicator observed ${displayDate(summary.latestObservedAt)}. ${summary.aggregation}`));
      const categories = node('div', 'stress-category-list');
      summary.categories.forEach((item) => {
        const row = node('div', 'stress-category-row');
        row.append(node('span', '', item.category));
        const bar = node('span', 'stress-category-meter');
        bar.style.setProperty('--stress-score', `${item.score}%`);
        bar.append(node('i'));
        row.append(bar, node('b', '', item.score.toFixed(1)));
        categories.append(row);
      });
      card.append(categories);
      const indicators = node('div', 'stress-indicator-list');
      summary.indicators.slice(0, 12).forEach((record) => {
        const row = node('div', 'stress-indicator-row');
        row.append(node('b', '', `${record.name} · ${record.stressScore}/100 stress`));
        row.append(node('span', '', `${record.value} ${record.unit}`));
        const method = node('small', '', `${record.category} · ${record.source} · observed ${displayDate(record.observedAt)} · checked ${displayDate(record.checkedAt)} · normalization: ${record.scoreMethod}`);
        const link = recordLink(record);
        if (link) method.append(' · ', link);
        row.append(method);
        indicators.append(row);
      });
      card.append(indicators);
    }
    root.append(card);
  });
}

async function loadStressHistory() {
  try {
    const results = await Promise.all(['india', 'global', 'reference-2008'].map((market) =>
      api(`/api/market-stress/history?market=${encodeURIComponent(market)}&limit=2000`)));
    state.stressHistory = results.flatMap((result) => result.observations || []);
    renderStress();
  } catch (error) { setStatus('stress-tracker-status', error.message, true); }
}

function renderLoans() {
  const list = $('loan-tracker-list');
  list.replaceChildren();
  const offers = selectedLoans();
  const selector = $('emi-source-offer');
  const previous = state.selectedLoan || selector.value;
  selector.replaceChildren(new Option('Manual user-input rate', ''));
  offers.forEach((offer) => {
    const minRate = offer.annualRateMinPercent ?? offer.annualRatePercent;
    const maxRate = offer.annualRateMaxPercent ?? minRate;
    const range = minRate === maxRate ? `${minRate}%` : `${minRate}–${maxRate}%`;
    selector.add(new Option(`${offer.lender}${offer.productName ? ` · ${offer.productName}` : ''} · ${range} · ${offer.source}`, loanKey(offer)));
  });
  state.selectedLoan = [...selector.options].some((option) => option.value === previous) ? previous : '';
  selector.value = state.selectedLoan;
  selector.onchange = () => {
    const chosen = offers.find((offer) => loanKey(offer) === selector.value);
    state.selectedLoan = selector.value;
    if (!chosen) return;
    $('emi-rate').value = chosen.annualRateMinPercent ?? chosen.annualRatePercent;
    $('emi-fee-percent').value = chosen.processingFeePercent ?? '';
    $('emi-fee-amount').value = chosen.processingFeeINR ?? '';
    calculateAndRenderEMI();
    void loadLoanHistory();
  };
  if (!offers.length) list.append(node('p', 'empty-state', 'No lender snapshots yet. Add cited published terms or configure an authorized source feed.'));
  const grid = node('div', 'loan-offer-grid');
  offers.forEach((offer) => {
    const card = node('article', 'loan-offer-card');
    const loanName = offer.loanType === 'lap' ? 'Loan against property' : 'Home loan';
    const minRate = offer.annualRateMinPercent ?? offer.annualRatePercent;
    const maxRate = offer.annualRateMaxPercent ?? minRate;
    card.append(node('b', '', `${offer.lender}${offer.productName ? ` · ${offer.productName}` : ''} · ${loanName}`),
      node('strong', '', minRate === maxRate ? `${minRate}% annual published rate` : `${minRate}–${maxRate}% published rate range`));
    const terms = [];
    if (offer.processingFeePercent != null) terms.push(`Processing fee ${offer.processingFeePercent}%`);
    if (offer.processingFeeINR != null) terms.push(`Processing fee ${money(offer.processingFeeINR)}`);
    if (offer.minTenureMonths != null || offer.maxTenureMonths != null) terms.push(`Tenure ${offer.minTenureMonths ?? 'not stated'}–${offer.maxTenureMonths ?? 'not stated'} months`);
    if (offer.maxLtvPercent != null) terms.push(`Maximum LTV ${offer.maxLtvPercent}%`);
    card.append(node('span', '', terms.join(' · ') || 'Fees, tenure, and LTV were not published in this record; confirm with lender.'));
    if (offer.eligibility) card.append(node('small', '', `Eligibility: ${offer.eligibility}`));
    if (offer.terms) card.append(node('small', '', offer.terms));
    const source = node('small', '', `${offer.source} · checked ${displayDate(offer.checkedAt)}${offer.publishedAt ? ` · published ${displayDate(offer.publishedAt, false)}` : ' · publication date not stated'}`);
    const link = recordLink(offer);
    if (link) source.append(' · ', link);
    card.append(source);
    grid.append(card);
  });
  if (offers.length) list.append(grid);
  void loadLoanHistory();
}

async function loadLoanHistory() {
  const target = $('loan-tracker-history');
  const offer = selectedLoans().find((item) => loanKey(item) === $('emi-source-offer').value);
  target.replaceChildren();
  if (!offer) return;
  try {
    const key = `${offer.lender}|${offer.loanType}|${offer.productName || ''}`;
    const result = await api(`/api/money-tracker/history?type=loan&instrumentId=${encodeURIComponent(key)}`);
    state.loanHistory = result.observations || [];
    state.loanHistory.slice(0, 20).forEach((record) => {
      const row = node('div', 'tracker-observation-row');
      const low = record.annualRateMinPercent ?? record.annualRatePercent;
      const high = record.annualRateMaxPercent ?? low;
      row.append(node('b', '', low === high ? `${low}%` : `${low}–${high}%`));
      row.append(node('span', '', `Checked ${displayDate(record.checkedAt)}`));
      const source = node('small', '', `${record.lender} · ${record.loanType === 'lap' ? 'LAP' : 'home loan'}${record.publishedAt ? ` · published ${displayDate(record.publishedAt, false)}` : ' · publication date not stated'} · ${record.source}`);
      const link = recordLink(record);
      if (link) source.append(' · ', link);
      row.append(source);
      target.append(row);
    });
  } catch (error) { setStatus('loan-tracker-status', error.message, true); }
}

function calculateAndRenderEMI() {
  const target = $('emi-calculator-result');
  try {
    const feePercent = $('emi-fee-percent').value.trim();
    const feeAmount = $('emi-fee-amount').value.trim();
    const result = calculateEmi({
      principal: Number($('emi-principal').value),
      annualRatePercent: Number($('emi-rate').value),
      tenureMonths: Number($('emi-months').value),
      processingFeePercent: feePercent === '' ? null : Number(feePercent),
      processingFeeINR: feeAmount === '' ? null : Number(feeAmount),
    });
    target.replaceChildren();
    const grid = node('div', 'tracker-calculation-grid');
    [
      ['Estimated monthly EMI', money(result.emiINR)],
      ['Total scheduled payments', money(result.scheduledPaymentsINR)],
      ['Estimated interest', money(result.interestINR)],
      ['Processing fee', result.processingFeeINR == null ? 'Not included; not supplied' : money(result.processingFeeINR)],
      ['Total plus known fee', result.totalWithKnownFeeINR == null ? 'Unavailable without fee' : money(result.totalWithKnownFeeINR)],
      ['Input rate', `${Number($('emi-rate').value).toFixed(2)}% · ${$('emi-source-offer').value ? 'lower bound copied from cited lender snapshot' : 'user-entered assumption'}`],
    ].forEach(([label, value]) => { const item = node('span'); item.append(node('span', '', label), node('b', '', value)); grid.append(item); });
    target.append(grid, node('p', 'planner-footnote', result.assumptions));
    const selectedOffer = selectedLoans().find((offer) => loanKey(offer) === $('emi-source-offer').value);
    if (selectedOffer && (selectedOffer.annualRateMaxPercent ?? selectedOffer.annualRatePercent) > (selectedOffer.annualRateMinPercent ?? selectedOffer.annualRatePercent)) {
      target.append(node('p', 'planner-footnote', `The lender source publishes a range of ${selectedOffer.annualRateMinPercent}–${selectedOffer.annualRateMaxPercent}% p.a. This calculation uses only the lower bound; eligibility and final pricing may differ.`));
    }
  } catch (error) { target.textContent = error.message; }
}

function isoFromLocalInput(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Enter a valid date and time.');
  return date.toISOString();
}

async function loadStatuses() {
  const [pcResult, marketResult] = await Promise.allSettled([api('/api/pc-prices'), api('/api/money-tracker')]);
  if (pcResult.status === 'fulfilled') {
    state.pcStatus = pcResult.value;
    setStatus('pc-tracker-status', feedStatusMarkup(state.pcStatus, 'every 3 hours'));
    fillPCSelects();
    void loadPCHistory();
  } else setStatus('pc-tracker-status', pcResult.reason.message, true);
  if (marketResult.status === 'fulfilled') {
    state.marketStatus = marketResult.value;
    setStatus('fund-tracker-status', feedStatusMarkup(state.marketStatus.funds, 'hourly checks; NAV usually daily on business days'));
    setStatus('loan-tracker-status', feedStatusMarkup(state.marketStatus.loans, 'every 48 hours'));
    setStatus('stress-tracker-status', feedStatusMarkup(state.marketStatus.stress, 'every 2 hours; source observations may update less often'));
    fillFundSelect();
    renderLoans();
    renderStress();
    void loadStressHistory();
  } else {
    setStatus('fund-tracker-status', marketResult.reason.message, true);
    setStatus('loan-tracker-status', marketResult.reason.message, true);
    setStatus('stress-tracker-status', marketResult.reason.message, true);
  }
}

async function importFile(input, type) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Import file must be smaller than 2 MB.');
    const parsed = JSON.parse(await file.text());
    const records = Array.isArray(parsed) ? parsed : parsed.observations;
    if (!Array.isArray(records)) throw new Error('JSON must be an array or an object with an observations array.');
    const path = type === 'pc' ? '/api/pc-prices/observations' : '/api/money-tracker/observations';
    const body = type === 'pc' ? { observations: records } : { type, observations: records };
    const count = await saveRecords(type === 'stress' ? '/api/market-stress/observations' : path, body);
    setStatus(type === 'pc' ? 'pc-tracker-status' : `${type}-tracker-status`, `Imported ${count} source-attributed record(s).`);
    await loadStatuses();
    if (type === 'pc') await loadPCHistory();
    if (type === 'fund') await loadFundHistory();
    if (type === 'stress') await loadStressHistory();
  } catch (error) {
    setStatus(type === 'pc' ? 'pc-tracker-status' : `${type}-tracker-status`, `Import failed: ${error.message}`, true);
  } finally { input.value = ''; }
}

function downloadJson(filename, data) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' }));
  const link = node('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportHistory(type) {
  try {
    if (type === 'pc') {
      const partId = $('pc-tracker-part').value;
      const result = await api(`/api/pc-prices/history?partId=${encodeURIComponent(partId)}&condition=${encodeURIComponent($('pc-tracker-condition').value)}`);
      downloadJson(`vesper-pc-prices-${partId}-${$('pc-tracker-condition').value}.json`, { schemaVersion: 1, type: 'pc-price-observations', observations: result.observations });
    } else if (type === 'fund') {
      const selected = latestFunds().find((record) => instrumentKey(record) === $('fund-tracker-instrument').value);
      if (!selected) throw new Error('Choose a fund or index with observations first.');
      const result = await api(`/api/money-tracker/history?type=fund&instrumentId=${encodeURIComponent(selected.instrumentId)}`);
      const observations = result.observations.filter((record) => record.source === selected.source && record.valueType === selected.valueType);
      downloadJson(`vesper-india-market-${selected.instrumentId}.json`, { schemaVersion: 1, type: 'fund', observations });
    } else if (type === 'loan') {
      const lender = selectedLoans().find((offer) => loanKey(offer) === $('emi-source-offer').value);
      if (!lender) throw new Error('Choose a lender snapshot first.');
      const history = await api(`/api/money-tracker/history?type=loan&instrumentId=${encodeURIComponent(`${lender.lender}|${lender.loanType}|${lender.productName || ''}`)}`);
      downloadJson(`vesper-loan-${lender.lender.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, { schemaVersion: 1, type: 'loan', observations: history.observations });
    } else {
      const results = await Promise.all(['india', 'global', 'reference-2008'].map((market) =>
        api(`/api/market-stress/history?market=${encodeURIComponent(market)}&limit=100000`)));
      downloadJson('vesper-market-stress-history.json', {
        schemaVersion: 1,
        type: 'stress',
        observations: results.flatMap((result) => result.observations || []),
      });
    }
  } catch (error) {
    setStatus(type === 'pc' ? 'pc-tracker-status' : `${type}-tracker-status`, `Export failed: ${error.message}`, true);
  }
}

function bindTrackerTabs() {
  const buttons = [...document.querySelectorAll('[data-tracker-tab]')];
  buttons.forEach((button, index) => button.addEventListener('click', () => {
    buttons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-tracker-view]').forEach((panel) => {
      const active = panel.dataset.trackerView === button.dataset.trackerTab;
      panel.classList.toggle('is-visible', active);
      panel.hidden = !active;
    });
  }));
  buttons.forEach((button, index) => button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  }));
}

function onSubmit(id, handler) {
  $(id).addEventListener('submit', (event) => {
    event.preventDefault();
    void handler().catch((error) => {
      const type = id.startsWith('pc-') ? 'pc' : id.startsWith('fund-') ? 'fund' : id.startsWith('stress-') ? 'stress' : 'loan';
      setStatus(type === 'pc' ? 'pc-tracker-status' : `${type}-tracker-status`, error.message, true);
    });
  });
}

function bindPC() {
  $('pc-tracker-condition').onchange = renderPC;
  $('pc-observation-condition').onchange = () => {
    const free = $('pc-observation-condition').value === 'free';
    $('pc-observation-price').value = free ? '0' : '';
    $('pc-observation-price').readOnly = free;
    $('pc-observation-price').min = free ? '0' : '0.01';
  };
  $('pc-observation-date').value = localDate();
  onSubmit('pc-tracker-observation-form', async () => {
    const condition = $('pc-observation-condition').value;
    const observedAt = isoDayAtNoon($('pc-observation-date').value);
    const part = partById($('pc-observation-part').value);
    await saveRecords('/api/pc-prices/observations', { observations: [{
      partId: part.id, name: part.name, brand: part.brand, category: part.cat,
      condition, priceINR: condition === 'free' ? 0 : Number($('pc-observation-price').value),
      source: $('pc-observation-source').value.trim(), sourceUrl: $('pc-observation-url').value.trim(),
      listingId: $('pc-observation-url').value.trim() || `${$('pc-observation-source').value.trim()}-${part.id}-${condition}`,
      observedAt,
    }] });
    $('pc-tracker-observation-form').reset();
    $('pc-observation-date').value = localDate();
    $('pc-observation-price').readOnly = false;
    await loadStatuses();
    await loadPCHistory();
  });
  $('pc-tracker-import').onchange = () => void importFile($('pc-tracker-import'), 'pc');
  $('pc-tracker-export').onclick = () => void exportHistory('pc');
}

function bindFunds() {
  $('fund-observation-date').value = `${localDate()}T12:00`;
  onSubmit('fund-tracker-observation-form', async () => {
    const instrumentType = $('fund-observation-type').value;
    const valueType = instrumentType === 'index' ? 'index-level' : 'nav';
    const record = {
      instrumentId: $('fund-observation-id').value.trim(), name: $('fund-observation-name').value.trim(),
      instrumentType, valueType, value: Number($('fund-observation-value').value),
      ...(instrumentType === 'index' ? { returnBasis: $('fund-observation-basis').value } : {}),
      ...(valueType === 'nav' ? { currency: 'INR' } : { unit: 'points' }),
      source: $('fund-observation-source').value.trim(), sourceUrl: $('fund-observation-url').value.trim(),
      observedAt: isoFromLocalInput($('fund-observation-date').value),
      publishedAt: isoFromLocalInput($('fund-observation-published').value),
    };
    await saveRecords('/api/money-tracker/observations', { type: 'fund', observations: [record] });
    $('fund-tracker-observation-form').reset();
    $('fund-observation-date').value = `${localDate()}T12:00`;
    await loadStatuses();
    await loadFundHistory();
  });
  $('fund-tracker-import').onchange = () => void importFile($('fund-tracker-import'), 'fund');
  $('fund-tracker-export').onclick = () => void exportHistory('fund');
}

function bindStress() {
  $('stress-observation-date').value = `${localDate()}T12:00`;
  onSubmit('stress-tracker-observation-form', async () => {
    const record = {
      market: $('stress-observation-market').value,
      category: $('stress-observation-category').value,
      indicatorId: $('stress-observation-id').value.trim(),
      name: $('stress-observation-name').value.trim(),
      value: Number($('stress-observation-value').value),
      unit: $('stress-observation-unit').value.trim(),
      stressScore: Number($('stress-observation-score').value),
      scoreMethod: $('stress-observation-method').value.trim(),
      observedAt: isoFromLocalInput($('stress-observation-date').value),
      source: $('stress-observation-source').value.trim(),
      sourceUrl: $('stress-observation-url').value.trim(),
    };
    await saveRecords('/api/market-stress/observations', { observations: [record] });
    $('stress-tracker-observation-form').reset();
    $('stress-observation-date').value = `${localDate()}T12:00`;
    await loadStatuses();
    await loadStressHistory();
  });
  $('stress-tracker-import').onchange = () => void importFile($('stress-tracker-import'), 'stress');
  $('stress-tracker-export').onclick = () => void exportHistory('stress');
}

function bindLoans() {
  onSubmit('emi-calculator-form', async () => calculateAndRenderEMI());
  onSubmit('loan-tracker-observation-form', async () => {
    const optionalNumber = (id) => $(id).value.trim() === '' ? null : Number($(id).value);
    const record = {
      lender: $('loan-observation-lender').value.trim(),
      productName: $('loan-observation-product').value.trim(),
      loanType: $('loan-observation-type').value,
      annualRatePercent: Number($('loan-observation-rate').value),
      annualRateMaxPercent: optionalNumber('loan-observation-rate-max'),
      processingFeePercent: optionalNumber('loan-observation-fee-percent'),
      processingFeeINR: optionalNumber('loan-observation-fee-amount'),
      minTenureMonths: optionalNumber('loan-observation-min-tenure'),
      maxTenureMonths: optionalNumber('loan-observation-max-tenure'),
      maxLtvPercent: optionalNumber('loan-observation-ltv'),
      publishedAt: $('loan-observation-published').value ? isoDayAtNoon($('loan-observation-published').value) : undefined,
      source: $('loan-observation-source').value.trim(),
      sourceUrl: $('loan-observation-url').value.trim(),
      eligibility: $('loan-observation-eligibility').value.trim(),
      terms: $('loan-observation-terms').value.trim(),
    };
    await saveRecords('/api/money-tracker/observations', { type: 'loan', observations: [record] });
    $('loan-tracker-observation-form').reset();
    await loadStatuses();
  });
  $('loan-tracker-import').onchange = () => void importFile($('loan-tracker-import'), 'loan');
  $('loan-tracker-export').onclick = () => void exportHistory('loan');
}

async function manualRefresh(type, button) {
  const oldLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'CHECKING…';
  try {
    const path = type === 'pc' ? '/api/pc-prices/refresh' : type === 'stress'
      ? '/api/market-stress/refresh' : `/api/money-tracker/refresh?type=${encodeURIComponent(type)}`;
    const result = await api(path, { method: 'POST' });
    await loadStatuses();
    if (type === 'pc') await loadPCHistory();
    if (type === 'fund') await loadFundHistory();
    if (type === 'stress') await loadStressHistory();
    setStatus(type === 'pc' ? 'pc-tracker-status' : `${type}-tracker-status`, result.message || 'Feed check finished.', !result.ok);
  } catch (error) { setStatus(type === 'pc' ? 'pc-tracker-status' : `${type}-tracker-status`, error.message, true); }
  finally { button.disabled = false; button.textContent = oldLabel; }
}

function bindRefresh() {
  document.querySelectorAll('[data-refresh-tracker]').forEach((button) => {
    button.addEventListener('click', () => void manualRefresh(button.dataset.refreshTracker, button));
  });
}

async function initializeMoneyTrackers() {
  bindTrackerTabs();
  bindPC();
  bindFunds();
  bindLoans();
  bindStress();
  bindRefresh();
  await loadStatuses();
}

initializeMoneyTrackers().catch((error) => {
  console.error('Market trackers could not initialize:', error);
  ['pc-tracker-status', 'fund-tracker-status', 'loan-tracker-status'].forEach((id) => setStatus(id, error.message, true));
});
