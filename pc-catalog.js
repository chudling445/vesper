/** Offline reference profiles; exact SKU dimensions and retail prices are user-entered. */
export const RETAILERS = ['MDComputers', 'Vedant Computers', 'PrimeABGB', 'PCPriceTracker', 'PickPCParts', 'Amazon.in', 'Local shop', 'Other'];
export const COMPONENT_TYPES = [
  ['cpu', 'Processor'], ['motherboard', 'Motherboard'], ['memory', 'Memory'], ['gpu', 'Graphics card'],
  ['cooler', 'CPU cooler'], ['case', 'Case'], ['psu', 'Power supply'], ['storage', 'Storage'], ['other', 'Other'],
  ['monitor', 'Monitor'], ['keyboard', 'Keyboard'], ['mouse', 'Mouse'], ['headset', 'Headset / speakers'],
  ['fans', 'Case fans / cooling'], ['ups', 'UPS / surge protection'], ['software', 'OS / software'], ['accessory', 'Accessory'],
];

export const INDIAN_AND_GLOBAL_BRANDS = [
  'AMD', 'Intel', 'NVIDIA', 'ASUS', 'MSI', 'Gigabyte', 'ASRock', 'Biostar', 'Zotac', 'Sapphire', 'PowerColor', 'XFX', 'Inno3D', 'GALAX', 'PNY', 'Colorful',
  'Corsair', 'G.Skill', 'Kingston', 'Crucial', 'ADATA', 'TeamGroup', 'Samsung', 'Western Digital', 'Seagate', 'Solidigm', 'Lexar',
  'Seasonic', 'Cooler Master', 'DeepCool', 'Antec', 'FSP', 'Thermaltake', 'Lian Li', 'NZXT', 'Fractal Design', 'Montech', 'Ant Esports', 'Zebronics', 'Circle', 'Intex', 'Chiptronex', 'EVM', 'Galax', 'SilverStone',
  'Noctua', 'Arctic', 'Thermalright', 'be quiet!', 'ID-Cooling', 'Jonsbo', 'PCCooler', 'Valkyrie', 'Kioxia', 'Transcend', 'Mushkin', 'Patriot', 'Addlink', 'EVGA', 'Belkin', 'APC', 'Logitech', 'Razer', 'SteelSeries', 'HyperX', 'AOC', 'Acer', 'BenQ', 'ViewSonic', 'LG', 'Dell', 'Lenovo', 'Other',
];

export const REFERENCE_PARTS = [
  { id: 'cpu-am4-6c', type: 'cpu', brand: 'AMD', name: 'Ryzen 5 5600 · reference profile', socket: 'AM4', memoryTypes: ['DDR4'], powerW: 65 },
  { id: 'cpu-am5-6c', type: 'cpu', brand: 'AMD', name: 'Ryzen 5 7600 · reference profile', socket: 'AM5', memoryTypes: ['DDR5'], powerW: 65 },
  { id: 'cpu-am5-zen5', type: 'cpu', brand: 'AMD', name: 'Ryzen 7 9700X · reference profile', socket: 'AM5', memoryTypes: ['DDR5'], powerW: 65 },
  { id: 'cpu-lga1700-ddr4', type: 'cpu', brand: 'Intel', name: 'Core i5 14th Gen · DDR4 board profile', socket: 'LGA1700', memoryTypes: ['DDR4', 'DDR5'], powerW: 148 },
  { id: 'cpu-lga1851', type: 'cpu', brand: 'Intel', name: 'Core Ultra 5 200S · reference profile', socket: 'LGA1851', memoryTypes: ['DDR5'], powerW: 159 },
  { id: 'mb-am4', type: 'motherboard', brand: 'ASUS / MSI / Gigabyte / ASRock', name: 'B550 · AM4 · DDR4 · mATX', socket: 'AM4', memoryType: 'DDR4', formFactor: 'mATX', powerW: 55 },
  { id: 'mb-am5-b650', type: 'motherboard', brand: 'ASUS / MSI / Gigabyte / ASRock', name: 'B650 · AM5 · DDR5 · mATX', socket: 'AM5', memoryType: 'DDR5', formFactor: 'mATX', powerW: 65 },
  { id: 'mb-am5-b850', type: 'motherboard', brand: 'ASUS / MSI / Gigabyte / ASRock', name: 'B850 · AM5 · DDR5 · ATX', socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX', powerW: 70 },
  { id: 'mb-intel-ddr4', type: 'motherboard', brand: 'ASUS / MSI / Gigabyte / ASRock', name: 'B760 D4 · LGA1700 · DDR4 · mATX', socket: 'LGA1700', memoryType: 'DDR4', formFactor: 'mATX', powerW: 65 },
  { id: 'mb-intel-ddr5', type: 'motherboard', brand: 'ASUS / MSI / Gigabyte / ASRock', name: 'B760 · LGA1700 · DDR5 · ATX', socket: 'LGA1700', memoryType: 'DDR5', formFactor: 'ATX', powerW: 65 },
  { id: 'mb-lga1851', type: 'motherboard', brand: 'ASUS / MSI / Gigabyte / ASRock', name: 'Z890 · LGA1851 · DDR5 · ATX', socket: 'LGA1851', memoryType: 'DDR5', formFactor: 'ATX', powerW: 75 },
  { id: 'ram-ddr4-16', type: 'memory', brand: 'Corsair / Kingston / G.Skill / Crucial', name: '16 GB DDR4 kit · reference profile', memoryType: 'DDR4', capacityGB: 16, powerW: 6 },
  { id: 'ram-ddr4-32', type: 'memory', brand: 'Corsair / Kingston / G.Skill / Crucial', name: '32 GB DDR4 kit · reference profile', memoryType: 'DDR4', capacityGB: 32, powerW: 8 },
  { id: 'ram-ddr5-32', type: 'memory', brand: 'Corsair / Kingston / G.Skill / Crucial', name: '32 GB DDR5 kit · reference profile', memoryType: 'DDR5', capacityGB: 32, powerW: 8 },
  { id: 'ram-ddr5-64', type: 'memory', brand: 'Corsair / Kingston / G.Skill / Crucial', name: '64 GB DDR5 kit · reference profile', memoryType: 'DDR5', capacityGB: 64, powerW: 12 },
  { id: 'gpu-1080p', type: 'gpu', brand: 'NVIDIA / AMD / Intel', name: 'Entry 1080p GPU · enter exact model', powerW: 170 },
  { id: 'gpu-midrange', type: 'gpu', brand: 'NVIDIA / AMD / Intel', name: 'Midrange GPU · enter exact model', powerW: 230 },
  { id: 'gpu-highend', type: 'gpu', brand: 'NVIDIA / AMD / Intel', name: 'High-end GPU · enter exact model', powerW: 320 },
  { id: 'cooler-air', type: 'cooler', brand: 'Thermalright / DeepCool / Arctic / Noctua', name: 'Tower air cooler · verify model height', supportedSockets: ['AM4', 'AM5', 'LGA1700', 'LGA1851'], heightMm: 158, powerW: 5 },
  { id: 'case-matx', type: 'case', brand: 'Ant Esports / Zebronics / Cooler Master / Montech', name: 'mATX airflow case · fill exact clearance', supportedFormFactors: ['mATX', 'ITX'], maxGpuLengthMm: 320, maxCoolerHeightMm: 160 },
  { id: 'case-atx', type: 'case', brand: 'Corsair / Lian Li / NZXT / Fractal / Montech', name: 'ATX airflow case · fill exact clearance', supportedFormFactors: ['ATX', 'mATX', 'ITX'], maxGpuLengthMm: 360, maxCoolerHeightMm: 170 },
  { id: 'psu-650', type: 'psu', brand: 'Corsair / Seasonic / FSP / Cooler Master / Antec', name: '650 W quality PSU · choose exact model', wattageW: 650 },
  { id: 'psu-850', type: 'psu', brand: 'Corsair / Seasonic / FSP / Cooler Master / Antec', name: '850 W quality PSU · choose exact model', wattageW: 850 },
  { id: 'storage-nvme', type: 'storage', brand: 'Samsung / WD / Crucial / Kingston / Lexar', name: '1 TB NVMe SSD · reference profile', powerW: 8 },
];

/** Budget guide allocations. These are planning ranges, not live shopping quotes. */
export const BUILD_GUIDES = [
  { min: 15000, max: 29999, name: '₹15k–₹30k · essentials / upgrade path', use: 'A new discrete-GPU gaming tower is not a realistic target here. Consider a verified used office PC or a current entry APU build; keep funds for a safe PSU, SSD, and warranty.', split: { 'CPU / APU': 30, Board: 18, Memory: 14, Storage: 10, PSU: 13, 'Case & cooling': 5, Reserve: 10 } },
  { min: 30000, max: 44999, name: '₹30k–₹45k · first PC', use: 'iGPU/APU-first; prioritize dual-channel RAM and a reliable PSU. Add a GPU later.', split: { CPU: 22, GPU: 0, Board: 18, Memory: 15, Storage: 10, PSU: 12, 'Case & cooling': 15, Reserve: 8 } },
  { min: 45000, max: 64999, name: '₹45k–₹65k · entry 1080p', use: 'Choose an APU or a carefully priced entry GPU; avoid sacrificing PSU quality.', split: { CPU: 18, GPU: 25, Board: 14, Memory: 12, Storage: 8, PSU: 10, 'Case & cooling': 9, Reserve: 4 } },
  { min: 65000, max: 89999, name: '₹65k–₹90k · balanced 1080p', use: 'Balance a 6-core CPU and entry/midrange GPU; leave room for a 1 TB SSD.', split: { CPU: 16, GPU: 34, Board: 13, Memory: 11, Storage: 8, PSU: 9, 'Case & cooling': 6, Reserve: 3 } },
  { min: 90000, max: 139999, name: '₹90k–₹1.4L · 1440p value', use: 'Aim the largest share at the GPU, with 32 GB RAM and a 750 W-class PSU if required.', split: { CPU: 15, GPU: 40, Board: 12, Memory: 10, Storage: 8, PSU: 8, 'Case & cooling': 5, Reserve: 2 } },
  { min: 140000, max: 219999, name: '₹1.4L–₹2.2L · high-refresh', use: 'Prioritize GPU performance, 32 GB DDR5, airflow and a platform with a clear upgrade path.', split: { CPU: 15, GPU: 43, Board: 11, Memory: 9, Storage: 8, PSU: 8, 'Case & cooling': 4, Reserve: 2 } },
  { min: 220000, max: 349999, name: '₹2.2L–₹3.5L · enthusiast / creator', use: 'Split budget between a fast GPU and a stronger CPU; reserve for larger storage and cooling.', split: { CPU: 17, GPU: 42, Board: 11, Memory: 9, Storage: 8, PSU: 7, 'Case & cooling': 4, Reserve: 2 } },
  { min: 350000, max: 500000, name: '₹3.5L–₹5L · local AI workstation', use: 'Choose the GPU by VRAM and model workload first; budget for 64–128 GB RAM, storage, and PSU headroom.', split: { CPU: 17, GPU: 48, Board: 10, Memory: 10, Storage: 7, PSU: 5, 'Case & cooling': 2, Reserve: 1 } },
  { min: 500001, max: 749999, name: '₹5L–₹7.5L · high-VRAM workstation', use: 'Select the GPU and VRAM capacity for the target workloads first. Check card length, power connectors, PSU transient capacity, case airflow, memory capacity, and local warranty.', split: { CPU: 14, GPU: 52, Board: 9, Memory: 10, Storage: 7, PSU: 5, 'Case & cooling': 2, Reserve: 1 } },
  { min: 750000, max: Number.MAX_SAFE_INTEGER, name: '₹7.5L+ · specialist workstation', use: 'Treat this as a workload-specific engineering build: validate multi-GPU spacing, PCIe lanes, cooling, power delivery, acoustics, and serviceability before buying.', split: { CPU: 14, GPU: 54, Board: 9, Memory: 9, Storage: 7, PSU: 4, 'Case & cooling': 2, Reserve: 1 } },
];

export const PRICE_SOURCES = [
  { name: 'MDComputers', url: 'https://mdcomputers.in/', searchUrl: 'https://mdcomputers.in/?route=product/search&search=' },
  { name: 'Vedant Computers', url: 'https://www.vedantcomputers.com/', searchUrl: 'https://www.vedantcomputers.com/index.php?route=product/search&search=' },
  { name: 'PrimeABGB', url: 'https://www.primeabgb.com/shop/', searchUrl: 'https://www.primeabgb.com/?s=' },
  { name: 'PCPriceTracker', url: 'https://pcpricetracker.in/' },
  { name: 'PickPCParts', url: 'https://pickpcparts.com/' },
  { name: 'Amazon.in', url: 'https://www.amazon.in/', searchUrl: 'https://www.amazon.in/s?k=' },
];
