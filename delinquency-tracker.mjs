/**
 * Vesper · EMI / retail-loan delinquency tracker.
 *
 * What this module is
 * ───────────────────
 * A source-attributed archive of retail lending stress — EMI, card, auto,
 * mortgage, student-loan, and microfinance delinquency — plus the hourly
 * refresh engine that re-checks it.
 *
 * Two honesty rules are baked in, because delinquency is the easiest kind of
 * number to misread:
 *
 * 1. `flow` and `stock` are different quantities. The New York Fed's headline
 *    figure is the *flow* of balances newly transitioning into 90+ day
 *    delinquency (annualised), not the share of outstanding balances that is
 *    currently late. Vesper stores the metric kind and labels it in the UI.
 * 2. Figures read only from a search-index excerpt rather than a fetched
 *    report table are marked `confidence: 'excerpt'` and are rendered as
 *    unverified leads, never as confirmed data.
 *
 * Anything Vesper could not verify — including a separate Loan-Against-Property
 * (LAP) delinquency series and microfinance figures whose PDFs did not
 * extract — is reported as `not-available` with the reason and a pointer to the
 * publisher. Nothing is interpolated.
 *
 * Refresh cadence: publishers release monthly, quarterly, or half-yearly, so an
 * hourly check cannot invent a new value. The hourly loop re-checks configured
 * feeds and re-evaluates which release is next due; values change only when a
 * publisher actually releases one.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** The tracker re-checks its sources every hour. */
export const DELINQUENCY_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

/** The day the archive below was compiled. */
export const DELINQUENCY_SNAPSHOT_DATE = '2026-10-13';

/**
 * @typedef {'flow'|'stock'} MetricKind
 *   flow  = share of balances newly moving into the delinquency bucket
 *   stock = share of outstanding balances currently in that bucket
 * @typedef {'verified'|'excerpt'|'not-available'} Confidence
 */

/**
 * Publishers Vesper credits. `cadence` is what the publisher commits to, which
 * is why the hourly loop only re-checks rather than expecting new numbers.
 * @typedef {object} DelinquencySource
 * @property {string} id
 * @property {string} name
 * @property {string} url
 * @property {string} region
 * @property {'monthly'|'quarterly'|'half-yearly'|'annual'} cadence
 * @property {string} covers
 * @property {string} note
 */
export const DELINQUENCY_SOURCES = Object.freeze([
  { id: 'rbi-fsr-2024-06', name: 'Reserve Bank of India — Financial Stability Report, June 2024', url: 'https://www.rbi.org.in/Scripts/PublicationReportDetails.aspx?UrlPage=&ID=1269', region: 'India', cadence: 'half-yearly', covers: 'Retail-loan GNPA and SMA(1+2)', note: 'Released 27 June 2024. The RBI report page did not expose its tables as readable text during research, so figures attributed to it here are excerpt-only.' },
  { id: 'rbi-fsr-2024-12', name: 'Reserve Bank of India — Financial Stability Report, December 2024', url: 'https://www.rbi.org.in/Scripts/PublicationReportDetails.aspx?UrlPage=&ID=1284', region: 'India', cadence: 'half-yearly', covers: 'Unsecured lending GNPA', note: 'Released 30 December 2024.' },
  { id: 'rbi-fsr-2025-06', name: 'Reserve Bank of India — Financial Stability Report, June 2025', url: 'https://rbi.org.in/scripts/PublicationReportDetails.aspx?ID=1299', region: 'India', cadence: 'half-yearly', covers: 'Unsecured retail GNPA versus overall retail GNPA', note: 'Released 30 June 2025.' },
  { id: 'rbi-fsr-2025-12', name: 'Reserve Bank of India — Financial Stability Report, December 2025', url: 'https://m.rbi.org.in/Scripts/PublicationReportDetails.aspx?UrlPage=&ID=1313', region: 'India', cadence: 'half-yearly', covers: 'Financial stability review', note: 'Released 31 December 2025; no product-level delinquency row was readable here.' },
  { id: 'rbi-fsr-2026-06', name: 'Reserve Bank of India — Financial Stability Report, June 2026', url: 'https://m.rbi.org.in/Scripts/PublicationReportDetails.aspx?UrlPage=&ID=1325', region: 'India', cadence: 'half-yearly', covers: 'Financial stability review', note: 'Released 30 June 2026; the latest FSR in this archive.' },
  { id: 'mfin-micrometer', name: 'MFIN — Micrometer (microfinance)', url: 'https://mfinindia.org/assets/upload_image/publications/MicrometerSynopsis/Micrometer%20Q2_FY_25-26_Synopsis.pdf', region: 'India (microfinance)', cadence: 'quarterly', covers: 'MFI portfolio and delinquency', note: 'Q2 FY2025-26 synopsis reporting date is 30 September 2025. The PDF did not extract during research, so no microfinance percentage is archived.' },
  { id: 'nyfed-hhdc', name: 'Federal Reserve Bank of New York — Household Debt and Credit report', url: 'https://www.newyorkfed.org/microeconomics/hhdc/background.html', region: 'United States', cadence: 'quarterly', covers: 'Balances transitioning into 90+ day delinquency, and student-loan 90+ stock', note: 'The Flow into Serious Delinquency measure divides balances newly at least 90 days late by balances current or under 90 days late in the prior quarter, annualised.' },
  { id: 'nyfed-databank', name: 'New York Fed — Center for Microeconomic Data bank', url: 'https://www.newyorkfed.org/microeconomics/databank.html', region: 'United States', cadence: 'quarterly', covers: 'Underlying report data', note: 'The downloadable workbook behind the quarterly releases; use it for complete 30+/90+ series rather than reconstructing them from releases.' },
  { id: 'nyfed-faq', name: 'New York Fed — Household Debt FAQ', url: 'https://www.newyorkfed.org/microeconomics/faq', region: 'United States', cadence: 'annual', covers: 'Definitions and coverage limits', note: 'Explains that “other” includes consumer-finance loans and retail cards, that BNPL is included only where reported to bureaus, and that charged-off balances may remain in the 90+ measure.' },
  { id: 'fca-mortgage-q4-2025', name: 'FCA / Bank of England — Mortgage lending statistics, 2025 Q4', url: 'https://www.fca.org.uk/data/commentary-mortgage-lending-statistics-q4-2025', region: 'United Kingdom', cadence: 'quarterly', covers: 'Share of mortgage balances in arrears', note: 'Arrears here means missed payments equal to at least 1.5% of the outstanding balance, or a property in possession — not a universal 30+-days-late rate. Published 10 March 2026.' },
  { id: 'boe-credit-conditions', name: 'Bank of England — Credit Conditions Survey, 2025 Q3', url: 'https://www.bankofengland.co.uk/credit-conditions-survey/2025/2025-q3', region: 'United Kingdom', cadence: 'quarterly', covers: 'Lender-reported default directions', note: 'Net percentage balances from a lender survey, not a measured arrears rate. Published 16 October 2025.' },
  { id: 'ecb-ssm-2024-q4', name: 'ECB Banking Supervision — supervisory banking statistics, 2024 Q4', url: 'https://www.bankingsupervision.europa.eu/press/pr/date/2025/html/ssm.pr250320~d59cb011c5.en.html', region: 'Euro area', cadence: 'quarterly', covers: 'Household NPL ratio and Stage 2 share', note: 'Significant institutions only. Stage 2 means a significant increase in credit risk since origination — it is not an arrears bucket. Published 20 March 2025.' },
  { id: 'ecb-ssm-2025-q2', name: 'ECB Banking Supervision — supervisory banking statistics, 2025 Q2', url: 'https://www.bankingsupervision.europa.eu/press/pr/date/2025/html/ssm.pr250917~6554cd2316.en.html', region: 'Euro area', cadence: 'quarterly', covers: 'Household NPL ratio', note: 'Published 17 September 2025.' },
  { id: 'ecb-ssm-2025-q4', name: 'ECB Banking Supervision — supervisory banking statistics, 2025 Q4', url: 'https://www.bankingsupervision.europa.eu/press/pr/date/2026/html/ssm.pr260318~abe7a7cc0a.en.html', region: 'Euro area', cadence: 'quarterly', covers: 'Household NPL ratio and Stage 2 share', note: 'Published 18 March 2026.' },
  { id: 'cfpb-bnpl', name: 'Consumer Financial Protection Bureau — Buy Now, Pay Later market report', url: 'https://www.consumerfinance.gov/data-research/research-reports/the-buy-now-pay-later-market/', region: 'United States (BNPL)', cadence: 'annual', covers: 'Late-fee incidence and charge-off at six large BNPL lenders, 2019–2023', note: 'Published 10 December 2025. Late-fee incidence and charge-off are not the same as 30+ or 90+ delinquency, and the PDF did not extract, so its figures are excerpt-only leads.' },
  // ── Additional publishers Vesper can read once an authorised feed exists ──
  { id: 'rbi-credit-card-npa', name: 'RBI — credit card and personal-loan NPA by bank group', url: 'https://www.rbi.org.in/Scripts/AnnualPublications.aspx?head=Financial+Stability+Reports', region: 'India', cadence: 'half-yearly', covers: 'Credit-card and personal-loan GNPA by bank group', note: 'Product-level and bank-group tables were not readable during research; listed as a feed target rather than archived figures.' },
  { id: 'rbi-mfi-dataset', name: 'RBI — NBFC and MFI supervisory data', url: 'https://www.rbi.org.in/Scripts/NSDCS.aspx', region: 'India (microfinance)', cadence: 'quarterly', covers: 'NBFC-MFI portfolio and asset quality', note: 'Quarterly supervisory returns; no percentage was extracted here.' },
  { id: 'transunion-cibil', name: 'TransUnion CIBIL — market insights', url: 'https://www.transunioncibil.com/industry-insights', region: 'India', cadence: 'quarterly', covers: 'Retail credit origination and delinquency trends', note: 'Bureau commentary; definitions differ from RBI GNPA.' },
  { id: 'crisil-retail', name: 'CRISIL — retail loan asset quality', url: 'https://www.crisilratings.com/en/home/insights.html', region: 'India', cadence: 'quarterly', covers: 'Rating-agency view of retail and NBFC delinquency', note: 'Agency commentary and study findings, not a supervisory series.' },
  { id: 'icra-retail', name: 'ICRA — retail and microfinance asset quality', url: 'https://www.icra.in/research-updates', region: 'India', cadence: 'quarterly', covers: 'Rating-agency view of retail loan quality', note: 'Agency commentary; useful as a second opinion on RBI data.' },
  { id: 'fed-g19', name: 'Federal Reserve G.19 consumer credit', url: 'https://www.federalreserve.gov/releases/g19/current/', region: 'United States', cadence: 'monthly', covers: 'Monthly consumer credit levels and rates', note: 'Levels and interest rates rather than delinquency rates.' },
  { id: 'fed-sloos', name: 'Federal Reserve Senior Loan Officer Opinion Survey', url: 'https://www.federalreserve.gov/monetarypolicy/sloos.htm', region: 'United States', cadence: 'quarterly', covers: 'Lender-reported standards for consumer and credit-card loans', note: 'Survey of standards and demand, not a delinquency measurement.' },
  { id: 'cfpb-cfpb-data', name: 'CFPB consumer credit data publications', url: 'https://www.consumerfinance.gov/data-research/research-reports/', region: 'United States', cadence: 'annual', covers: 'BNPL, credit card, and installment lending research', note: 'Research reports; coverage and definitions vary by report.' },
  { id: 'boe-mortgage-stats', name: 'Bank of England — mortgage lending statistics', url: 'https://www.bankofengland.co.uk/statistics/mortgage-lenders-and-administrators', region: 'United Kingdom', cadence: 'quarterly', covers: 'Mortgage arrears and possessions', note: 'Joint FCA/BoE series; arrears use the 1.5%-of-balance definition.' },
  { id: 'ecb-mfi-stats', name: 'ECB monetary financial statistics', url: 'https://www.ecb.europa.eu/stats/money_and_credit/mfi_statistics/html/index.en.html', region: 'Euro area', cadence: 'monthly', covers: 'Household credit stocks and rates', note: 'Volumes and rates; delinquency comes from supervisory statistics.' },
  { id: 'world-bank-findex', name: 'World Bank Global Findex', url: 'https://www.worldbank.org/en/publication/globalfindex', region: 'Global', cadence: 'annual', covers: 'Household borrowing and account indicators across economies', note: 'Survey-based, roughly every three years; not a delinquency series.' },
  { id: 'oecd-household-debt', name: 'OECD household debt indicators', url: 'https://data-explorer.oecd.org/vis?df[ds]=DisseminateFinalDMZ&df[id]=DSD_AN_HOUSEHOLD_DEBT%40DF_HOUSEHOLD_DEBT', region: 'OECD', cadence: 'annual', covers: 'Cross-country household debt ratios', note: 'Ratios rather than delinquency rates; useful for context.' },
]);

export const DELINQUENCY_SOURCE_BY_ID = new Map(DELINQUENCY_SOURCES.map((source) => [source.id, source]));

/** Publisher release links for the quarterly New York Fed reports cited below. */
const NYFED_RELEASES = {
  '2024-Q3': 'https://www.newyorkfed.org/newsevents/news/research/2024/20241113',
  '2025-Q1': 'https://www.newyorkfed.org/newsevents/news/research/2025/20250513',
  '2025-Q3': 'https://www.newyorkfed.org/newsevents/news/research/2025/20251105',
  '2025-Q4': 'https://www.newyorkfed.org/newsevents/news/research/2026/20260210',
  '2026-Q1': 'https://www.newyorkfed.org/newsevents/news/research/2026/20260512',
  '2026-Q2': 'https://www.newyorkfed.org/newsevents/news/research/2026/20260811',
};

/**
 * Instruments (a jurisdiction + loan product + metric) the tracker reports on.
 * @typedef {object} DelinquencyInstrument
 * @property {string} key
 * @property {string} label
 * @property {string} region
 * @property {string} product     credit-card | auto-loan | mortgage | student-loan | personal-loan | lap-loan | microfinance | bnpl | retail-portfolio
 * @property {MetricKind} kind
 * @property {string} threshold   human description of the delinquency bucket
 * @property {string} sourceId
 */
export const DELINQUENCY_INSTRUMENTS = Object.freeze([
  { key: 'us-mortgage-90-flow', label: 'Mortgages · flow into 90+ days', region: 'United States', product: 'mortgage', kind: 'flow', threshold: 'Newly 90+ days late, annualised', sourceId: 'nyfed-hhdc' },
  { key: 'us-auto-90-flow', label: 'Auto loans · flow into 90+ days', region: 'United States', product: 'auto-loan', kind: 'flow', threshold: 'Newly 90+ days late, annualised', sourceId: 'nyfed-hhdc' },
  { key: 'us-card-90-flow', label: 'Credit cards · flow into 90+ days', region: 'United States', product: 'credit-card', kind: 'flow', threshold: 'Newly 90+ days late, annualised', sourceId: 'nyfed-hhdc' },
  { key: 'us-card-30-flow', label: 'Credit cards · flow into 30+ days', region: 'United States', product: 'credit-card', kind: 'flow', threshold: 'Newly 30+ days late, annualised', sourceId: 'nyfed-hhdc' },
  { key: 'us-student-90-flow', label: 'Student loans · flow into 90+ days', region: 'United States', product: 'student-loan', kind: 'flow', threshold: 'Newly 90+ days late, annualised', sourceId: 'nyfed-hhdc' },
  { key: 'us-student-90-stock', label: 'Student loans · balance 90+ days late', region: 'United States', product: 'student-loan', kind: 'stock', threshold: 'Share of outstanding balances', sourceId: 'nyfed-hhdc' },
  { key: 'uk-mortgage-arrears', label: 'Mortgages · balances in arrears', region: 'United Kingdom', product: 'mortgage', kind: 'stock', threshold: 'Missed payments ≥ 1.5% of balance, or possession', sourceId: 'fca-mortgage-q4-2025' },
  { key: 'eu-household-npl', label: 'Households · non-performing loans', region: 'Euro area', product: 'retail-portfolio', kind: 'stock', threshold: 'NPL ratio, significant institutions', sourceId: 'ecb-ssm-2025-q4' },
  { key: 'eu-household-stage2', label: 'Households · Stage 2 share', region: 'Euro area', product: 'retail-portfolio', kind: 'stock', threshold: 'Significant increase in credit risk', sourceId: 'ecb-ssm-2025-q4' },
  { key: 'in-retail-gnpa', label: 'Retail portfolio · GNPA', region: 'India', product: 'retail-portfolio', kind: 'stock', threshold: 'Gross non-performing assets', sourceId: 'rbi-fsr-2024-06' },
  { key: 'in-retail-sma', label: 'Retail portfolio · SMA-1 + SMA-2', region: 'India', product: 'retail-portfolio', kind: 'stock', threshold: 'Special mention accounts (1 and 2 combined)', sourceId: 'rbi-fsr-2024-06' },
  { key: 'in-unsecured-gnpa', label: 'Unsecured lending · GNPA', region: 'India', product: 'personal-loan', kind: 'stock', threshold: 'Gross non-performing assets', sourceId: 'rbi-fsr-2024-12' },
  { key: 'in-lap-loan-delinquency', label: 'Loan against property · delinquency', region: 'India', product: 'lap-loan', kind: 'stock', threshold: 'Product-level delinquency', sourceId: 'rbi-fsr-2026-06' },
  { key: 'in-microfinance-delinquency', label: 'Microfinance · delinquency', region: 'India (microfinance)', product: 'microfinance', kind: 'stock', threshold: 'Portfolio delinquency', sourceId: 'mfin-micrometer' },
  { key: 'us-bnpl-latefee', label: 'Buy now, pay later · loans assessed a late fee', region: 'United States (BNPL)', product: 'bnpl', kind: 'stock', threshold: 'Late-fee incidence', sourceId: 'cfpb-bnpl' },
]);

export const DELINQUENCY_INSTRUMENT_BY_KEY = new Map(DELINQUENCY_INSTRUMENTS.map((instrument) => [instrument.key, instrument]));

/**
 * Verified and excerpt-only observations. `value` is the percentage exactly as
 * published; `confidence` says whether Vesper read it in a fetched report table
 * (`verified`) or only in a search-index excerpt of the publisher's own file
 * (`excerpt`).
 * @typedef {object} DelinquencyObservation
 * @property {string} key
 * @property {string} period   e.g. `2025-Q4`, `2024-06`, or a year
 * @property {number} value    percent
 * @property {'percent'} unit
 * @property {Confidence} confidence
 * @property {string} sourceId
 * @property {string} sourceUrl
 * @property {string} note
 */
export const DELINQUENCY_OBSERVATIONS = Object.freeze([
  // ── United States · New York Fed flow into serious delinquency (90+) ───────
  { key: 'us-mortgage-90-flow', period: '2024-Q3', value: 1.08, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2024-Q3'], note: 'Published 13 November 2024.' },
  { key: 'us-auto-90-flow', period: '2024-Q3', value: 2.90, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2024-Q3'], note: 'Published 13 November 2024.' },
  { key: 'us-card-90-flow', period: '2024-Q3', value: 7.10, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2024-Q3'], note: 'Published 13 November 2024.' },
  { key: 'us-card-30-flow', period: '2024-Q3', value: 8.80, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2024-Q3'], note: 'Reported as down from 9.1% in 2024 Q2.' },
  { key: 'us-student-90-flow', period: '2024-Q3', value: 0.77, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2024-Q3'], note: 'Pre-reinstatement level; compare with the 2025-2026 figures, which reflect previously unreported federal-loan delinquencies.' },

  { key: 'us-mortgage-90-flow', period: '2025-Q1', value: 1.22, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q1'], note: 'Published 13 May 2025.' },
  { key: 'us-auto-90-flow', period: '2025-Q1', value: 2.94, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q1'], note: 'Published 13 May 2025.' },
  { key: 'us-card-90-flow', period: '2025-Q1', value: 7.04, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q1'], note: 'Published 13 May 2025.' },
  { key: 'us-student-90-flow', period: '2025-Q1', value: 8.04, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q1'], note: 'Jump reflects federal student-loan delinquencies reappearing in credit reports after the reporting pause.' },

  { key: 'us-mortgage-90-flow', period: '2025-Q3', value: 1.28, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q3'], note: 'Published 5 November 2025.' },
  { key: 'us-auto-90-flow', period: '2025-Q3', value: 2.99, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q3'], note: 'Published 5 November 2025.' },
  { key: 'us-card-90-flow', period: '2025-Q3', value: 7.05, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q3'], note: 'Published 5 November 2025.' },
  { key: 'us-student-90-flow', period: '2025-Q3', value: 14.26, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q3'], note: 'Published 5 November 2025.' },
  { key: 'us-student-90-stock', period: '2025-Q3', value: 9.40, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q3'], note: 'Share of student-loan balances already 90+ days delinquent.' },

  { key: 'us-mortgage-90-flow', period: '2025-Q4', value: 1.38, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q4'], note: 'Published 10 February 2026.' },
  { key: 'us-auto-90-flow', period: '2025-Q4', value: 2.95, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q4'], note: 'Published 10 February 2026.' },
  { key: 'us-card-90-flow', period: '2025-Q4', value: 7.13, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q4'], note: 'Published 10 February 2026.' },
  { key: 'us-student-90-flow', period: '2025-Q4', value: 16.19, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q4'], note: 'Published 10 February 2026.' },
  { key: 'us-student-90-stock', period: '2025-Q4', value: 9.60, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2025-Q4'], note: 'Share of student-loan balances already 90+ days delinquent.' },

  { key: 'us-mortgage-90-flow', period: '2026-Q1', value: 1.48, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q1'], note: 'Published 12 May 2026.' },
  { key: 'us-auto-90-flow', period: '2026-Q1', value: 2.97, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q1'], note: 'Published 12 May 2026.' },
  { key: 'us-card-90-flow', period: '2026-Q1', value: 7.10, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q1'], note: 'Published 12 May 2026.' },
  { key: 'us-card-30-flow', period: '2026-Q1', value: 8.60, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q1'], note: 'Reported as easing from 8.7%.' },
  { key: 'us-student-90-flow', period: '2026-Q1', value: 10.86, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q1'], note: 'Published 12 May 2026.' },
  { key: 'us-student-90-stock', period: '2026-Q1', value: 10.30, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q1'], note: 'Share of student-loan balances already 90+ days delinquent.' },

  { key: 'us-mortgage-90-flow', period: '2026-Q2', value: 1.52, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q2'], note: 'Published 11 August 2026.' },
  { key: 'us-auto-90-flow', period: '2026-Q2', value: 3.00, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q2'], note: 'Published 11 August 2026.' },
  { key: 'us-card-90-flow', period: '2026-Q2', value: 6.97, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q2'], note: 'Published 11 August 2026.' },
  { key: 'us-student-90-flow', period: '2026-Q2', value: 7.83, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q2'], note: 'Published 11 August 2026.' },
  { key: 'us-student-90-stock', period: '2026-Q2', value: 10.20, unit: 'percent', confidence: 'verified', sourceId: 'nyfed-hhdc', sourceUrl: NYFED_RELEASES['2026-Q2'], note: 'Share of student-loan balances already 90+ days delinquent.' },

  // ── United Kingdom ─────────────────────────────────────────────────────────
  { key: 'uk-mortgage-arrears', period: '2025-Q4', value: 1.20, unit: 'percent', confidence: 'verified', sourceId: 'fca-mortgage-q4-2025', sourceUrl: 'https://www.fca.org.uk/data/commentary-mortgage-lending-statistics-q4-2025', note: 'Unchanged quarter on quarter and 0.1 percentage point lower year on year.' },

  // ── Euro area ──────────────────────────────────────────────────────────────
  { key: 'eu-household-npl', period: '2024-Q4', value: 2.23, unit: 'percent', confidence: 'verified', sourceId: 'ecb-ssm-2024-q4', sourceUrl: 'https://www.bankingsupervision.europa.eu/press/pr/date/2025/html/ssm.pr250320~d59cb011c5.en.html', note: 'Significant institutions, loans to households.' },
  { key: 'eu-household-stage2', period: '2024-Q4', value: 9.64, unit: 'percent', confidence: 'verified', sourceId: 'ecb-ssm-2024-q4', sourceUrl: 'https://www.bankingsupervision.europa.eu/press/pr/date/2025/html/ssm.pr250320~d59cb011c5.en.html', note: 'Stage 2 is not an arrears bucket.' },
  { key: 'eu-household-npl', period: '2025-Q2', value: 2.16, unit: 'percent', confidence: 'verified', sourceId: 'ecb-ssm-2025-q2', sourceUrl: 'https://www.bankingsupervision.europa.eu/press/pr/date/2025/html/ssm.pr250917~6554cd2316.en.html', note: 'Published 17 September 2025.' },
  { key: 'eu-household-npl', period: '2025-Q4', value: 2.11, unit: 'percent', confidence: 'verified', sourceId: 'ecb-ssm-2025-q4', sourceUrl: 'https://www.bankingsupervision.europa.eu/press/pr/date/2026/html/ssm.pr260718~abe7a7cc0a.en.html', note: 'Published 18 March 2026.' },
  { key: 'eu-household-stage2', period: '2025-Q4', value: 9.03, unit: 'percent', confidence: 'verified', sourceId: 'ecb-ssm-2025-q4', sourceUrl: 'https://www.bankingsupervision.europa.eu/press/pr/date/2026/html/ssm.pr260718~abe7a7cc0a.en.html', note: 'Published 18 March 2026.' },

  // ── India · RBI Financial Stability Report (excerpt-only) ─────────────────
  { key: 'in-retail-gnpa', period: '2024-06', value: 1.50, unit: 'percent', confidence: 'excerpt', sourceId: 'rbi-fsr-2024-06', sourceUrl: 'https://www.fidcindia.org.in/wp-content/uploads/2019/06/RBI_FSR_JUNE_2024_27_06_24.pdf', note: 'Read only in a search-index excerpt of a republished RBI FSR file; the RBI report page itself did not expose the table. Treat as a lead to confirm.' },
  { key: 'in-retail-sma', period: '2024-06', value: 2.10, unit: 'percent', confidence: 'excerpt', sourceId: 'rbi-fsr-2024-06', sourceUrl: 'https://www.fidcindia.org.in/wp-content/uploads/2019/06/RBI_FSR_JUNE_2024_27_06_24.pdf', note: 'Combined SMA-1 and SMA-2, not SMA-2 alone, and excerpt-only.' },
  { key: 'in-unsecured-gnpa', period: '2024-12', value: 1.70, unit: 'percent', confidence: 'excerpt', sourceId: 'rbi-fsr-2024-12', sourceUrl: 'https://www.rbi.org.in/Scripts/PublicationReportDetails.aspx?UrlPage=&ID=1284', note: 'Excerpt-only, from the December 2024 FSR indexed excerpt.' },
  { key: 'in-unsecured-gnpa', period: '2025-06', value: 1.80, unit: 'percent', confidence: 'excerpt', sourceId: 'rbi-fsr-2025-06', sourceUrl: 'https://rbi.org.in/scripts/PublicationReportDetails.aspx?ID=1299', note: 'Excerpt-only. The same excerpt reports overall retail GNPA of 1.2% at March 2025.' },
  { key: 'in-retail-gnpa', period: '2025-03', value: 1.20, unit: 'percent', confidence: 'excerpt', sourceId: 'rbi-fsr-2025-06', sourceUrl: 'https://rbi.org.in/scripts/PublicationReportDetails.aspx?ID=1299', note: 'Overall retail GNPA at March 2025, quoted in the June 2025 FSR indexed excerpt.' },

  // ── United States · BNPL (excerpt-only leads) ─────────────────────────────
  { key: 'us-bnpl-latefee', period: '2022', value: 5.20, unit: 'percent', confidence: 'excerpt', sourceId: 'cfpb-bnpl', sourceUrl: 'https://files.consumerfinance.gov/f/documents/cfpb_bnpl-market-report_2025-12.pdf', note: 'Loans assessed a late fee. Read in a search-index excerpt; the CFPB PDF did not extract.' },
  { key: 'us-bnpl-latefee', period: '2023', value: 4.10, unit: 'percent', confidence: 'excerpt', sourceId: 'cfpb-bnpl', sourceUrl: 'https://files.consumerfinance.gov/documents/cfpb_bnpl-market-report_2025-12.pdf', note: 'Loans assessed a late fee, excerpt-only.' },
]);

/** Periods that look like `YYYY-Qn`, sorted oldest first. */
function periodRank(period) {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarter) return Number(quarter[1]) * 10 + Number(quarter[2]);
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) return Number(month[1]) * 10 + Math.ceil(Number(month[2]) / 3);
  const year = /^(\d{4})$/.exec(period);
  if (year) return Number(year[1]) * 10 + 4;
  return 0;
}

/** Every observation for one instrument, oldest first. */
export function seriesHistory(key) {
  return DELINQUENCY_OBSERVATIONS.filter((observation) => observation.key === key)
    .slice()
    .sort((a, b) => periodRank(a.period) - periodRank(b.period));
}

/** Latest observation for an instrument, or a not-available result with the reason. */
export function latestObservation(key) {
  const instrument = DELINQUENCY_INSTRUMENT_BY_KEY.get(key);
  if (!instrument) return { available: false, reason: `Unknown instrument “${key}”.`, instrument: null, observation: null, source: null };
  const history = seriesHistory(key);
  if (!history.length) {
    return {
      available: false,
      reason: instrument.product === 'lap-loan'
        ? 'No published product-level delinquency series for loans against property was readable in the reviewed RBI publications. Add a dated, sourced figure from your own consented source to fill it in.'
        : instrument.product === 'microfinance'
          ? 'The MFIN Micrometer PDF did not extract, so microfinance delinquency is not archived. Add a dated, sourced figure to fill it in.'
          : 'No published figure for this instrument was verifiable in the sources reviewed.',
      instrument,
      observation: null,
      source: DELINQUENCY_SOURCE_BY_ID.get(instrument.sourceId) || null,
    };
  }
  const observation = history.at(-1);
  return { available: true, instrument, observation, source: DELINQUENCY_SOURCE_BY_ID.get(observation.sourceId) || null, reason: '' };
}

/** Change between the two most recent observations, in percentage points. */
export function latestChange(key) {
  const history = seriesHistory(key);
  if (history.length < 2) return null;
  const latest = history.at(-1);
  const previous = history.at(-2);
  return { from: previous, to: latest, deltaPoints: Number((latest.value - previous.value).toFixed(2)) };
}

/** Group the instrument board by region for the terminal table. */
export function delinquencyBoard() {
  const regions = new Map();
  for (const instrument of DELINQUENCY_INSTRUMENTS) {
    if (!regions.has(instrument.region)) regions.set(instrument.region, []);
    const latest = latestObservation(instrument.key);
    const change = latestChange(instrument.key);
    regions.get(instrument.region).push({
      instrument,
      ...latest,
      change,
      history: seriesHistory(instrument.key),
      excerptOnly: latest.available && latest.observation.confidence === 'excerpt',
    });
  }
  return [...regions.entries()].map(([region, rows]) => ({ region, rows }));
}

/**
 * When each publisher is next expected to release, and what the hourly loop can
 * realistically achieve. Used by the UI's refresh panel and asserted in tests.
 */
export function refreshPlan({ now = Date.now() } = {}) {
  const lastCheckedAt = new Date(now).toISOString();
  const nextCheckAt = new Date(now + DELINQUENCY_REFRESH_INTERVAL_MS).toISOString();
  return {
    refreshIntervalMs: DELINQUENCY_REFRESH_INTERVAL_MS,
    refreshIntervalLabel: 'every hour',
    lastCheckedAt,
    nextCheckAt,
    publishers: DELINQUENCY_SOURCES.map((source) => ({
      id: source.id,
      name: source.name,
      region: source.region,
      cadence: source.cadence,
      url: source.url,
    })),
    note: 'Publishers release monthly, quarterly, or half-yearly, so an hourly check re-verifies and re-reads feeds; the numbers change only when a publisher releases a new one. Vesper never extrapolates a rate between releases.',
  };
}

/** Coverage summary: verified, excerpt-only, and missing series. */
export function delinquencySummary() {
  const totals = { instruments: DELINQUENCY_INSTRUMENTS.length, observations: DELINQUENCY_OBSERVATIONS.length, verified: 0, excerpt: 0, missing: 0, sources: DELINQUENCY_SOURCES.length };
  for (const observation of DELINQUENCY_OBSERVATIONS) {
    if (observation.confidence === 'verified') totals.verified += 1;
    else totals.excerpt += 1;
  }
  for (const instrument of DELINQUENCY_INSTRUMENTS) if (!seriesHistory(instrument.key).length) totals.missing += 1;
  return { ...totals, snapshotDate: DELINQUENCY_SNAPSHOT_DATE };
}

/** Credit list: every publisher, with how many entries it contributed. */
export function delinquencySourceCredits() {
  const counts = new Map();
  for (const observation of DELINQUENCY_OBSERVATIONS) counts.set(observation.sourceId, (counts.get(observation.sourceId) || 0) + 1);
  return DELINQUENCY_SOURCES.map((source) => ({
    ...source,
    observations: counts.get(source.id) || 0,
    contributed: (counts.get(source.id) || 0) > 0,
  })).sort((a, b) => b.observations - a.observations || a.name.localeCompare(b.name));
}

/**
 * The hourly refresh engine.
 *
 * It keeps a persisted ledger of checks and any user-supplied, source-attributed
 * observations, and re-runs on a one-hour cadence. If `fetchRows` is supplied it
 * is called on every tick; the default does nothing, because Vesper ships no
 * scraper and the reviewed publishers publish at most monthly.
 *
 * @param {object} options
 * @param {string} options.dataPath  JSON ledger path
 * @param {() => Promise<Array<object>>} [options.fetchRows]  authorised feed reader
 * @param {() => number} [options.now]
 * @param {(error: Error) => void} [options.logError]
 */
export async function createDelinquencyTracker({
  dataPath,
  fetchRows = null,
  now = () => Date.now(),
  logError = (error) => console.error('Delinquency refresh failed:', error),
} = {}) {
  if (!dataPath) throw new Error('Delinquency tracker needs a ledger path.');
  const stored = await readFile(dataPath, 'utf8').catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)));
  const ledger = stored == null
    ? { schemaVersion: 1, checks: [], observations: [], lastRefreshAt: null }
    : JSON.parse(stored);
  if (!ledger || typeof ledger !== 'object' || ledger.schemaVersion !== 1 || !Array.isArray(ledger.checks) || !Array.isArray(ledger.observations)) {
    throw new Error('Delinquency ledger is corrupt or has an unsupported schema.');
  }

  let timer = null;
  let inflight = null;
  let lastManualAt = 0;

  async function persist() {
    await mkdir(dirname(dataPath), { recursive: true });
    const tempPath = `${dataPath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(ledger)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, dataPath);
  }

  /** Accept user-supplied figures; they must be sourced and dated. */
  function normalizeObservation(raw) {
    const key = String(raw?.key || '');
    const instrument = DELINQUENCY_INSTRUMENT_BY_KEY.get(key);
    if (!instrument) throw new Error('Choose a known delinquency instrument for each observation.');
    const value = Number(raw?.value);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('A delinquency rate must be a percentage between 0 and 100.');
    const period = String(raw?.period || '').trim();
    if (!/^\d{4}(-\d{2}|-Q[1-4])?$/.test(period)) throw new Error('Each observation needs a period like 2026-Q1, 2026-03, or 2026.');
    const source = String(raw?.source || '').trim();
    const sourceUrl = String(raw?.sourceUrl || '').trim();
    if (!source) throw new Error('Each observation needs the publisher it came from.');
    if (sourceUrl) {
      let parsed;
      try { parsed = new URL(sourceUrl); } catch { throw new Error('Source URL must be a valid HTTPS URL.'); }
      if (parsed.protocol !== 'https:') throw new Error('Source URLs must use HTTPS.');
    }
    return { key, product: instrument.product, region: instrument.region, period, value, unit: 'percent', source, sourceUrl, note: String(raw?.note || '').slice(0, 300), addedAt: new Date(now()).toISOString() };
  }

  async function refresh({ manual = false } = {}) {
    if (inflight) return inflight;
    if (manual && now() - lastManualAt < 60_000) return { ok: false, rateLimited: true, message: 'Wait one minute before requesting another manual check.' };
    if (manual) lastManualAt = now();
    inflight = (async () => {
      const checkedAt = new Date(now()).toISOString();
      let fetched = 0;
      let error = '';
      if (typeof fetchRows === 'function') {
        try {
          const rows = await fetchRows();
          for (const row of Array.isArray(rows) ? rows : []) {
            try { ledger.observations.push(normalizeObservation(row)); fetched += 1; }
            catch (rowError) { error = rowError.message; }
          }
        } catch (fetchError) {
          error = fetchError instanceof Error ? fetchError.message.slice(0, 300) : 'Feed error.';
          logError(fetchError instanceof Error ? fetchError : new Error(String(fetchError)));
        }
      }
      ledger.checks.push({ checkedAt, fetched, error });
      if (ledger.checks.length > 500) ledger.checks.splice(0, ledger.checks.length - 500);
      ledger.lastRefreshAt = checkedAt;
      await persist();
      return {
        ok: !error,
        checkedAt,
        fetched,
        error,
        message: typeof fetchRows === 'function'
          ? `Checked configured sources; accepted ${fetched} new sourced figure(s).`
          : 'Checked on the hourly cadence. No authorised feed is configured, so the archive is unchanged.',
      };
    })().finally(() => { inflight = null; });
    return inflight;
  }

  return {
    async start() {
      if (timer) return;
      timer = setInterval(() => { void refresh().catch(logError); }, DELINQUENCY_REFRESH_INTERVAL_MS);
      timer.unref?.();
      await refresh().catch(logError);
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
    refresh,
    async addObservations(rows) {
      if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('Add between 1 and 500 sourced observations at a time.');
      const normalized = rows.map(normalizeObservation);
      ledger.observations.push(...normalized);
      return persist().then(() => normalized.length);
    },
    getStatus() {
      const plan = refreshPlan({ now: now() });
      return {
        schemaVersion: 1,
        refreshIntervalMs: DELINQUENCY_REFRESH_INTERVAL_MS,
        lastRefreshAt: ledger.lastRefreshAt,
        nextRefreshAt: ledger.lastRefreshAt ? new Date(Date.parse(ledger.lastRefreshAt) + DELINQUENCY_REFRESH_INTERVAL_MS).toISOString() : plan.nextCheckAt,
        hasAuthorisedFeed: typeof fetchRows === 'function',
        checks: ledger.checks.slice(-20),
        userObservations: ledger.observations.slice(-200),
        summary: delinquencySummary(),
        plan,
        board: delinquencyBoard(),
        credits: delinquencySourceCredits(),
      };
    },
  };
}
