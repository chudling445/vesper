import { appStore } from './persistence.js';
import { calculatePCPartCompatibility, calculateTDEEAndDeficit, calculateXirr, fetchStockTickers, initVesperDatabase } from './local-tools.js';
import { BUILD_GUIDES, COMPONENT_TYPES, INDIAN_AND_GLOBAL_BRANDS, PRICE_SOURCES, REFERENCE_PARTS, RETAILERS } from './pc-catalog.js';
import { fastingElapsedMinutes, normalizeNutritionEntry, summarizeNutritionDay } from './health-tools.mjs';

const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const currency = (value, code = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: code === 'INR' ? 0 : 2 }).format(Number(value) || 0);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = String(text); return element; };
const setText = (id, text) => { const element = $(id); if (element) element.textContent = String(text); };
const toNum = (id) => { const value = $(id)?.value.trim(); return value === '' ? null : number(value, null); };
const showStatus = (message, state = '') => { setText('planner-save-status', message); $('planner-save-status')?.setAttribute('data-state', state); };
const savePath = (path, value) => { appStore.set(path, value); showStatus('SAVED ON THIS DEVICE', 'saved'); };

let pc = null;
let finance = null;
let health = null;
let habits = null;
let isHydrated = false;
let pcSaveTimer = 0;
let fastingTimer = 0;

function ensureState() {
  pc = clone(appStore.get('workspace.pcBuilder', { savedBuilds: [], customParts: [] }));
  pc.savedBuilds ||= []; pc.customParts ||= []; pc.currentParts ||= []; pc.currentName ||= 'My first build'; pc.currentBudget ??= 100000; pc.currentGoal ||= 'gaming';
  finance = clone(appStore.get('workspace.finance', { assets: [], quotes: {}, accounts: [], ledger: [], budgets: [], quoteEndpoint: '' }));
  finance.assets ||= []; finance.quotes ||= {}; finance.accounts ||= []; finance.ledger ||= []; finance.budgets ||= [];
  health = clone(appStore.get('workspace.health', null) || {});
  health.nutritionEntries = Array.isArray(health.nutritionEntries) ? health.nutritionEntries : [];
  health.fastingSessions = Array.isArray(health.fastingSessions) ? health.fastingSessions : [];
  health.activeFast = health.activeFast && typeof health.activeFast === 'object' ? health.activeFast : null;
  habits = clone(appStore.get('workspace.habits', { days: {}, badges: [] }));
  habits.days ||= {}; habits.badges ||= [];
}

function persistPC() { savePath('workspace.pcBuilder', pc); }
function schedulePCSave() { window.clearTimeout(pcSaveTimer); pcSaveTimer = window.setTimeout(persistPC, 300); }
function persistFinance() { savePath('workspace.finance', finance); }
function persistHabits() { savePath('workspace.habits', habits); }

function fillStaticOptions() {
  const template = $('part-template');
  template.replaceChildren(new Option('Choose a reference profile…', ''));
  REFERENCE_PARTS.forEach((part) => template.add(new Option(`${part.brand} · ${part.name}`, part.id)));
  pc.customParts.forEach((part) => template.add(new Option(`${part.brand} · ${part.name} · custom`, part.id)));
  const type = $('custom-type'); type.replaceChildren(); COMPONENT_TYPES.forEach(([value, label]) => type.add(new Option(label, value)));
  const retailer = $('custom-retailer'); retailer.replaceChildren(); RETAILERS.forEach((name) => retailer.add(new Option(name, name)));
  const brands = $('brand-options'); brands.replaceChildren(); INDIAN_AND_GLOBAL_BRANDS.forEach((brand) => brands.append(new Option(brand, brand)));
  $('asset-date').value ||= localDate(); $('ledger-date').value ||= localDate();
}

function offersFor(part) {
  if (Array.isArray(part.offers) && part.offers.length) return part.offers;
  return number(part.priceINR) > 0 ? [{ id: `legacy-${part.id}`, retailer: part.retailer || 'Other', priceINR: number(part.priceINR), recordedAt: 0 }] : [];
}
function bestOffer(part) { return offersFor(part).slice().sort((a, b) => number(a.priceINR) - number(b.priceINR))[0] || null; }
function partPrice(part) { return number(bestOffer(part)?.priceINR); }
function selectedPartsTotal() { return pc.currentParts.reduce((sum, part) => sum + Math.max(0, partPrice(part)), 0); }

function currentGuide() {
  const budget = Math.max(15000, number($('build-budget')?.value, pc.currentBudget));
  return BUILD_GUIDES.find((guide) => budget >= guide.min && budget <= guide.max) || BUILD_GUIDES[BUILD_GUIDES.length - 1];
}

function renderGuide() {
  const budget = Math.max(0, number($('build-budget')?.value, pc.currentBudget));
  const goal = $('build-goal')?.value || pc.currentGoal || 'gaming';
  const guide = currentGuide();
  const title = $('build-guide-current'); title.replaceChildren();
  title.append(node('strong', '', guide.name)); title.append(node('p', '', guide.use));
  if (goal === 'ai') title.append(node('small', 'guide-goal-note', 'AI note · prioritize VRAM and model memory needs before selecting a CPU; budget allocations are a starting point.'));
  else if (goal === 'creator') title.append(node('small', 'guide-goal-note', 'Creator note · reserve budget for RAM capacity, storage, and a GPU encoder suited to your apps.'));
  const allocations = $('build-allocation'); allocations.replaceChildren();
  for (const [label, percentage] of Object.entries(guide.split)) {
    const row = node('div', 'allocation-row');
    const copy = node('div', 'allocation-copy'); copy.append(node('span', '', label), node('b', '', `${percentage}% · ${currency(budget * percentage / 100)}`));
    const track = node('span', 'allocation-track'); const fill = node('i'); fill.style.width = `${percentage}%`; track.append(fill); row.append(copy, track); allocations.append(row);
  }
  const list = $('build-guide-list'); list.replaceChildren();
  BUILD_GUIDES.forEach((item) => {
    const button = node('button', `guide-chip${item === guide ? ' is-current' : ''}`);
    button.type = 'button'; button.textContent = item.name.split(' · ')[0]; button.setAttribute('aria-pressed', String(item === guide));
    button.addEventListener('click', () => { $('build-budget').value = Math.max(item.min, Math.min(item.max, budget)); renderGuide(); }); list.append(button);
  });
}

function retailerLink(part) {
  const source = PRICE_SOURCES.find((item) => item.name === part.retailer);
  if (!source) return node('span', 'part-source-link', 'Local quote');
  const url = source.searchUrl ? `${source.searchUrl}${encodeURIComponent(part.name)}` : source.url;
  const link = node('a', 'part-source-link', source.searchUrl ? 'Search' : 'Open store'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `${source.searchUrl ? 'Search for' : 'Open'} ${part.name} at ${source.name}`); return link;
}

function renderBuild() {
  $('build-name').value = pc.currentName; $('build-budget').value = pc.currentBudget; $('build-goal').value = pc.currentGoal;
  setText('build-title-heading', pc.currentName || 'Untitled build'); setText('build-total', currency(selectedPartsTotal()));
  const pricedParts = pc.currentParts.filter((part) => partPrice(part) > 0).length;
  const budgetDifference = number(pc.currentBudget) - selectedPartsTotal();
  setText('build-budget-status', !pricedParts ? 'Add retailer prices to see budget remaining.' : `${pricedParts}/${pc.currentParts.length} parts priced · ${budgetDifference >= 0 ? `${currency(budgetDifference)} remaining` : `${currency(Math.abs(budgetDifference))} over budget`}`);
  const list = $('build-parts-list'); list.replaceChildren();
  if (!pc.currentParts.length) list.append(node('p', 'empty-state', 'Add an offline reference profile or enter an exact SKU below.'));
  pc.currentParts.forEach((part, index) => {
    const row = node('article', 'build-part-row'); row.dataset.partIndex = index;
    const best = bestOffer(part);
    const info = node('div', 'build-part-info'); info.append(node('b', '', part.name), node('small', '', `${part.brand} · ${COMPONENT_TYPES.find(([type]) => type === part.type)?.[1] || 'Other'} · ${best ? `best recorded ${currency(best.priceINR)} at ${best.retailer}` : 'no price recorded'}`));
    const pricing = node('div', 'build-part-pricing');
    const quoteForm = node('form', 'part-quote-form'); const price = node('input', 'part-price-input'); price.type = 'number'; price.min = '0.01'; price.step = '0.01'; price.placeholder = 'Add / update price ₹'; price.setAttribute('aria-label', `Price in rupees at retailer for ${part.name}`); price.required = true;
    const retailer = node('select', 'part-retailer-select'); retailer.setAttribute('aria-label', `Retailer for ${part.name}`); RETAILERS.forEach((name) => retailer.add(new Option(name, name))); retailer.value = part.retailer || 'MDComputers';
    const record = node('button', 'part-quote-save', 'Record'); record.type = 'submit'; quoteForm.append(price, retailer, record);
    quoteForm.addEventListener('submit', (event) => { event.preventDefault(); const amount = number(price.value, 0); if (amount <= 0) return; const offers = offersFor(pc.currentParts[index]).filter((offer) => offer.retailer !== retailer.value); offers.push({ id: uid(), retailer: retailer.value, priceINR: amount, recordedAt: Date.now() }); pc.currentParts[index].offers = offers.sort((a, b) => b.recordedAt - a.recordedAt).slice(0, RETAILERS.length); pc.currentParts[index].priceINR = partPrice(pc.currentParts[index]); pc.currentParts[index].retailer = bestOffer(pc.currentParts[index])?.retailer || retailer.value; persistPC(); renderBuild(); });
    pricing.append(quoteForm);
    const offers = node('div', 'part-offers');
    offersFor(part).sort((a, b) => number(a.priceINR) - number(b.priceINR)).forEach((offer) => {
      const offerRow = node('div', 'part-offer-row'); const source = { ...part, retailer: offer.retailer };
      offerRow.append(node('span', 'part-offer-price', currency(offer.priceINR)), node('span', 'part-offer-retailer', offer.retailer), node('small', '', offer.recordedAt ? new Date(offer.recordedAt).toLocaleDateString() : 'Imported'));
      offerRow.append(retailerLink(source));
      const removeOffer = node('button', 'offer-remove', '×'); removeOffer.type = 'button'; removeOffer.title = `Remove ${offer.retailer} price`;
      removeOffer.addEventListener('click', () => { pc.currentParts[index].offers = offersFor(pc.currentParts[index]).filter((entry) => entry.id !== offer.id); const nextBest = bestOffer(pc.currentParts[index]); pc.currentParts[index].priceINR = number(nextBest?.priceINR); pc.currentParts[index].retailer = nextBest?.retailer || ''; persistPC(); renderBuild(); }); offerRow.append(removeOffer); offers.append(offerRow);
    });
    if (offersFor(part).length) pricing.append(offers);
    const remove = node('button', 'row-remove', '×'); remove.type = 'button'; remove.title = `Remove ${part.name}`; remove.addEventListener('click', () => { pc.currentParts.splice(index, 1); persistPC(); renderBuild(); });
    row.append(info, pricing, remove); list.append(row);
  });
  const report = calculatePCPartCompatibility({ parts: pc.currentParts }); const panel = $('build-compatibility'); panel.replaceChildren();
  const state = report.errors.length ? 'needs-attention' : report.warnings.length ? 'has-notes' : pc.currentParts.length ? 'looks-good' : 'empty';
  panel.dataset.state = state;
  panel.append(node('b', '', report.errors.length ? 'Compatibility check' : report.warnings.length ? 'Compatibility notes' : pc.currentParts.length ? 'Listed specs are compatible' : 'Compatibility is ready'));
  report.errors.forEach((message) => panel.append(node('p', 'compat-error', message)));
  report.warnings.forEach((message) => panel.append(node('p', 'compat-warning', message)));
  if (report.recommendedPsuW) panel.append(node('p', 'compat-hint', `Estimated system draw about ${report.estimatedDrawW} W · suggested PSU capacity ${report.recommendedPsuW} W or higher. Check the GPU maker’s transient-power recommendation.`));
  panel.append(node('small', '', 'Checks only compare specifications entered here. Exact board BIOS support, cooler mounting kits, GPU clearance, connectors, and retailer SKU revisions still need verification.'));
  renderGuide(); renderSavedBuilds();
}

function addPart(part) {
  const cleaned = { ...clone(part), id: part.id || uid(), offers: Array.isArray(part.offers) ? clone(part.offers) : [], priceINR: Math.max(0, number(part.priceINR)), retailer: part.retailer || 'Other' };
  if (!cleaned.offers.length && cleaned.priceINR > 0) cleaned.offers.push({ id: uid(), retailer: cleaned.retailer, priceINR: cleaned.priceINR, recordedAt: Date.now() });
  const previous = ['storage', 'other', 'fans', 'accessory', 'software'].includes(cleaned.type) ? -1 : pc.currentParts.findIndex((entry) => entry.type === cleaned.type);
  if (previous >= 0) pc.currentParts.splice(previous, 1, cleaned); else pc.currentParts.push(cleaned);
  pc.currentParts.sort((a, b) => COMPONENT_TYPES.findIndex(([type]) => type === a.type) - COMPONENT_TYPES.findIndex(([type]) => type === b.type));
  persistPC(); renderBuild();
}

function renderSavedBuilds() {
  const list = $('saved-build-list'); list.replaceChildren();
  if (!pc.savedBuilds.length) { list.append(node('p', 'empty-state', 'Saved builds appear here on this device.')); return; }
  pc.savedBuilds.slice().sort((a, b) => b.updatedAt - a.updatedAt).forEach((build) => {
    const row = node('div', 'saved-build-row'); const load = node('button', 'saved-build-load'); load.type = 'button';
    load.append(node('b', '', build.name), node('small', '', `${new Date(build.updatedAt).toLocaleDateString()} · ${currency((build.parts || []).reduce((sum, part) => sum + partPrice(part), 0))}`));
    load.addEventListener('click', () => { pc.currentName = build.name; pc.currentParts = clone(build.parts || []); pc.currentBudget = build.budget || 100000; pc.currentGoal = build.goal || 'gaming'; renderBuild(); showStatus('BUILD LOADED', 'saved'); });
    const remove = node('button', 'row-remove', '×'); remove.type = 'button'; remove.title = `Delete ${build.name}`; remove.addEventListener('click', () => { pc.savedBuilds = pc.savedBuilds.filter((item) => item.id !== build.id); persistPC(); renderSavedBuilds(); });
    row.append(load, remove); list.append(row);
  });
}

function buildMarkdown() {
  const report = calculatePCPartCompatibility({ parts: pc.currentParts });
  const lines = [`# ${pc.currentName || 'PC build'}`, '', `- Budget: ${currency(pc.currentBudget)}`, `- Goal: ${pc.currentGoal}`, `- Entered total (lowest recorded offers): ${currency(selectedPartsTotal())}`, `- Compatibility from entered specs: ${report.errors.length ? 'needs attention' : report.warnings.length ? 'incomplete / review notes' : 'no listed conflicts'}`, '', '| Component | Exact model / profile | Lowest recorded | Current manual offers |', '|---|---|---:|---|'];
  pc.currentParts.forEach((part) => {
    const offers = offersFor(part).sort((a, b) => number(a.priceINR) - number(b.priceINR));
    const offerText = offers.map((offer) => {
      const source = PRICE_SOURCES.find((item) => item.name === offer.retailer);
      const url = source?.searchUrl ? `${source.searchUrl}${encodeURIComponent(part.name)}` : source?.url;
      const retailer = url ? `[${offer.retailer}](${url})` : offer.retailer;
      return `${retailer}: ${currency(offer.priceINR)}${offer.recordedAt ? ` (${new Date(offer.recordedAt).toLocaleDateString()})` : ''}`;
    }).join('; ') || 'None';
    const component = COMPONENT_TYPES.find(([type]) => type === part.type)?.[1] || part.type;
    lines.push(`| ${component} | ${String(part.brand)} ${String(part.name).replaceAll('|', '\\|')} | ${offers.length ? currency(offers[0].priceINR) : 'Not entered'} | ${offerText.replaceAll('|', '\\|')} |`);
  });
  lines.push('', '## Compatibility notes', ...report.errors.map((item) => `- Conflict: ${item}`), ...report.warnings.map((item) => `- Check: ${item}`), ...(report.recommendedPsuW ? [`- Estimated draw: about ${report.estimatedDrawW} W; suggested PSU capacity: ${report.recommendedPsuW} W+.`] : []), '', 'Profile data is indicative. Verify exact SKU, BIOS support, mounting, connectors, dimensions, warranty, and seller listing before purchase.');
  return lines.join('\n');
}

function download(name, contents, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contents], { type })); const link = node('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindBuilder() {
  $('build-budget').addEventListener('input', () => { pc.currentBudget = Math.max(0, number($('build-budget').value)); schedulePCSave(); renderGuide(); });
  $('build-goal').addEventListener('change', () => { pc.currentGoal = $('build-goal').value; persistPC(); renderGuide(); });
  $('build-name').addEventListener('input', () => { pc.currentName = $('build-name').value.slice(0, 90); setText('build-title-heading', pc.currentName || 'Untitled build'); });
  $('build-name').addEventListener('change', persistPC);
  $('template-part-form').addEventListener('submit', (event) => { event.preventDefault(); const id = $('part-template').value; const part = [...REFERENCE_PARTS, ...pc.customParts].find((item) => item.id === id); if (part) addPart(part); });
  $('custom-part-form').addEventListener('submit', (event) => {
    event.preventDefault(); const type = $('custom-type').value; const name = $('custom-name').value.trim(); const brand = $('custom-brand').value.trim(); if (!name || !brand) return;
    const upperList = (id) => $(id).value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
    const part = { id: uid(), type, brand, name, priceINR: Math.max(0, number($('custom-price').value)), retailer: $('custom-retailer').value };
    const socket = $('custom-socket').value.trim().toUpperCase(); if (socket) part.socket = socket;
    const memory = $('custom-memory').value.trim().toUpperCase(); if (memory) { if (type === 'cpu') part.memoryTypes = upperList('custom-memory'); else part.memoryType = memory; }
    const formFactor = $('custom-form-factor').value.trim().toUpperCase(); if (formFactor) part.formFactor = formFactor;
    const power = toNum('custom-power'); if (power != null) part.powerW = power;
    const gpuLength = toNum('custom-gpu-length'); if (gpuLength != null) part.lengthMm = gpuLength;
    const gpuLimit = toNum('custom-case-gpu'); if (gpuLimit != null) part.maxGpuLengthMm = gpuLimit;
    const coolerHeight = toNum('custom-cooler-height'); if (coolerHeight != null) part.heightMm = coolerHeight;
    const coolerLimit = toNum('custom-case-cooler'); if (coolerLimit != null) part.maxCoolerHeightMm = coolerLimit;
    const psu = toNum('custom-psu'); if (psu != null) part.wattageW = psu;
    const sockets = upperList('custom-cooler-sockets'); if (sockets.length) part.supportedSockets = sockets;
    const boards = upperList('custom-case-boards'); if (boards.length) part.supportedFormFactors = boards;
    const gpuConnectors = upperList('custom-gpu-connectors'); if (gpuConnectors.length) part.powerConnectors = gpuConnectors;
    const psuConnectors = upperList('custom-psu-connectors'); if (psuConnectors.length) part.connectors = psuConnectors;
    pc.customParts.unshift(clone(part));
    addPart(part); fillStaticOptions(); $('part-template').value = part.id;
    $('custom-part-form').reset(); $('custom-retailer').value = part.retailer; persistPC(); showStatus('CUSTOM PART ADDED', 'saved');
  });
  $('build-save').addEventListener('click', () => {
    pc.currentName = $('build-name').value.trim().slice(0, 90) || 'Untitled build'; pc.currentBudget = number($('build-budget').value, 0); pc.currentGoal = $('build-goal').value;
    const existing = pc.savedBuilds.find((build) => build.name.toLowerCase() === pc.currentName.toLowerCase());
    const build = { id: existing?.id || uid(), name: pc.currentName, budget: pc.currentBudget, goal: pc.currentGoal, parts: clone(pc.currentParts), updatedAt: Date.now() };
    pc.savedBuilds = [build, ...pc.savedBuilds.filter((item) => item.id !== build.id)].slice(0, 50); persistPC(); renderBuild(); showStatus('BUILD SAVED', 'saved');
  });
  $('build-export').addEventListener('click', () => download(`${(pc.currentName || 'vesper-build').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`, buildMarkdown()));
  $('build-print').addEventListener('click', () => {
    const reset = () => delete document.body.dataset.printMode;
    document.body.dataset.printMode = 'pc-build'; window.addEventListener('afterprint', reset, { once: true }); window.print(); window.setTimeout(reset, 1500);
  });
  $('build-clear').addEventListener('click', () => { pc.currentParts = []; persistPC(); renderBuild(); });
}

function renderPortfolio() {
  const rows = $('asset-rows'); rows.replaceChildren(); let totalValue = 0; let totalCost = 0; const distribution = {};
  finance.assets.forEach((asset, index) => {
    const current = number(asset.currentPrice); const value = number(asset.units) * current * number(asset.fxToINR, 1); const cost = number(asset.units) * number(asset.buyPrice) * number(asset.fxToINR, 1); const gain = value - cost;
    totalValue += value; totalCost += cost; distribution[asset.kind] = (distribution[asset.kind] || 0) + value;
    const xirr = calculateXirr([{ amount: -cost, date: asset.firstBuyDate }, { amount: value, date: localDate() }]);
    const row = node('tr'); row.append(node('td', '', `${asset.name}${asset.symbol ? ` · ${asset.symbol}` : ''}`), node('td', '', `${number(asset.units).toLocaleString('en-IN')} ${asset.currency}`), node('td', '', currency(asset.buyPrice, asset.currency)), node('td', '', currency(current, asset.currency)), node('td', '', currency(value)), node('td', gain >= 0 ? 'gain-positive' : 'gain-negative', `${gain >= 0 ? '+' : '−'}${currency(Math.abs(gain))}`), node('td', '', xirr == null ? '—' : `${(xirr * 100).toFixed(1)}%`));
    const actionCell = node('td'); const remove = node('button', 'row-remove', '×'); remove.type = 'button'; remove.title = `Remove ${asset.name}`; remove.addEventListener('click', () => { finance.assets.splice(index, 1); persistFinance(); renderPortfolio(); }); actionCell.append(remove); row.append(actionCell); rows.append(row);
  });
  const gain = totalValue - totalCost; const metrics = $('portfolio-metrics'); metrics.replaceChildren();
  [[`PORTFOLIO VALUE`, currency(totalValue)], [`COST BASIS`, currency(totalCost)], [`UNREALIZED GAIN / LOSS`, `${gain >= 0 ? '+' : '−'}${currency(Math.abs(gain))}`]].forEach(([label, value]) => { const card = node('article', 'metric-card'); card.append(node('span', 'eyebrow', label), node('b', '', value)); metrics.append(card); });
  metrics.lastElementChild?.classList.toggle('is-negative', gain < 0);
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0); const colors = ['#38bdf8', '#cba6f7', '#f97316', '#88c0d0', '#788755']; let cursor = 0; const segments = Object.entries(distribution).map(([kind, amount], i) => { const start = cursor; cursor += total ? amount / total * 100 : 0; return `${colors[i % colors.length]} ${start}% ${cursor}%`; });
  $('distribution-wheel').style.background = total ? `conic-gradient(${segments.join(',')})` : 'conic-gradient(var(--border) 0 100%)';
  const legend = $('distribution-legend'); legend.replaceChildren(); Object.entries(distribution).forEach(([kind, amount], index) => { const row = node('span', 'distribution-legend-row'); row.append(node('i')); row.firstChild.style.background = colors[index % colors.length]; row.append(node('b', '', kind), node('small', '', currency(amount))); legend.append(row); });
  $('quote-endpoint').value = finance.quoteEndpoint || '';
  const quoteList = $('quote-list'); quoteList.replaceChildren(); Object.values(finance.quotes).sort((a, b) => a.symbol.localeCompare(b.symbol)).forEach((quote) => { const item = node('div', 'quote-row'); item.append(node('b', '', quote.symbol), node('span', '', currency(quote.price, quote.currency || 'INR')), node('small', '', `Saved ${new Date(quote.observedAt).toLocaleString()}`)); quoteList.append(item); });
  const symbols = [...new Set(finance.assets.map((asset) => asset.symbol).filter(Boolean))]; $('quote-symbols').value = symbols.join(', ');
}

function bindPortfolio() {
  $('asset-form').addEventListener('submit', (event) => {
    event.preventDefault(); const symbol = $('asset-symbol').value.trim().toUpperCase(); const currencyCode = $('asset-currency').value;
    const asset = { id: uid(), kind: $('asset-kind').value, symbol, name: $('asset-name').value.trim(), units: number($('asset-units').value), buyPrice: number($('asset-cost').value), currentPrice: number($('asset-current').value), currency: currencyCode, fxToINR: number($('asset-fx').value, 1), firstBuyDate: $('asset-date').value || localDate() };
    const quote = finance.quotes[symbol]; if (quote && quote.currency === currencyCode) asset.currentPrice = quote.price;
    finance.assets.push(asset); persistFinance(); $('asset-form').reset(); $('asset-date').value = localDate(); $('asset-fx').value = '1'; renderPortfolio();
  });
  $('quote-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const endpoint = $('quote-endpoint').value.trim(); finance.quoteEndpoint = endpoint; persistFinance();
    const symbols = $('quote-symbols').value.split(',').map((item) => item.trim()).filter(Boolean); setText('quote-status', 'Checking your local quote service…');
    const result = await fetchStockTickers(symbols, { endpoint });
    const refreshed = new Map(result.quotes.map((quote) => [quote.symbol, quote]));
    finance.quotes = { ...finance.quotes, ...Object.fromEntries(refreshed) };
    finance.assets = finance.assets.map((asset) => { const quote = refreshed.get(asset.symbol); return quote && quote.currency === asset.currency ? { ...asset, currentPrice: quote.price } : asset; });
    persistFinance(); setText('quote-status', result.message); $('quote-status').dataset.state = result.live ? 'looks-good' : 'has-notes'; renderPortfolio();
  });
}

function renderHealthResult(result) {
  const panel = $('health-results'); panel.replaceChildren(node('span', 'eyebrow', 'YOUR ESTIMATE'));
  if (result.error) { panel.append(node('p', 'compat-error', result.error)); return; }
  const grid = node('div', 'health-result-grid');
  [[`BMR`, `${result.bmr.toLocaleString()} kcal/day`], [`TDEE`, `${result.tdee.toLocaleString()} kcal/day`], [`PLANNED INTAKE`, `${result.targetCalories.toLocaleString()} kcal/day`], [`DAILY DEFICIT`, `${result.deficit.toLocaleString()} kcal/day`]].forEach(([label, value]) => { const card = node('div', 'health-result-tile'); card.append(node('span', 'eyebrow', label), node('b', '', value)); grid.append(card); }); panel.append(grid);
  const macros = node('p', 'macro-summary', `Macro estimate · Protein ${result.macros.proteinG} g · Carbohydrates ${result.macros.carbsG} g · Fat ${result.macros.fatG} g`); panel.append(macros);
  if (result.targetDate) panel.append(node('p', '', `Rough target date at this constant deficit: ${new Date(`${result.targetDate}T12:00:00`).toLocaleDateString()}. This is a simple mathematical estimate.`));
  panel.append(node('small', 'planner-footnote', result.estimateNote));
}

function bindHealth() {
  health ||= {};
  health.nutritionEntries = Array.isArray(health.nutritionEntries) ? health.nutritionEntries : [];
  health.fastingSessions = Array.isArray(health.fastingSessions) ? health.fastingSessions : [];
  if (health?.input) for (const [key, id] of Object.entries({ method: 'health-method', sex: 'health-sex', age: 'health-age', weightKg: 'health-weight', heightCm: 'health-height', bodyFatPercent: 'health-bodyfat', activityFactor: 'health-activity', deficitKcal: 'health-deficit', targetWeightKg: 'health-target' })) if (health.input[key] != null) $(id).value = String(health.input[key]);
  if (health?.result) renderHealthResult(health.result);
  $('health-form').addEventListener('submit', (event) => {
    event.preventDefault(); const input = { method: $('health-method').value, sex: $('health-sex').value, age: toNum('health-age'), weightKg: toNum('health-weight'), heightCm: toNum('health-height'), bodyFatPercent: toNum('health-bodyfat'), activityFactor: number($('health-activity').value), deficitKcal: toNum('health-deficit'), targetWeightKg: toNum('health-target') };
    const result = calculateTDEEAndDeficit(input); renderHealthResult(result); health = { ...health, input, result, updatedAt: Date.now() }; savePath('workspace.health', health); renderNutritionLog();
  });
  $('nutrition-date').value = localDate();
  $('nutrition-date').addEventListener('change', renderNutritionLog);
  $('nutrition-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const entry = normalizeNutritionEntry({
        name: $('nutrition-name').value,
        date: $('nutrition-date').value,
        calories: $('nutrition-calories').value,
        proteinG: $('nutrition-protein').value,
        carbsG: $('nutrition-carbs').value,
        fatG: $('nutrition-fat').value,
      });
      if (health.nutritionEntries.length >= 5000) throw new Error('This local food log has reached 5,000 entries. Export or remove older records before adding more.');
      health.nutritionEntries.push({ id: uid(), ...entry, createdAt: Date.now() });
      saveHealth(); $('nutrition-form').reset(); $('nutrition-date').value = localDate(); renderNutritionLog();
    } catch (error) { showStatus(error instanceof Error ? error.message : 'Could not save that food entry.', 'error'); }
  });
  $('fasting-target').value = String(health.activeFast?.targetHours || 0);
  $('fasting-target').addEventListener('change', () => {
    if (!health.activeFast) return;
    health.activeFast.targetHours = number($('fasting-target').value);
    saveHealth(); renderFastingLog();
  });
  $('fasting-start').addEventListener('click', () => {
    if (health.activeFast) return;
    health.activeFast = { startedAt: new Date().toISOString(), targetHours: number($('fasting-target').value) };
    saveHealth(); renderFastingLog();
  });
  $('fasting-stop').addEventListener('click', () => {
    if (!health.activeFast) return;
    if (health.fastingSessions.length >= 1000) { showStatus('This local fasting log has reached 1,000 sessions. Remove older records before saving another.', 'error'); return; }
    const session = { id: uid(), startedAt: health.activeFast.startedAt, endedAt: new Date().toISOString(), targetHours: number(health.activeFast.targetHours) };
    if (fastingElapsedMinutes(session) == null) { showStatus('The saved timer start is invalid; the session was not changed.', 'error'); return; }
    health.fastingSessions.unshift(session); health.activeFast = null;
    saveHealth(); renderFastingLog();
  });
  $('fasting-discard').addEventListener('click', () => {
    if (!health.activeFast || fastingElapsedMinutes(health.activeFast) != null) return;
    if (!window.confirm('The saved timer start is invalid. Discard this timer without adding a session?')) return;
    health.activeFast = null; saveHealth(); renderFastingLog();
  });
  renderNutritionLog(); renderFastingLog();
  window.clearInterval(fastingTimer);
  fastingTimer = window.setInterval(renderFastingLog, 60_000);
  window.addEventListener('pagehide', () => window.clearInterval(fastingTimer), { once: true });
}

function saveHealth() {
  health.updatedAt = Date.now();
  savePath('workspace.health', health);
}

function renderNutritionLog() {
  const date = $('nutrition-date').value || localDate();
  const summary = summarizeNutritionDay(health.nutritionEntries, date);
  const target = number(health.result?.targetCalories, 0);
  const summaryPanel = $('nutrition-summary'); summaryPanel.replaceChildren();
  const difference = target - summary.calories;
  const calories = target > 0
    ? `${summary.calories.toLocaleString()} kcal · ${difference >= 0 ? `${Math.round(difference).toLocaleString()} kcal remaining` : `${Math.round(-difference).toLocaleString()} kcal over`} your estimate`
    : `${summary.calories.toLocaleString()} kcal · calculate an energy estimate to show a personal reference`;
  summaryPanel.append(node('b', '', calories));
  summaryPanel.append(node('p', '', `${summary.entries} entries · Protein ${summary.proteinG} g · Carbohydrates ${summary.carbsG} g · Fat ${summary.fatG} g`));
  if (target > 0) {
    const track = node('span', 'allocation-track'); const fill = node('i');
    fill.style.width = `${Math.min(100, summary.calories / target * 100)}%`; track.append(fill); summaryPanel.append(track);
  }
  const list = $('nutrition-entries'); list.replaceChildren();
  const entries = health.nutritionEntries.filter((entry) => entry?.date === date).slice().sort((a, b) => number(b.createdAt) - number(a.createdAt));
  if (!entries.length) list.append(node('p', 'empty-state', 'No food entries for this date.'));
  entries.forEach((entry) => {
    const row = node('div', 'health-entry-row');
    row.append(node('span', '', entry.name), node('b', '', `${number(entry.calories).toLocaleString()} kcal`));
    row.append(node('small', '', `P ${number(entry.proteinG)} g · C ${number(entry.carbsG)} g · F ${number(entry.fatG)} g`));
    const remove = node('button', 'row-remove', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${entry.name}`);
    remove.addEventListener('click', () => { health.nutritionEntries = health.nutritionEntries.filter((item) => item.id !== entry.id); saveHealth(); renderNutritionLog(); });
    row.append(remove); list.append(row);
  });
}

function renderFastingLog() {
  const status = $('fasting-status'); status.replaceChildren();
  const active = health.activeFast;
  const elapsed = active ? fastingElapsedMinutes(active) : null;
  $('fasting-start').disabled = Boolean(active);
  $('fasting-stop').disabled = !active || elapsed == null;
  $('fasting-discard').hidden = !active || elapsed != null;
  if (active) {
    status.append(node('b', '', elapsed == null ? 'Timer start is invalid.' : `In progress · ${Math.floor(elapsed / 60)}h ${elapsed % 60}m`));
    if (elapsed != null && number(active.targetHours) > 0) {
      const targetMinutes = number(active.targetHours) * 60;
      status.append(node('p', '', `${Math.min(100, Math.round(elapsed / targetMinutes * 100))}% of your optional ${active.targetHours}-hour reminder. This is not medical guidance.`));
    }
  } else status.append(node('p', '', 'No timer is running. Starting a timer only records its start time; it does not recommend a fasting schedule.'));
  const list = $('fasting-entries'); list.replaceChildren();
  const sessions = health.fastingSessions.slice(0, 12);
  if (!sessions.length) list.append(node('p', 'empty-state', 'Completed sessions will appear here on this device.'));
  sessions.forEach((session) => {
    const minutes = fastingElapsedMinutes(session);
    const row = node('div', 'health-entry-row');
    const started = Date.parse(session.startedAt);
    const ended = Date.parse(session.endedAt);
    row.append(node('span', '', Number.isFinite(started) ? new Date(started).toLocaleString() : 'Unknown start'));
    row.append(node('b', '', minutes == null ? 'Invalid record' : `${Math.floor(minutes / 60)}h ${minutes % 60}m`));
    row.append(node('small', '', Number.isFinite(ended) ? `Ended ${new Date(ended).toLocaleString()}` : 'End time unavailable'));
    const remove = node('button', 'row-remove', '×'); remove.type = 'button'; remove.setAttribute('aria-label', 'Remove fasting timer record');
    remove.addEventListener('click', () => { health.fastingSessions = health.fastingSessions.filter((item) => item.id !== session.id); saveHealth(); renderFastingLog(); });
    row.append(remove); list.append(row);
  });
}

function monthSpend(category) {
  const now = new Date(); return finance.ledger.filter((entry) => entry.kind === 'expense' && entry.category.toLowerCase() === category.toLowerCase()).filter((entry) => { const date = new Date(`${entry.date}T12:00:00`); return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); }).reduce((sum, entry) => sum + number(entry.amount), 0);
}

function renderNetWorthChart() {
  const svg = $('networth-chart'); const ns = 'http://www.w3.org/2000/svg'; svg.replaceChildren();
  const today = new Date(); const points = Array.from({ length: 30 }, (_, index) => { const date = new Date(today); date.setDate(date.getDate() - 29 + index); const key = localDate(date); let value = finance.accounts.reduce((sum, account) => sum + (account.createdAt <= date.getTime() ? number(account.openingBalance) : 0), 0); finance.ledger.forEach((entry) => { if (entry.date <= key) value += (entry.kind === 'income' ? 1 : -1) * number(entry.amount); }); return { key, value }; });
  const min = Math.min(0, ...points.map((point) => point.value)); const max = Math.max(1, ...points.map((point) => point.value));
  const path = document.createElementNS(ns, 'path'); path.setAttribute('class', 'networth-line'); path.setAttribute('d', points.map((point, index) => { const x = 12 + index / Math.max(1, points.length - 1) * 576; const y = 150 - (point.value - min) / (max - min) * 130; return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' ')); svg.append(path);
  const baseline = document.createElementNS(ns, 'line'); baseline.setAttribute('x1', '12'); baseline.setAttribute('x2', '588'); baseline.setAttribute('y1', '150'); baseline.setAttribute('y2', '150'); baseline.setAttribute('class', 'networth-baseline'); svg.prepend(baseline);
  svg.setAttribute('aria-label', `Thirty-day ledger net-worth estimate. Latest ${currency(points.at(-1)?.value || 0)}.`);
}

function renderLedger() {
  const accounts = $('account-list'); accounts.replaceChildren();
  finance.accounts.forEach((account, index) => { const row = node('div', 'account-row'); row.append(node('span', '', account.name), node('b', '', currency(account.currentBalance))); const remove = node('button', 'row-remove', '×'); remove.type = 'button'; remove.title = `Delete ${account.name}`; remove.addEventListener('click', () => { finance.accounts.splice(index, 1); persistFinance(); renderLedger(); }); row.append(remove); accounts.append(row); });
  const accountSelect = $('ledger-account'); accountSelect.replaceChildren(new Option('No account / cash adjustment', '')); finance.accounts.forEach((account) => accountSelect.add(new Option(account.name, account.id)));
  const rows = $('ledger-rows'); rows.replaceChildren(); finance.ledger.slice().sort((a, b) => b.date.localeCompare(a.date)).forEach((entry) => { const row = node('tr'); row.append(node('td', '', entry.date), node('td', entry.kind === 'income' ? 'gain-positive' : 'gain-negative', entry.kind), node('td', '', entry.description), node('td', '', entry.category), node('td', '', finance.accounts.find((account) => account.id === entry.accountId)?.name || '—'), node('td', '', `${entry.kind === 'income' ? '+' : '−'}${currency(entry.amount)}`)); const cell = node('td'); const remove = node('button', 'row-remove', '×'); remove.type = 'button'; remove.title = 'Delete transaction'; remove.addEventListener('click', () => { const account = finance.accounts.find((item) => item.id === entry.accountId); if (account) account.currentBalance += entry.kind === 'income' ? -entry.amount : entry.amount; finance.ledger = finance.ledger.filter((item) => item.id !== entry.id); persistFinance(); renderLedger(); }); cell.append(remove); row.append(cell); rows.append(row); });
  const categories = [...new Set([...finance.budgets.map((budget) => budget.name), ...finance.ledger.map((entry) => entry.category)])].sort(); $('budget-category-options').replaceChildren(...categories.map((name) => new Option(name, name)));
  const budgets = $('budget-list'); budgets.replaceChildren(); finance.budgets.forEach((budget, index) => { const spent = monthSpend(budget.name); const percentage = budget.limit > 0 ? Math.min(100, spent / budget.limit * 100) : 0; const row = node('div', 'budget-envelope'); row.append(node('div', 'budget-envelope-heading', `${budget.name} · ${currency(spent)} / ${currency(budget.limit)}`)); const track = node('span', 'allocation-track'); const fill = node('i'); fill.style.width = `${percentage}%`; if (spent > budget.limit) fill.classList.add('is-over'); track.append(fill); const remove = node('button', 'row-remove', '×'); remove.type = 'button'; remove.title = `Delete ${budget.name} envelope`; remove.addEventListener('click', () => { finance.budgets.splice(index, 1); persistFinance(); renderLedger(); }); row.append(track, remove); budgets.append(row); });
  const assetsValue = finance.assets.reduce((sum, asset) => sum + number(asset.units) * number(asset.currentPrice) * number(asset.fxToINR, 1), 0); const accountValue = finance.accounts.reduce((sum, account) => sum + number(account.currentBalance), 0); const metrics = $('finance-metrics'); metrics.replaceChildren();
  [[`ACCOUNT BALANCES`, currency(accountValue)], [`TRACKED INVESTMENTS`, currency(assetsValue)], [`TOTAL TRACKED`, currency(accountValue + assetsValue)]].forEach(([title, value]) => { const card = node('article', 'metric-card'); card.append(node('span', 'eyebrow', title), node('b', '', value)); metrics.append(card); });
  renderNetWorthChart();
}

function bindLedger() {
  $('account-form').addEventListener('submit', (event) => { event.preventDefault(); const balance = number($('account-balance').value); finance.accounts.push({ id: uid(), name: $('account-name').value.trim(), openingBalance: balance, currentBalance: balance, createdAt: Date.now() }); persistFinance(); $('account-form').reset(); renderLedger(); });
  $('budget-form').addEventListener('submit', (event) => { event.preventDefault(); const name = $('budget-name').value.trim(); const item = { id: uid(), name, limit: number($('budget-limit').value) }; const index = finance.budgets.findIndex((budget) => budget.name.toLowerCase() === name.toLowerCase()); if (index >= 0) finance.budgets[index] = item; else finance.budgets.push(item); persistFinance(); $('budget-form').reset(); renderLedger(); });
  $('ledger-form').addEventListener('submit', (event) => {
    event.preventDefault(); const kind = $('ledger-kind').value; const amount = number($('ledger-amount').value); const accountId = $('ledger-account').value; const account = finance.accounts.find((item) => item.id === accountId); const entry = { id: uid(), kind, amount, accountId, description: $('ledger-description').value.trim(), category: $('ledger-category').value.trim(), date: $('ledger-date').value || localDate() };
    if (account) account.currentBalance += kind === 'income' ? amount : -amount;
    finance.ledger.push(entry); persistFinance(); $('ledger-form').reset(); $('ledger-date').value = localDate(); renderLedger();
  });
}

const HABIT_CHOICES = [
  { id: 'water', label: 'Drink a glass of water', icon: '◌' }, { id: 'stretch', label: 'Take a gentle stretch break', icon: '↗' },
  { id: 'focus', label: 'Spend 10 minutes on one thing', icon: '✦' }, { id: 'rest', label: 'Take a real pause', icon: '☾' },
];

function habitXP() { return Object.values(habits.days).reduce((sum, day) => sum + Math.max(0, number(day.plannerXp)), 0); }
function habitStreak() { let streak = 0; const date = new Date(); for (let i = 0; i < 3660; i += 1) { const day = habits.days[localDate(date)]; if (!day?.plannerCompleted || !Object.values(day.plannerCompleted).some(Boolean)) break; streak += 1; date.setDate(date.getDate() - 1); } return streak; }

function renderHabits() {
  const today = localDate(); const day = habits.days[today] || { plannerCompleted: {}, plannerXp: 0 }; const list = $('planner-habit-list'); list.replaceChildren();
  HABIT_CHOICES.forEach((habit) => { const label = node('label', `planner-habit-item${day.plannerCompleted?.[habit.id] ? ' is-done' : ''}`); const input = node('input'); input.type = 'checkbox'; input.checked = Boolean(day.plannerCompleted?.[habit.id]); input.addEventListener('change', () => {
      const latest = habits.days[today] || { plannerCompleted: {}, plannerXp: 0 }; const completed = { ...(latest.plannerCompleted || {}) }; const wasDone = Boolean(completed[habit.id]); completed[habit.id] = input.checked;
      const xp = Math.max(0, number(latest.plannerXp)) + (input.checked && !wasDone ? 10 : !input.checked && wasDone ? -10 : 0);
      habits.days[today] = { ...latest, checkins: Math.max(0, number(latest.checkins) + (input.checked && !wasDone ? 1 : !input.checked && wasDone ? -1 : 0)), plannerCompleted: completed, plannerXp: xp };
      const total = habitXP(); const milestones = [100, 250, 500].filter((threshold) => total >= threshold).map((threshold) => `wardrobe-milestone-${threshold}`); habits.badges = [...new Set([...habits.badges, ...milestones])];
      persistHabits(); renderHabits(); document.dispatchEvent(new CustomEvent('vesper:habit-xp', { detail: { xp: total, streak: habitStreak() } }));
    }); label.append(input, node('span', 'habit-choice-icon', habit.icon), node('span', '', habit.label), node('small', '', input.checked ? 'DONE · +10 XP' : '+10 XP')); list.append(label); });
  const xp = habitXP(); const level = Math.floor(xp / 100) + 1; setText('planner-habit-xp', xp); const progress = xp % 100; $('planner-habit-progress').style.width = `${progress}%`; setText('planner-habit-status', `${habitStreak()} day streak · Level ${level} · ${100 - progress} XP to next level`);
  const unlocks = $('planner-habit-unlocks'); unlocks.replaceChildren(); [100, 250, 500].forEach((threshold) => { const card = node('div', `habit-unlock${xp >= threshold ? ' is-unlocked' : ''}`); card.append(node('b', '', xp >= threshold ? 'UNLOCKED' : `${threshold - xp} XP LEFT`), node('span', '', `${threshold} XP · wardrobe milestone`)); unlocks.append(card); });
}

function bindTabs() {
  const buttons = [...document.querySelectorAll('[data-planner-tab]')];
  buttons.forEach((button, index) => button.addEventListener('click', () => {
    const target = button.dataset.plannerTab;
    buttons.forEach((item) => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
    document.querySelectorAll('[data-planner-view]').forEach((panel) => { const active = panel.dataset.plannerView === target; panel.classList.toggle('is-visible', active); panel.hidden = !active; });
  }));
  buttons.forEach((button, index) => button.addEventListener('keydown', (event) => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length; buttons[next].focus(); buttons[next].click(); }));
}

async function initialize() {
  await initVesperDatabase(); ensureState(); fillStaticOptions(); bindTabs(); bindBuilder(); bindPortfolio(); bindHealth(); bindLedger();
  renderBuild(); renderPortfolio(); renderHealthResult(health?.result || { error: 'Enter values to calculate a resting-energy and daily-energy estimate.' }); renderLedger(); renderHabits(); isHydrated = true;
  appStore.subscribe((_state, path) => { if (!isHydrated || path === 'workspace.pcBuilder' || path.startsWith('workspace.pcBuilder.') || path === 'workspace.finance' || path.startsWith('workspace.finance.') || path === 'workspace.health' || path.startsWith('workspace.health.')) return; });
}

window.vesperTools = Object.freeze({ initVesperDatabase, calculatePCPartCompatibility, calculateTDEEAndDeficit, fetchStockTickers, calculateXirr });
initialize().catch((error) => { console.error('Vesper planner could not initialize', error); showStatus('LOCAL DATA COULD NOT LOAD', 'error'); });
