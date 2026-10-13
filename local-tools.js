import { appStore } from './persistence.js';
import { calculateTDEEAndDeficit } from './health-tools.mjs';

export { calculateTDEEAndDeficit };

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const hasPositiveNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
const connectorKey = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const partsFor = (build) => Array.isArray(build?.parts) ? build.parts : Object.values(build?.parts || {});
const partOf = (build, type) => {
  return partsFor(build).find((part) => part?.type === type) || null;
};

/** Wait for localStorage/IndexedDB hydration before reading the Vesper database. */
export function initVesperDatabase() { return appStore.ready; }

/**
 * Check the mechanical constraints that can be evaluated from user/catalog
 * specifications. Board-partner card dimensions and BIOS lists must be verified.
 */
export function calculatePCPartCompatibility(build = {}) {
  const cpu = partOf(build, 'cpu'); const board = partOf(build, 'motherboard');
  const memory = partOf(build, 'memory'); const cooler = partOf(build, 'cooler');
  const gpu = partOf(build, 'gpu'); const cabinet = partOf(build, 'case');
  const psu = partOf(build, 'psu'); const errors = []; const warnings = [];
  const requiredTypes = ['cpu', 'motherboard', 'memory', 'storage', 'case', 'psu'];
  const missing = requiredTypes.filter((type) => !partsFor(build).some((part) => part?.type === type));
  if (missing.length) warnings.push(`Build sheet is partial. Add or confirm: ${missing.join(', ')}.`);
  if (cpu && board && cpu.socket && board.socket && cpu.socket !== board.socket) errors.push(`CPU socket ${cpu.socket} does not match motherboard socket ${board.socket}.`);
  if (cpu && board && !cpu.socket) warnings.push('CPU socket is not specified; socket compatibility cannot be checked.');
  if (cpu && board && !board.socket) warnings.push('Motherboard socket is not specified; socket compatibility cannot be checked.');
  if (memory && board && memory.memoryType && board.memoryType && memory.memoryType !== board.memoryType) errors.push(`${memory.memoryType} memory does not fit a ${board.memoryType} motherboard.`);
  if (memory && board && !memory.memoryType) warnings.push('Memory generation is not specified; DDR4/DDR5 slot fit cannot be checked.');
  if (memory && board && !board.memoryType) warnings.push('Motherboard memory generation is not specified; slot fit cannot be checked.');
  if (memory?.memoryType && cpu?.memoryTypes?.length && !cpu.memoryTypes.includes(memory.memoryType)) errors.push(`This CPU profile does not list ${memory.memoryType} memory support.`);
  if (cooler && cpu && Array.isArray(cooler.supportedSockets) && cooler.supportedSockets.length && cpu.socket && !cooler.supportedSockets.includes(cpu.socket)) errors.push(`Cooler mount does not list the ${cpu.socket} socket.`);
  if (cooler && cpu && !cooler.supportedSockets?.length) warnings.push('Cooler mounting sockets are not specified; confirm the exact mounting kit for this CPU.');
  if (cooler && cabinet && (!hasPositiveNumber(cooler.heightMm) || !hasPositiveNumber(cabinet.maxCoolerHeightMm))) warnings.push('Cooler/case height clearance is incomplete; compare the exact cooler height with the case limit.');
  if (cooler && cabinet && hasPositiveNumber(cooler.heightMm) && hasPositiveNumber(cabinet.maxCoolerHeightMm) && Number(cooler.heightMm) > Number(cabinet.maxCoolerHeightMm)) errors.push(`Cooler height ${cooler.heightMm} mm exceeds the case limit of ${cabinet.maxCoolerHeightMm} mm.`);
  if (gpu && cabinet && (!hasPositiveNumber(gpu.lengthMm) || !hasPositiveNumber(cabinet.maxGpuLengthMm))) warnings.push('GPU/case length clearance is incomplete; compare the exact card length with the case limit.');
  if (gpu && cabinet && hasPositiveNumber(gpu.lengthMm) && hasPositiveNumber(cabinet.maxGpuLengthMm) && Number(gpu.lengthMm) > Number(cabinet.maxGpuLengthMm)) errors.push(`GPU length ${gpu.lengthMm} mm exceeds the case limit of ${cabinet.maxGpuLengthMm} mm.`);
  if (board && cabinet && board.formFactor && Array.isArray(cabinet.supportedFormFactors) && cabinet.supportedFormFactors.length && !cabinet.supportedFormFactors.map((value) => String(value).toUpperCase()).includes(String(board.formFactor).toUpperCase())) errors.push(`${board.formFactor} motherboard form factor is not listed for this case.`);
  if (board && cabinet && !cabinet.supportedFormFactors?.length) warnings.push('Case motherboard form-factor support is not specified.');

  const powerParts = [cpu, gpu, memory, board, cooler].filter(Boolean);
  const unknownPower = powerParts.some((part) => !Number.isFinite(Number(part.powerW)) || Number(part.powerW) <= 0);
  const knownPower = powerParts.reduce((sum, part) => sum + Math.max(0, finite(part.powerW)), 0);
  const estimatedDrawW = knownPower ? Math.ceil(knownPower * 1.08 + 35) : null;
  const recommendedPsuW = knownPower ? Math.max(450, Math.ceil((knownPower * 1.4) / 50) * 50) : null;
  if (unknownPower && powerParts.length) warnings.push('Power estimate is incomplete because one or more selected parts have no entered board-power value.');
  if (psu && recommendedPsuW && (!Number.isFinite(Number(psu.wattageW)) || Number(psu.wattageW) <= 0)) warnings.push('PSU capacity is not specified; the power check cannot confirm adequacy.');
  else if (psu && recommendedPsuW && Number(psu.wattageW) < recommendedPsuW) errors.push(`PSU ${psu.wattageW} W is below the suggested ${recommendedPsuW} W capacity for the entered parts.`);
  if (gpu?.powerConnectors?.length && psu?.connectors?.length) {
    const available = psu.connectors.map(connectorKey);
    const missingConnectors = gpu.powerConnectors.filter((connector) => !available.includes(connectorKey(connector)));
    if (missingConnectors.length) errors.push(`PSU connector list is missing ${missingConnectors.join(', ')} required by the GPU profile.`);
  } else if (gpu && psu) warnings.push('Confirm the PSU has the exact GPU power connectors, including any 12V-2x6/12VHPWR requirement.');
  if (gpu && !finite(gpu.lengthMm)) warnings.push('GPU length is unknown; check the exact card model against the case clearance.');
  if (cooler && !finite(cooler.heightMm)) warnings.push('Cooler height is unknown; check the exact cooler and case specifications.');
  if (cpu && board && cpu.socket === board.socket && cpu.socket === 'AM5' && board.memoryType && board.memoryType !== 'DDR5') warnings.push('AM5 boards use DDR5; verify the motherboard and memory specifications before purchase.');
  const recommendedRatings = [450, 550, 650, 750, 850, 1000, 1200, 1600];
  const recommendedPsu = recommendedPsuW ? recommendedRatings.find((watts) => watts >= recommendedPsuW) || recommendedPsuW : null;
  return { compatible: errors.length === 0, errors, warnings: [...new Set(warnings)], missing, estimatedDrawW, recommendedPsuW: recommendedPsu, knownPowerW: knownPower || null };
}

/**
 * Use an optional same-origin quote endpoint; otherwise return saved local quotes.
 * Expected JSON: { quotes: [{ symbol, price, currency, observedAt }] }.
 */
export async function fetchStockTickers(symbols = [], { endpoint, signal } = {}) {
  const requested = [...new Set(symbols.map((item) => String(item || '').trim().toUpperCase()).filter((item) => /^[A-Z0-9.^_-]{1,24}$/.test(item)))].slice(0, 100);
  const cached = appStore.get('workspace.finance.quotes', {}) || {};
  const provider = String(endpoint ?? appStore.get('workspace.finance.quoteEndpoint', '')).trim();
  if (!provider || requested.length === 0) return { quotes: requested.map((symbol) => cached[symbol]).filter(Boolean), live: false, message: provider ? 'Add a symbol to refresh.' : 'Showing local snapshots. Configure a same-origin quote endpoint to refresh.' };
  let url;
  try { url = new URL(provider, location.origin); } catch { return { quotes: requested.map((symbol) => cached[symbol]).filter(Boolean), live: false, message: 'The quote endpoint URL is invalid.' }; }
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return { quotes: requested.map((symbol) => cached[symbol]).filter(Boolean), live: false, message: 'For privacy, Vesper accepts only a same-origin /api/ quote endpoint.' };
  url.searchParams.set('symbols', requested.join(','));
  const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 8000);
  const relayAbort = () => controller.abort(signal?.reason); signal?.addEventListener('abort', relayAbort, { once: true });
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Quote provider responded with ${response.status}.`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.quotes) ? payload.quotes : [];
    const latest = { ...cached };
    const saved = [];
    for (const row of rows) {
      const symbol = String(row?.symbol || '').trim().toUpperCase(); const price = finite(row?.price ?? row?.last ?? row?.currentPrice, NaN);
      if (!requested.includes(symbol) || !Number.isFinite(price) || price <= 0) continue;
      const quote = { symbol, price, currency: /^[A-Z]{3}$/.test(row.currency || '') ? row.currency : 'INR', observedAt: String(row.observedAt || row.timestamp || new Date().toISOString()) };
      latest[symbol] = quote; saved.push(quote);
    }
    if (!saved.length) throw new Error('The provider returned no valid quotes.');
    appStore.set('workspace.finance.quotes', latest);
    return { quotes: saved, live: true, message: `Updated ${saved.length} quote${saved.length === 1 ? '' : 's'} from your local provider.` };
  } catch (error) {
    return { quotes: requested.map((symbol) => cached[symbol]).filter(Boolean), live: false, message: `${error?.message || 'Could not refresh quotes'} Showing saved local snapshots.` };
  } finally {
    window.clearTimeout(timeout); signal?.removeEventListener('abort', relayAbort);
  }
}

/** Calculate XIRR for dated cash flows plus the current portfolio value. */
export function calculateXirr(cashFlows = []) {
  const flows = cashFlows.map((flow) => ({ amount: finite(flow.amount, NaN), date: new Date(flow.date).getTime() })).filter((flow) => Number.isFinite(flow.amount) && Number.isFinite(flow.date));
  if (flows.length < 2 || !flows.some((flow) => flow.amount < 0) || !flows.some((flow) => flow.amount > 0)) return null;
  const firstDate = Math.min(...flows.map((flow) => flow.date));
  const npv = (rate) => flows.reduce((sum, flow) => sum + flow.amount / ((1 + rate) ** ((flow.date - firstDate) / 86400000 / 365)), 0);
  let low = -0.9999; let high = 10; let lowValue = npv(low); let highValue = npv(high);
  if (lowValue * highValue > 0) return null;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2; const middleValue = npv(middle);
    if (Math.abs(middleValue) < 0.0001) return middle;
    if (lowValue * middleValue <= 0) { high = middle; highValue = middleValue; }
    else { low = middle; lowValue = middleValue; }
  }
  return (low + high) / 2;
}
