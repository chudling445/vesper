const median = (values) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function uniqueCurrentListings(records, now, maxAgeMs) {
  const latest = new Map();
  records.forEach((record) => {
    const observedAt = Date.parse(record.observedAt || '');
    if (!Number.isFinite(observedAt) || now - observedAt < 0 || now - observedAt > maxAgeMs) return;
    const key = `${record.source}\u001f${record.listingId || record.sourceUrl || record.id}`;
    if (!latest.has(key) || Date.parse(latest.get(key).observedAt) < observedAt) latest.set(key, record);
  });
  return [...latest.values()];
}

export function summarizeCurrentPrices(records, { partId, condition, now = Date.now(), maxAgeMs = 7 * 86_400_000 } = {}) {
  const current = uniqueCurrentListings(records.filter((record) => record.partId === partId
    && (!condition || record.condition === condition) && record.condition !== 'free'), now, maxAgeMs);
  const values = current.map((record) => Number(record.priceINR)).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return { count: 0, minINR: null, medianINR: null, averageINR: null, maxINR: null, sources: [], lastObservedAt: null };
  return {
    count: values.length,
    minINR: Math.min(...values),
    medianINR: median(values),
    averageINR: values.reduce((sum, value) => sum + value, 0) / values.length,
    maxINR: Math.max(...values),
    sources: [...new Set(current.map((record) => record.source))],
    lastObservedAt: current.map((record) => record.observedAt).sort().at(-1),
    bestListing: current.slice().sort((a, b) => Number(a.priceINR) - Number(b.priceINR))[0],
  };
}

export function summarizePriceYears(records, { partId, condition, launchYear, currentYear = new Date().getFullYear() }) {
  const matching = records.filter((record) => record.partId === partId && record.condition === condition);
  return Array.from({ length: currentYear - 2020 + 1 }, (_, index) => {
    const year = 2020 + index;
    const inYear = matching.filter((record) => new Date(record.observedAt).getUTCFullYear() === year);
    if (inYear.length) {
      const prices = inYear.map((record) => Number(record.priceINR)).filter(Number.isFinite).sort((a, b) => a - b);
      return { year, status: 'observed', count: inYear.length, minINR: prices[0], medianINR: median(prices), maxINR: prices.at(-1), sources: [...new Set(inYear.map((record) => record.source))] };
    }
    if (launchYear != null && year < launchYear) return { year, status: 'not-released', count: 0, minINR: null, medianINR: null, maxINR: null, sources: [] };
    return { year, status: 'no-verified-data', count: 0, minINR: null, medianINR: null, maxINR: null, sources: [] };
  });
}

export function forecastObservedPrice(records, { partId, condition, targetYears = [2027, 2028], now = Date.now() } = {}) {
  const candidates = records.filter((record) => record.partId === partId && record.condition === condition
    && Number(record.priceINR) > 0 && Number.isFinite(Date.parse(record.observedAt)));
  const years = [...new Set(candidates.map((record) => new Date(record.observedAt).getUTCFullYear()))].sort((a, b) => a - b);
  const newest = Math.max(0, ...candidates.map((record) => Date.parse(record.observedAt)));
  const distinctListings = new Set(candidates.map((record) => `${record.source}\u001f${record.listingId || record.id}`));
  if (years.length < 3 || candidates.length < 6 || distinctListings.size < 3
    || !newest || now - newest > 548 * 86_400_000) {
    return {
      available: false,
      reason: 'Forecasts require at least six dated observations across three calendar years, three distinct listings, and a recent observation within 18 months.',
      forecasts: [],
    };
  }
  const annual = years.map((year) => {
    const values = candidates.filter((record) => new Date(record.observedAt).getUTCFullYear() === year).map((record) => Number(record.priceINR));
    return { year, medianINR: median(values), count: values.length };
  });
  const slopes = [];
  for (let left = 0; left < annual.length; left += 1) {
    for (let right = left + 1; right < annual.length; right += 1) {
      slopes.push((annual[right].medianINR - annual[left].medianINR) / (annual[right].year - annual[left].year));
    }
  }
  const slope = median(slopes);
  const intercept = median(annual.map((point) => point.medianINR - slope * point.year));
  const residuals = annual.map((point) => Math.abs(point.medianINR - (intercept + slope * point.year)));
  const baseUncertainty = Math.max(median(residuals) * 1.4826, median(annual.slice(1).map((point, index) => Math.abs(point.medianINR - annual[index].medianINR))) * 0.25);
  const lastYear = annual.at(-1).year;
  const forecasts = targetYears.map((year) => {
    const horizon = Math.max(1, year - lastYear);
    const estimateINR = Math.max(0, intercept + slope * year);
    const rangeINR = Math.max(baseUncertainty * Math.sqrt(horizon), estimateINR * (0.15 * Math.sqrt(horizon)));
    return {
      year,
      estimateINR,
      lowINR: Math.max(0, estimateINR - rangeINR),
      highINR: estimateINR + rangeINR,
      uncertaintyPercent: estimateINR ? Math.min(95, (rangeINR / estimateINR) * 100) : 100,
      method: 'Theil–Sen trend on annual observed medians',
      observationCount: candidates.length,
      observedYears: years,
      sourceCount: new Set(candidates.map((record) => record.source)).size,
    };
  });
  return { available: true, method: 'Robust linear trend (Theil–Sen) fitted to annual medians of observed listings', caveat: 'Exploratory estimate only. Historical listing samples can be biased or sparse; this range is heuristic, not a statistical guarantee or a future quote.', forecasts };
}

export function summarizeIndexObservations(records, instrumentId) {
  const matching = records.filter((record) => record.instrumentId === instrumentId && Number(record.value) >= 0)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (!matching.length) return { count: 0, latest: null, periodReturnPercent: null, annualizedReturnPercent: null };
  const first = matching[0];
  const latest = matching.at(-1);
  const elapsedYears = (Date.parse(latest.observedAt) - Date.parse(first.observedAt)) / (365.2425 * 86_400_000);
  const periodReturnPercent = first.value > 0 ? ((latest.value / first.value) - 1) * 100 : null;
  return {
    count: matching.length,
    latest,
    first,
    periodReturnPercent,
    annualizedReturnPercent: elapsedYears > 0 && latest.value > 0 && first.value > 0
      ? ((latest.value / first.value) ** (1 / elapsedYears) - 1) * 100 : null,
  };
}

export const MARKET_STRESS_CATEGORIES = ['volatility', 'drawdown', 'credit', 'liquidity', 'breadth', 'currency', 'flows'];

export function summarizeMarketStress(records, { market, now = Date.now(), staleAfterMs = 72 * 60 * 60 * 1000 } = {}) {
  const matching = records.filter((record) => record.market === market
    && MARKET_STRESS_CATEGORIES.includes(record.category)
    && Number.isFinite(Number(record.stressScore))
    && Number(record.stressScore) >= 0 && Number(record.stressScore) <= 100);
  const byIndicator = new Map();
  matching.forEach((record) => {
    const previous = byIndicator.get(record.indicatorId);
    if (!previous || Date.parse(record.observedAt) > Date.parse(previous.observedAt)) byIndicator.set(record.indicatorId, record);
  });
  const indicators = [...byIndicator.values()].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  const byCategory = new Map();
  indicators.forEach((record) => {
    const values = byCategory.get(record.category) || [];
    values.push(record);
    byCategory.set(record.category, values);
  });
  const categories = [...byCategory].map(([category, items]) => ({
    category,
    weight: 1 / byCategory.size,
    score: items.reduce((sum, record) => sum + Number(record.stressScore), 0) / items.length,
    count: items.length,
    latestObservedAt: items.map((record) => record.observedAt).sort().at(-1),
    staleCount: market === 'reference-2008' ? 0 : items.filter((record) => now - Date.parse(record.observedAt) > staleAfterMs).length,
  }));
  const latestObservedAt = indicators.map((record) => record.observedAt).sort().at(-1) || null;
  const staleIndicatorCount = market === 'reference-2008' ? 0
    : indicators.filter((record) => now - Date.parse(record.observedAt) > staleAfterMs).length;
  const score = categories.length ? categories.reduce((sum, item) => sum + item.score, 0) / categories.length : null;
  return {
    market,
    score,
    indicatorCount: indicators.length,
    categoryCount: categories.length,
    coveragePercent: Math.round((categories.length / MARKET_STRESS_CATEGORIES.length) * 100),
    staleIndicatorCount,
    latestObservedAt,
    categories,
    indicators,
    aggregation: 'Equal category weights across categories with valid observations; each category is the mean of its latest observation per indicator. Missing categories are excluded, not treated as zero.',
  };
}

export function calculateEmi({ principal, annualRatePercent, tenureMonths, processingFeePercent = null, processingFeeINR = null }) {
  const amount = Number(principal);
  const annualRate = Number(annualRatePercent);
  const months = Number(tenureMonths);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(annualRate) || annualRate < 0
    || !Number.isInteger(months) || months < 1 || months > 600) throw new Error('Enter a positive loan amount, non-negative annual rate, and tenure from 1 to 600 months.');
  const hasFeeAmount = processingFeeINR != null && processingFeeINR !== '';
  const hasFeePercent = processingFeePercent != null && processingFeePercent !== '';
  const fixedFee = hasFeeAmount ? Number(processingFeeINR) : 0;
  const feePercent = hasFeePercent ? Number(processingFeePercent) : 0;
  if ((hasFeeAmount && (!Number.isFinite(fixedFee) || fixedFee < 0))
    || (hasFeePercent && (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100))) {
    throw new Error('Processing fees must be non-negative amounts or percentages no greater than 100.');
  }
  const monthlyRate = annualRate / 1200;
  const emi = monthlyRate === 0 ? amount / months : amount * monthlyRate * ((1 + monthlyRate) ** months) / (((1 + monthlyRate) ** months) - 1);
  const fee = hasFeeAmount || hasFeePercent ? fixedFee + (amount * feePercent / 100) : null;
  return {
    emiINR: emi,
    scheduledPaymentsINR: emi * months,
    interestINR: (emi * months) - amount,
    processingFeeINR: fee,
    totalWithKnownFeeINR: fee == null ? null : (emi * months) + fee,
    assumptions: 'Fixed monthly rate equal to annual nominal rate divided by 12; monthly reducing balance; equal payments; fees, insurance, taxes, floating-rate changes, and lender-specific rounding excluded unless entered.',
  };
}
