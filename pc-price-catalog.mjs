/**
 * Vesper · India PC-parts price tracker catalogue.
 *
 * Product launch-month and launchINR fields are approximate catalogue metadata, not price observations.
 * The tracker never uses them to fill historical gaps or to create forecasts. History and optional
 * estimates are calculated only from dated, source-attributed observations.
 *
 * Edit the catalogue freely: add a part with p(...). `all` patterns must ALL match a listing title,
 * `none` patterns must NOT. Titles are matched case-insensitively with HTML entities decoded.
 */

export const CATEGORIES = [
  ['cpu', 'Processors'], ['gpu', 'Graphics cards'], ['motherboard', 'Motherboards'], ['memory', 'Memory'],
  ['storage', 'Storage'], ['psu', 'Power supplies'], ['cooler', 'CPU coolers'], ['fans', 'Case fans'], ['monitor', 'Monitors'],
  ['case', 'Cases'], ['keyboard', 'Keyboards'], ['mouse', 'Mice'], ['headset', 'Headsets & speakers'],
  ['ups', 'UPS & surge protection'], ['network', 'Networking & expansion'],
];

/**
 * Market-regime index per quarter, Q1 2020 -> Q4 2026 (28 values, Q1 2020 = 1.00).
 * Legacy, unverified shape metadata retained for catalogue compatibility only. It is not used by
 * the tracker, calculations, history view, or forecast feature.
 */
export const REGIME = {
  cpu: [1, 1, 1, 1, 1.03, 1.12, 1.22, 1.18, 1.08, 1, 0.95, 0.92, 0.9, 0.88, 0.88, 0.9, 0.9, 0.9, 0.9, 0.9, 0.92, 0.95, 0.97, 1.02, 1.08, 1.12, 1.14, 1.15],
  gpu: [1, 1, 1, 1.05, 1.35, 1.75, 1.85, 1.7, 1.45, 1.15, 0.95, 0.9, 0.88, 0.85, 0.83, 0.82, 0.82, 0.82, 0.8, 0.8, 0.88, 0.92, 0.95, 1.1, 1.35, 1.5, 1.55, 1.6],
  motherboard: [1, 1, 1, 1, 1.05, 1.15, 1.2, 1.2, 1.15, 1.05, 1, 0.98, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1, 1.02, 1.05, 1.1, 1.15, 1.18, 1.2, 1.2],
  memory: [1, 1, 1, 1, 1.1, 1.25, 1.3, 1.25, 1.1, 0.95, 0.8, 0.7, 0.65, 0.65, 0.7, 0.8, 0.85, 0.9, 0.9, 0.9, 0.9, 0.9, 1.1, 1.9, 2.6, 2.9, 2.9, 2.8],
  storage: [1, 0.95, 0.9, 0.9, 0.95, 1, 1.05, 1.05, 0.95, 0.8, 0.65, 0.6, 0.5, 0.45, 0.5, 0.6, 0.7, 0.75, 0.75, 0.75, 0.75, 0.75, 0.9, 1.2, 1.8, 2.2, 2.3, 2.3],
  hdd: [1, 1, 1, 1, 1.05, 1.1, 1.1, 1.1, 1.05, 1, 1, 1, 0.97, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.97, 1, 1.05, 1.1, 1.2, 1.35, 1.45, 1.5, 1.5],
  psu: [1, 1, 1, 1, 1.05, 1.15, 1.2, 1.2, 1.15, 1.05, 1, 1, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 1, 1, 1, 1.02, 1.05, 1.1, 1.1, 1.1],
  cooler: [1, 1, 1, 1, 1.03, 1.08, 1.1, 1.08, 1.05, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.02, 1.04, 1.05, 1.05, 1.05],
  fans: [1, 1, 1, 1, 1.03, 1.08, 1.1, 1.08, 1.05, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.02, 1.04, 1.05, 1.05, 1.05],
  monitor: [1, 1, 1, 1, 1.05, 1.15, 1.15, 1.1, 1.05, 1, 0.95, 0.92, 0.9, 0.9, 0.9, 0.9, 0.88, 0.88, 0.88, 0.88, 0.9, 0.9, 0.92, 0.95, 1, 1.02, 1.03, 1.03],
};

/** Titles that are never a bare component (pre-built PCs, laptops, bundles, used stock). */
export const GLOBAL_NONE = /\b(gaming\s*pc|desktop\s*pc|pre-?built|laptop|notebook|combo|bundle|refurbished|renewed|used|open[-\s]?box|mini\s*pc|all[-\s]?in[-\s]?one|workstation\s*pc|assembled|gift\s*card)\b/i;

/** Extra exclusions per category. */
export const CATEGORY_NONE = {
  cpu: /(cooler|\bfan\b|thermal|paste|bracket|motherboard|mobile|retention|contact\s*frame)/i,
  gpu: /(bracket|riser|cable|water\s*block|waterblock|backplate|holder|stand|sag|extension|adapter|cooler\s*only|fan\s*kit)/i,
  motherboard: /(cooler|\bram\b|processor|bracket|server|rack)/i,
  memory: /(so-?dimm|laptop|notebook|\becc\b|server|rdimm|usb|pen\s*drive|flash|memory\s*card|sd\s*card|micro\s*sd)/i,
  storage: /(external|portable|enclosure|caddy|usb|adapter|dock|pen\s*drive|memory\s*card|\bnas\b\s*drive)/i,
  psu: /(adapter|charger|inverter|\bups\b|cable|extension|tester|sleeved|splitter|battery)/i,
  cooler: /(fan\s*only|thermal\s*paste|mounting\s*kit|bracket|backplate|replacement)/i,
  fans: /(controller|hub|splitter|cable)/i,
  monitor: /(\btv\b|projector|\barm\b|\bstand\b|mount|cable|portable|speaker|stylus)/i,
};

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const re = (patterns = []) => patterns.map((pattern) => new RegExp(pattern, 'i'));

/**
 * p(category, brand, name, launch 'YYYY-MM', launchINR, options)
 *  launchINR: typical street price (₹) in the launch month; q: retailer search words;
 *  all/none: title rules; spec: planner compatibility fields; reg: regime override; dep: lifecycle drop.
 */
function p(cat, brand, name, launch, launchINR, o = {}) {
  return { id: `${cat}-${slug(name)}`, cat, brand, name, launch, launchINR, q: o.q || name, all: re(o.all), none: re(o.none), spec: o.spec || {}, reg: o.reg, dep: o.dep, note: o.note || '' };
}

const AM4 = { socket: 'AM4', memoryTypes: ['DDR4'], powerW: 65 };
const AM5 = { socket: 'AM5', memoryTypes: ['DDR5'], powerW: 65 };
const L1200 = { socket: 'LGA1200', memoryTypes: ['DDR4'], powerW: 65 };
const L1700 = { socket: 'LGA1700', memoryTypes: ['DDR4', 'DDR5'], powerW: 65 };

export const PARTS = [
  // ── Processors ──────────────────────────────────────────────────────────────
  p('cpu', 'AMD', 'Ryzen 5 3600', '2019-07', 16500, { q: 'ryzen 5 3600', all: ['ryzen\\s*5\\s*3600\\b'], none: ['3600x', '3600xt'], spec: AM4 }),
  p('cpu', 'AMD', 'Ryzen 5 5600X', '2020-11', 31000, { q: 'ryzen 5 5600', all: ['ryzen\\s*5\\s*5600x\\b'], spec: AM4 }),
  p('cpu', 'AMD', 'Ryzen 5 5600', '2022-04', 17500, { q: 'ryzen 5 5600', all: ['ryzen\\s*5\\s*5600\\b'], none: ['5600x', '5600g', '5600gt', '5600t'], spec: AM4 }),
  p('cpu', 'AMD', 'Ryzen 7 5700X', '2022-04', 27000, { q: 'ryzen 7 5700x', all: ['ryzen\\s*7\\s*5700x\\b'], none: ['5700x3d'], spec: AM4 }),
  p('cpu', 'AMD', 'Ryzen 7 5800X3D', '2022-04', 42000, { q: 'ryzen 7 5800x3d', all: ['5800x3d'], spec: { ...AM4, powerW: 105 } }),
  p('cpu', 'AMD', 'Ryzen 5 7600', '2022-09', 28000, { q: 'ryzen 5 7600', all: ['ryzen\\s*5\\s*7600\\b'], none: ['7600x', '7600x3d'], spec: AM5 }),
  p('cpu', 'AMD', 'Ryzen 7 7800X3D', '2023-04', 45000, { q: 'ryzen 7 7800x3d', all: ['7800x3d'], spec: { ...AM5, powerW: 120 } }),
  p('cpu', 'AMD', 'Ryzen 5 9600X', '2024-08', 30000, { q: 'ryzen 5 9600x', all: ['ryzen\\s*5\\s*9600x\\b'], spec: AM5 }),
  p('cpu', 'AMD', 'Ryzen 7 9800X3D', '2024-11', 52000, { q: 'ryzen 7 9800x3d', all: ['9800x3d'], spec: { ...AM5, powerW: 120 } }),
  p('cpu', 'Intel', 'Core i3-10100F', '2020-05', 6500, { q: 'i3 10100f', all: ['i3[-\\s]*10100f\\b'], spec: L1200 }),
  p('cpu', 'Intel', 'Core i5-10400F', '2020-05', 12500, { q: 'i5 10400f', all: ['i5[-\\s]*10400f\\b'], spec: L1200 }),
  p('cpu', 'Intel', 'Core i5-11400F', '2021-03', 15500, { q: 'i5 11400f', all: ['i5[-\\s]*11400f\\b'], spec: L1200 }),
  p('cpu', 'Intel', 'Core i5-12400F', '2022-01', 17000, { q: 'i5 12400f', all: ['i5[-\\s]*12400f\\b'], spec: L1700 }),
  p('cpu', 'Intel', 'Core i5-13400F', '2023-01', 21500, { q: 'i5 13400f', all: ['i5[-\\s]*13400f\\b'], spec: { ...L1700, powerW: 148 } }),
  p('cpu', 'Intel', 'Core i5-14600K', '2023-10', 36000, { q: 'i5 14600k', all: ['i5[-\\s]*14600kf?\\b'], spec: { ...L1700, powerW: 181 } }),
  p('cpu', 'Intel', 'Core i7-14700K', '2023-10', 47000, { q: 'i7 14700k', all: ['i7[-\\s]*14700kf?\\b'], spec: { ...L1700, powerW: 253 } }),
  p('cpu', 'Intel', 'Core Ultra 5 245K', '2024-10', 36500, { q: 'core ultra 5 245k', all: ['ultra\\s*5\\s*245kf?\\b'], spec: { socket: 'LGA1851', memoryTypes: ['DDR5'], powerW: 159 } }),

  // ── Graphics cards (cheapest in-stock board of the model, any brand) ───────
  p('gpu', 'NVIDIA', 'GeForce GTX 1650 4GB', '2019-04', 11500, { q: 'gtx 1650', all: ['gtx\\s*1650\\b'], none: ['super', '\\bti\\b'], spec: { powerW: 75 } }),
  p('gpu', 'NVIDIA', 'GeForce GTX 1660 Super 6GB', '2019-10', 19500, { q: 'gtx 1660 super', all: ['1660\\s*super'], spec: { powerW: 125 } }),
  p('gpu', 'NVIDIA', 'GeForce RTX 3050 8GB', '2022-01', 30000, { q: 'rtx 3050', all: ['rtx\\s*3050\\b'], spec: { powerW: 130 } }),
  p('gpu', 'NVIDIA', 'GeForce RTX 3060 12GB', '2021-02', 42000, { q: 'rtx 3060', all: ['rtx\\s*3060\\b'], none: ['\\bti\\b'], spec: { powerW: 170 } }),
  p('gpu', 'NVIDIA', 'GeForce RTX 3060 Ti', '2020-12', 46000, { q: 'rtx 3060', all: ['3060\\s*ti'], spec: { powerW: 200 } }),
  p('gpu', 'NVIDIA', 'GeForce RTX 3070', '2020-10', 58000, { q: 'rtx 3070', all: ['rtx\\s*3070\\b'], none: ['\\bti\\b'], spec: { powerW: 220 } }),
  p('gpu', 'NVIDIA', 'GeForce RTX 4060 8GB', '2023-06', 30000, { q: 'rtx 4060', all: ['rtx\\s*4060\\b'], none: ['\\bti\\b'], spec: { powerW: 115 } }),
  p('gpu', 'NVIDIA', 'GeForce RTX 4060 Ti', '2023-05', 42000, { q: 'rtx 4060', all: ['4060\\s*ti'], spec: { powerW: 160 } }),
  p('gpu', 'NVIDIA', 'GeForce RTX 4070 Super 12GB', '2024-01', 62000, { q: 'rtx 4070 super', all: ['4070\\s*super'], none: ['\\bti\\b'], spec: { powerW: 220 } }),
  p('gpu', 'NVIDIA', 'GeForce RTX 5060 8GB', '2025-05', 33000, { q: 'rtx 5060', all: ['rtx\\s*5060\\b'], none: ['\\bti\\b'], spec: { powerW: 145 } }),
  p('gpu', 'NVIDIA', 'GeForce RTX 5060 Ti 16GB', '2025-04', 52000, { q: 'rtx 5060', all: ['5060\\s*ti', '16\\s?gb'], spec: { powerW: 180 } }),
  p('gpu', 'NVIDIA', 'GeForce RTX 5070 12GB', '2025-03', 58000, { q: 'rtx 5070', all: ['rtx\\s*5070\\b'], none: ['\\bti\\b', 'super'], spec: { powerW: 250 } }),
  p('gpu', 'AMD', 'Radeon RX 6600 8GB', '2021-10', 36000, { q: 'rx 6600', all: ['rx\\s*6600\\b'], none: ['\\bxt\\b'], spec: { powerW: 132 } }),
  p('gpu', 'AMD', 'Radeon RX 6800 16GB', '2020-11', 72000, { q: 'rx 6800', all: ['rx\\s*6800\\b'], none: ['\\bxt\\b'], spec: { powerW: 250 } }),
  p('gpu', 'AMD', 'Radeon RX 7600 8GB', '2023-05', 27500, { q: 'rx 7600', all: ['rx\\s*7600\\b'], none: ['\\bxt\\b'], spec: { powerW: 165 } }),
  p('gpu', 'AMD', 'Radeon RX 7800 XT 16GB', '2023-09', 52000, { q: 'rx 7800 xt', all: ['7800\\s*xt'], spec: { powerW: 263 } }),
  p('gpu', 'AMD', 'Radeon RX 9060 XT', '2025-06', 42000, { q: 'rx 9060 xt', all: ['9060\\s*xt'], spec: { powerW: 180 }, note: '8 GB and 16 GB boards are both counted; the cheapest wins.' }),
  p('gpu', 'AMD', 'Radeon RX 9070 XT 16GB', '2025-03', 72000, { q: 'rx 9070 xt', all: ['9070\\s*xt'], spec: { powerW: 304 } }),

  // ── Motherboards (cheapest in-stock board on the chipset) ──────────────────
  p('motherboard', 'Various', 'B450M (AM4)', '2019-01', 6500, { q: 'b450m', all: ['\\bb450m?\\b'], spec: { socket: 'AM4', memoryType: 'DDR4', formFactor: 'mATX', powerW: 55 }, note: 'Cheapest B450 board of any brand.' }),
  p('motherboard', 'Various', 'B550M (AM4)', '2020-06', 9500, { q: 'b550m', all: ['\\bb550m?\\b'], spec: { socket: 'AM4', memoryType: 'DDR4', formFactor: 'mATX', powerW: 55 }, note: 'Cheapest B550 board of any brand.' }),
  p('motherboard', 'Various', 'H510M (LGA1200)', '2021-03', 7500, { q: 'h510m', all: ['\\bh510m?\\b'], spec: { socket: 'LGA1200', memoryType: 'DDR4', formFactor: 'mATX', powerW: 50 }, note: 'Cheapest H510 board of any brand.' }),
  p('motherboard', 'Various', 'H610M (LGA1700)', '2022-01', 7500, { q: 'h610m', all: ['\\bh610m?\\b'], spec: { socket: 'LGA1700', memoryType: 'DDR4', formFactor: 'mATX', powerW: 50 }, note: 'Cheapest H610 board of any brand.' }),
  p('motherboard', 'Various', 'B660M (LGA1700)', '2022-01', 12500, { q: 'b660m', all: ['\\bb660m?\\b'], spec: { socket: 'LGA1700', memoryType: 'DDR4', formFactor: 'mATX', powerW: 60 }, note: 'Cheapest B660 board of any brand.' }),
  p('motherboard', 'Various', 'B760M (LGA1700)', '2023-01', 11500, { q: 'b760m', all: ['\\bb760m?\\b'], spec: { socket: 'LGA1700', memoryType: 'DDR4', formFactor: 'mATX', powerW: 60 }, note: 'Cheapest B760 board of any brand; check DDR4 vs DDR5.' }),
  p('motherboard', 'Various', 'B650M (AM5)', '2022-10', 14500, { q: 'b650m', all: ['\\bb650m?\\b'], spec: { socket: 'AM5', memoryType: 'DDR5', formFactor: 'mATX', powerW: 65 }, note: 'Cheapest B650 board of any brand.' }),
  p('motherboard', 'Various', 'A620M (AM5)', '2023-08', 9000, { q: 'a620m', all: ['\\ba620m?\\b'], spec: { socket: 'AM5', memoryType: 'DDR5', formFactor: 'mATX', powerW: 55 }, note: 'Cheapest A620 board of any brand.' }),
  p('motherboard', 'Various', 'B850 (AM5)', '2025-02', 17500, { q: 'b850', all: ['\\bb850m?\\b'], spec: { socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX', powerW: 70 }, note: 'Cheapest B850 board of any brand.' }),
  p('motherboard', 'Various', 'Z790 (LGA1700)', '2022-10', 24000, { q: 'z790', all: ['\\bz790\\b'], spec: { socket: 'LGA1700', memoryType: 'DDR5', formFactor: 'ATX', powerW: 70 }, note: 'Cheapest Z790 board of any brand.' }),
  p('motherboard', 'Various', 'Z890 (LGA1851)', '2024-10, '.slice(0, 7), 27000, { q: 'z890', all: ['\\bz890\\b'], spec: { socket: 'LGA1851', memoryType: 'DDR5', formFactor: 'ATX', powerW: 75 }, note: 'Cheapest Z890 board of any brand.' }),

  // ── Memory (cheapest in-stock desktop kit of the capacity) ─────────────────
  p('memory', 'Various', '8GB DDR4 desktop', '2020-01', 2400, { q: 'ddr4 8gb', all: ['ddr4', '\\b8\\s?gb'], spec: { memoryType: 'DDR4', capacityGB: 8, powerW: 4 } }),
  p('memory', 'Various', '16GB DDR4 desktop', '2020-01', 5000, { q: 'ddr4 16gb', all: ['ddr4', '\\b16\\s?gb'], spec: { memoryType: 'DDR4', capacityGB: 16, powerW: 6 } }),
  p('memory', 'Various', '32GB DDR4 desktop', '2020-01', 10500, { q: 'ddr4 32gb', all: ['ddr4', '\\b32\\s?gb'], spec: { memoryType: 'DDR4', capacityGB: 32, powerW: 8 } }),
  p('memory', 'Various', '16GB DDR5 desktop', '2021-12', 12000, { q: 'ddr5 16gb', all: ['ddr5', '\\b16\\s?gb'], spec: { memoryType: 'DDR5', capacityGB: 16, powerW: 6 } }),
  p('memory', 'Various', '32GB DDR5 desktop', '2021-12', 22000, { q: 'ddr5 32gb', all: ['ddr5', '\\b32\\s?gb'], spec: { memoryType: 'DDR5', capacityGB: 32, powerW: 8 } }),
  p('memory', 'Various', '64GB DDR5 desktop', '2022-10', 38000, { q: 'ddr5 64gb', all: ['ddr5', '\\b64\\s?gb'], spec: { memoryType: 'DDR5', capacityGB: 64, powerW: 12 } }),

  // ── Storage ─────────────────────────────────────────────────────────────────
  p('storage', 'Various', '500GB NVMe SSD', '2020-01', 5500, { q: 'nvme 500gb', all: ['nvme', '\\b(500|512)\\s?gb'], spec: { powerW: 6 } }),
  p('storage', 'Various', '1TB NVMe SSD', '2020-01', 9800, { q: 'nvme 1tb', all: ['nvme', '\\b1\\s?tb'], spec: { powerW: 8 } }),
  p('storage', 'Various', '2TB NVMe SSD', '2020-01', 19500, { q: 'nvme 2tb', all: ['nvme', '\\b2\\s?tb'], spec: { powerW: 8 } }),
  p('storage', 'Various', '480GB SATA SSD', '2020-01', 3900, { q: 'sata ssd 480gb', all: ['sata', 'ssd', '\\b(480|500|512)\\s?gb'], none: ['nvme', 'pcie', 'm\\.?2'], spec: { powerW: 3 } }),
  p('storage', 'Various', '1TB SATA SSD', '2020-01', 7600, { q: 'sata ssd 1tb', all: ['sata', 'ssd', '\\b1\\s?tb'], none: ['nvme', 'pcie', 'm\\.?2'], spec: { powerW: 3 } }),
  p('storage', 'Various', '1TB HDD 3.5"', '2020-01', 3300, { q: 'hdd 1tb', all: ['(hdd|hard\\s?(disk|drive)|barracuda|wd\\s?blue)', '\\b1\\s?tb'], none: ['ssd', '2\\.5', 'passport', 'elements', 'expansion'], reg: 'hdd', dep: 0.05, spec: { powerW: 7 } }),
  p('storage', 'Various', '2TB HDD 3.5"', '2020-01', 4900, { q: 'hdd 2tb', all: ['(hdd|hard\\s?(disk|drive)|barracuda|wd\\s?blue)', '\\b2\\s?tb'], none: ['ssd', '2\\.5', 'passport', 'elements', 'expansion'], reg: 'hdd', dep: 0.05, spec: { powerW: 7 } }),
  p('storage', 'Various', '4TB HDD 3.5"', '2020-01', 8800, { q: 'hdd 4tb', all: ['(hdd|hard\\s?(disk|drive)|barracuda|wd\\s?blue)', '\\b4\\s?tb'], none: ['ssd', '2\\.5', 'passport', 'elements', 'expansion'], reg: 'hdd', dep: 0.05, spec: { powerW: 8 } }),

  // ── Power supplies ──────────────────────────────────────────────────────────
  p('psu', 'Various', '550W 80+ PSU', '2020-01', 3800, { q: '550w psu', all: ['\\b550\\s?w', '(80\\s*\\+|80\\s*plus|bronze|gold|psu|smps|power\\s*supply)'], spec: { wattageW: 550 } }),
  p('psu', 'Various', '650W 80+ PSU', '2020-01', 4900, { q: '650w psu', all: ['\\b650\\s?w', '(80\\s*\\+|80\\s*plus|bronze|gold|psu|smps|power\\s*supply)'], spec: { wattageW: 650 } }),
  p('psu', 'Various', '750W 80+ PSU', '2020-01', 6800, { q: '750w psu', all: ['\\b750\\s?w', '(80\\s*\\+|80\\s*plus|bronze|gold|psu|smps|power\\s*supply)'], spec: { wattageW: 750 } }),
  p('psu', 'Various', '850W 80+ Gold PSU', '2020-01', 10500, { q: '850w psu', all: ['\\b850\\s?w', '(80\\s*\\+|80\\s*plus|gold|platinum|psu|smps|power\\s*supply)'], spec: { wattageW: 850 } }),
  p('psu', 'Various', '1000W 80+ Gold PSU', '2020-01', 16000, { q: '1000w psu', all: ['\\b1000\\s?w', '(80\\s*\\+|80\\s*plus|gold|platinum|psu|smps|power\\s*supply)'], spec: { wattageW: 1000 } }),
  p('psu', 'Corsair', 'CX750 750W', '2020-01', 6200, { q: 'corsair cx750', all: ['\\bcx\\s?750'], spec: { wattageW: 750 } }),

  // ── Coolers and fans ────────────────────────────────────────────────────────
  p('cooler', 'DeepCool', 'AK400 air cooler', '2021-10', 2300, { q: 'deepcool ak400', all: ['ak400'], spec: { supportedSockets: ['AM4', 'AM5', 'LGA1200', 'LGA1700'], heightMm: 155, powerW: 5 } }),
  p('cooler', 'Thermalright', 'Peerless Assassin 120 SE', '2022-06', 3300, { q: 'peerless assassin', all: ['peerless\\s*assassin'], spec: { supportedSockets: ['AM4', 'AM5', 'LGA1200', 'LGA1700'], heightMm: 155, powerW: 5 } }),
  p('cooler', 'Cooler Master', 'Hyper 212 air cooler', '2020-01', 3000, { q: 'hyper 212', all: ['hyper\\s*212'], spec: { supportedSockets: ['AM4', 'AM5', 'LGA1200', 'LGA1700'], heightMm: 159, powerW: 5 } }),
  p('cooler', 'Various', '240mm AIO liquid cooler', '2020-01', 7800, { q: '240mm liquid cooler', all: ['240\\s?mm', '(aio|liquid|all[-\\s]?in[-\\s]?one)'], spec: { supportedSockets: ['AM4', 'AM5', 'LGA1200', 'LGA1700'], heightMm: 55, powerW: 8 } }),
  p('cooler', 'Various', '360mm AIO liquid cooler', '2020-01', 12500, { q: '360mm liquid cooler', all: ['360\\s?mm', '(aio|liquid|all[-\\s]?in[-\\s]?one)'], spec: { supportedSockets: ['AM4', 'AM5', 'LGA1200', 'LGA1700'], heightMm: 55, powerW: 10 } }),
  p('fans', 'Arctic', 'P12 PWM 120mm fan', '2020-01', 650, { q: 'arctic p12', all: ['arctic', '\\bp12\\b'], spec: { powerW: 2 } }),
  p('fans', 'Cooler Master', 'SickleFlow 120 ARGB fan', '2020-01', 900, { q: 'sickleflow 120', all: ['sickle\\s?flow\\s*120'], spec: { powerW: 2 } }),

  // ── Monitors ────────────────────────────────────────────────────────────────
  p('monitor', 'Various', '24" FHD 75Hz IPS monitor', '2020-01', 8800, { q: '24 inch 75hz monitor', all: ['\\b2[1-4](\\.\\d)?\\s?(inch|"|”|-inch)', '\\b75\\s?hz'], spec: {} }),
  p('monitor', 'Various', '24" FHD 144-165Hz monitor', '2020-01', 14500, { q: '24 inch 144hz monitor', all: ['\\b2[1-4](\\.\\d)?\\s?(inch|"|”|-inch)', '\\b(144|165)\\s?hz'], spec: {} }),
  p('monitor', 'Various', '27" QHD 144-180Hz monitor', '2021-06', 28000, { q: '27 inch qhd monitor', all: ['\\b27(\\.\\d)?\\s?(inch|"|”|-inch)', '(qhd|1440p|2k|2560)', '\\b(144|165|170|180)\\s?hz'], spec: {} }),
  p('monitor', 'Various', '27" 4K monitor', '2020-01', 36000, { q: '27 inch 4k monitor', all: ['\\b(27|28)(\\.\\d)?\\s?(inch|"|”|-inch)', '(4k|uhd|3840)'], spec: {} }),

  // ── Cases and common peripherals ───────────────────────────────────────────
  p('case', 'Various', 'mATX airflow case', '2020-01', 3500, { q: 'mATX airflow case', all: ['(matx|micro[-\\s]?atx)', '(case|cabinet|chassis)'], spec: { formFactor: 'mATX' } }),
  p('case', 'Various', 'ATX airflow case', '2020-01', 4800, { q: 'ATX airflow case', all: ['\\batx\\b', '(case|cabinet|chassis)'], spec: { formFactor: 'ATX' } }),
  p('case', 'Various', 'Mini-ITX case', '2020-01', 5500, { q: 'mini ITX case', all: ['(mini[-\\s]?itx|\\bitx\\b)', '(case|cabinet|chassis)'], spec: { formFactor: 'ITX' } }),
  p('keyboard', 'Various', 'Full-size wired keyboard', '2020-01', 500, { q: 'full size wired keyboard', all: ['keyboard', '(wired|usb|mechanical|membrane)'], none: ['keycap', 'switches only'] }),
  p('keyboard', 'Various', 'Mechanical gaming keyboard', '2020-01', 2200, { q: 'mechanical gaming keyboard', all: ['keyboard', '(mechanical|gaming)'], none: ['keycap', 'switches only'] }),
  p('mouse', 'Various', 'Wired optical mouse', '2020-01', 350, { q: 'wired optical mouse', all: ['mouse', '(wired|usb|optical)'], none: ['mousepad', 'skatez', 'feet'] }),
  p('mouse', 'Various', 'Wireless gaming mouse', '2020-01', 1200, { q: 'wireless gaming mouse', all: ['mouse', '(wireless|2\\.4g|bluetooth)'], none: ['mousepad', 'skatez', 'feet'] }),
  p('headset', 'Various', 'Wired PC headset', '2020-01', 900, { q: 'wired PC headset', all: ['(headset|headphone)', '(wired|3\\.5mm|usb)'], none: ['earpads', 'cable only'] }),
  p('headset', 'Various', 'Desktop PC speakers', '2020-01', 800, { q: 'desktop PC speakers', all: ['speaker', '(desktop|computer|pc|usb)'], none: ['car speaker', 'replacement driver'] }),
  p('ups', 'Various', '600VA line-interactive UPS', '2020-01', 3000, { q: '600VA UPS', all: ['\\b600\\s?va\\b', '\\bups\\b'], none: ['battery only', 'replacement battery'] }),
  p('ups', 'Various', '1100VA line-interactive UPS', '2020-01', 5200, { q: '1100VA UPS', all: ['\\b(1000|1100|1200)\\s?va\\b', '\\bups\\b'], none: ['battery only', 'replacement battery'] }),
  p('network', 'Various', 'PCIe Wi-Fi 6 card', '2020-01', 1800, { q: 'PCIe WiFi 6 card', all: ['(pcie|pci-e)', '(wi-?fi|wireless)', '(wifi\\s?6|802\\.11ax)'], none: ['antenna only', 'router'] }),
  p('network', 'Various', '2.5GbE PCIe network card', '2020-01', 1600, { q: '2.5GbE PCIe network card', all: ['(pcie|pci-e)', '(2\\.5g|2\\.5gbe)', '(ethernet|network|lan)'], none: ['switch', 'router'] }),
];

export const PART_BY_ID = new Map(PARTS.map((part) => [part.id, part]));
