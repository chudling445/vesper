/**
 * Vesper · Verified PC-component price archive & source registry.
 *
 * What this module is
 * ───────────────────
 * A hand-curated, source-attributed archive of PC-component prices that the
 * Vesper project could actually verify against a published page. It is *not* a
 * price model and contains no generated numbers: every entry in PRICE_POINTS
 * carries the page it came from, the kind of price it is, and the currency it
 * was quoted in.
 *
 * The golden rule the whole app follows: a year, market, or product we could
 * not verify is reported as `not-available`. Gaps are never filled with a
 * converted MSRP, a neighbouring model, or an interpolation.
 *
 * Multi-source merging
 * ────────────────────
 * Several sources can report the same product in the same year. `preferredSourceFor`
 * resolves which one to lead with using the documented rule the product asks
 * for: the source with the most recorded observations for that instrument wins,
 * ties broken by `usage.rank` (retailer → aggregator → marketplace → press →
 * manufacturer). Every contributing source is still returned so the UI can
 * credit all of them.
 *
 * @typedef {'cpu'|'gpu'|'motherboard'|'memory'|'storage'|'psu'|'cooler'} ArchiveCategory
 * @typedef {'launch-price'|'street-price'|'listing'|'current-lowest'} PriceBasis
 * @typedef {'verified'|'not-available'|'not-released'|'other-source'} YearStatus
 *
 * @typedef {object} PricePoint
 * @property {string} key          instrument key, e.g. `gpu-rtx-4060`
 * @property {ArchiveCategory} category
 * @property {string} market       market id from MARKETS, e.g. `in`
 * @property {string} currency     ISO 4217 code the figure was quoted in
 * @property {number} year         calendar year the price was recorded for
 * @property {string} [period]     finer period, e.g. `2020-11` or `2023-04`
 * @property {number} value        the amount exactly as published
 * @property {PriceBasis} basis    what kind of price this is
 * @property {string} sourceId     id from PRICE_SOURCES
 * @property {string} sourceUrl    the page the figure was read from
 * @property {string} note         plain-language caveat shown next to the figure
 */

/** Years the archive reports on, oldest first. */
export const ARCHIVE_YEARS = Object.freeze([2020, 2021, 2022, 2023, 2024, 2025, 2026]);

/**
 * Markets Vesper reports on. `verified: false` markets are listed so the UI can
 * say "no verified data" instead of quietly omitting a country.
 * @typedef {object} Market
 * @property {string} id
 * @property {string} name
 * @property {string} currency
 * @property {string} symbol
 * @property {boolean} verified  whether PRICE_POINTS contains any figure here
 * @property {string[]} trackers local comparison sites worth using
 */
export const MARKETS = Object.freeze([
  { id: 'in', name: 'India', currency: 'INR', symbol: '₹', verified: true, trackers: ['pcpricetracker.in', 'mdcomputers.in', 'vedantcomputers.com', 'primeabgb.com', 'elitehubs.com', 'theitdepot.com', 'amazon.in', 'flipkart.com'] },
  { id: 'us', name: 'United States', currency: 'USD', symbol: '$', verified: true, trackers: ['pcpartpicker.com', 'newegg.com', 'camelcamelcamel.com'] },
  { id: 'uk', name: 'United Kingdom', currency: 'GBP', symbol: '£', verified: true, trackers: ['uk.pcpartpicker.com', 'idealo.co.uk'] },
  { id: 'de', name: 'Germany / EU', currency: 'EUR', symbol: '€', verified: false, trackers: ['geizhals.de', 'idealo.de', 'mindfactory.de'] },
  { id: 'jp', name: 'Japan', currency: 'JPY', symbol: '¥', verified: true, trackers: ['kakaku.com/pc'] },
  { id: 'ae', name: 'United Arab Emirates', currency: 'AED', symbol: 'AED', verified: false, trackers: ['pricena.com/en-ae', 'amazon.ae'] },
  { id: 'au', name: 'Australia', currency: 'AUD', symbol: 'A$', verified: true, trackers: ['staticice.com.au', 'au.pcpartpicker.com'] },
  { id: 'ca', name: 'Canada', currency: 'CAD', symbol: 'C$', verified: false, trackers: ['ca.pcpartpicker.com', 'canadacomputers.com', 'newegg.ca'] },
  { id: 'sg', name: 'Singapore', currency: 'SGD', symbol: 'S$', verified: true, trackers: ['hardwarezone.com.sg (Sim Lim price lists)', 'sourceit.com.sg'] },
  { id: 'cn', name: 'China', currency: 'CNY', symbol: '¥', verified: true, trackers: ['jd.com/jiage', 'detail.zol.com.cn'] },
  { id: 'br', name: 'Brazil', currency: 'BRL', symbol: 'R$', verified: true, trackers: ['zoom.com.br', 'buscape.com.br', 'kabum.com.br', 'pichau.com.br'] },
]);

export const MARKET_BY_ID = new Map(MARKETS.map((market) => [market.id, market]));

/**
 * Source registry — every figure in this archive is credited here.
 *
 * `usage.rank` documents how Vesper breaks ties when two sources report the
 * same figure: a dated retailer or marketplace record outranks an aggregator,
 * which outranks press coverage and manufacturer announcements. `usage.observations`
 * records how many archive entries currently cite the source, which is what
 * "the source that is most used" means in `preferredSourceFor`.
 *
 * @typedef {object} PriceSource
 * @property {string} id
 * @property {string} name
 * @property {string} url
 * @property {'retailer'|'marketplace'|'aggregator'|'press'|'manufacturer'} kind
 * @property {string} coverage
 * @property {{rank:number}} usage
 * @property {string} note
 */
export const PRICE_SOURCES = Object.freeze([
  { id: 'toi-ryzen5000', name: 'The Times of India', url: 'https://timesofindia.indiatimes.com/gadgets-news/amd-ryzen-5000-series-desktop-processors-arrives-in-india-at-a-starting-price-of-rs-22990/articleshow/79067781.cms', kind: 'press', coverage: 'India launch pricing, Nov 2020', usage: { rank: 4 }, note: 'Contemporaneous launch reporting for the Ryzen 5000 series in India.' },
  { id: 'ign-rtx3060-in', name: 'IGN India', url: 'https://in.ign.com/pc/155797/news/nvidia-geforce-rtx-3060-india-price-ps5-restocks', kind: 'press', coverage: 'India launch price + one retailer listing, Mar 2021', usage: { rank: 4 }, note: 'Reports Nvidia’s confirmed India starting price *and* a much higher third-party listing; those are different kinds of price.' },
  { id: 'onsitego-rtx40-in', name: 'Onsitego', url: 'https://onsitego.com/blog/nvidia-geforce-rtx-4080-rtx-4090-gpus-launched/', kind: 'press', coverage: 'India launch pricing, Sep 2022', usage: { rank: 4 }, note: 'Launch prices reported at announcement time.' },
  { id: 'ign-7800x3d', name: 'IGN India — Ryzen 7 7800X3D review', url: 'https://in.ign.com/amd-ryzen-7-7800x3d/189054/review/amd-ryzen-7-7800x3d-review', kind: 'press', coverage: 'India retail range, Apr 2023', usage: { rank: 4 }, note: 'Gives an approximate figure plus exact minimum and maximum retailer quotes.' },
  { id: 'iexpress-rtx50-in', name: 'The Indian Express', url: 'https://indianexpress.com/article/technology/tech-news-technology/nvidia-geforce-rtx-5090-5080-5070-ti-price-availability-india-9767028/', kind: 'press', coverage: 'India reference pricing, Jan 2025', usage: { rank: 4 }, note: 'Reference/Founders Edition prices; partner-board pricing differs.' },
  { id: 'mint-rtx50-in', name: 'Mint', url: 'https://www.livemint.com/technology/tech-news/buying-nvidia-rtx-50-series-gpu-heres-the-pricing-for-the-rtx-5070-5070-ti-5080-and-5090-in-india-11736514075723.html', kind: 'press', coverage: 'India reference pricing, Jan 2025', usage: { rank: 4 }, note: 'Independently reports the same RTX 50 series India amounts and availability timing.' },
  { id: 'nvidia-rtx4060-us', name: 'NVIDIA', url: 'https://www.nvidia.com/en-us/geforce/news/geforce-rtx-4060-4060ti/', kind: 'manufacturer', coverage: 'US launch starting price, 2023', usage: { rank: 5 }, note: 'Official launch starting price, not a current retail quote.' },
  { id: 'nvidia-rtx4060-cn', name: 'NVIDIA (China)', url: 'https://www.nvidia.cn/geforce/news/geforce-rtx-4060-4060ti/', kind: 'manufacturer', coverage: 'China launch starting price, 2023', usage: { rank: 5 }, note: 'Official launch starting price, not a current retail quote.' },
  { id: 'amazon-uk-rtx4060', name: 'Amazon UK', url: 'https://www.amazon.co.uk/MSI-GeForce-VENTUS-Gaming-Graphics/dp/B0C7W8GZMJ', kind: 'marketplace', coverage: 'United Kingdom listing', usage: { rank: 2 }, note: 'Observed listing that included estimated import charges and shipped from Amazon EU; treat as one offer, not a market average.' },
  { id: 'kakaku-ryzen7600', name: 'Kakaku', url: 'https://kakaku.com/item/K0001507447/pricehistory/', kind: 'aggregator', coverage: 'Japan price history', usage: { rank: 3 }, note: 'Aggregator listing plus a labelled price-history series showing a 29.1% fall from its January 2023 reference price.' },
  { id: 'kakaku-rtx4060', name: 'Kakaku', url: 'https://kakaku.com/item/K0001548658/', kind: 'aggregator', coverage: 'Japan listing', usage: { rank: 3 }, note: 'Lowest listed price at the time of reading.' },
  { id: 'staticice-rtx4060-au', name: 'StaticICE', url: 'https://www.staticice.com.au/cgi-bin/search.cgi?q=rtx%204060', kind: 'aggregator', coverage: 'Australia listings', usage: { rank: 3 }, note: 'Listings found were RTX 4060 Ti, a different model from the standard RTX 4060; recorded as its own instrument.' },
  { id: 'sourceit-sg-rtx4060', name: 'SourceIT', url: 'https://sourceit.com.sg/products/nvidia-asus-geforce-rtx-4060-dual-white-oc-graphics-card', kind: 'retailer', coverage: 'Singapore listing', usage: { rank: 1 }, note: 'Tax included; shipping calculated separately.' },
  { id: 'kabum-br-ryzen7600', name: 'KaBuM', url: 'https://www.kabum.com.br/produto/420277/processador-amd-ryzen-5-7600-3-8ghz-5-1ghz-turbo-cache-32mb-hexa-core-12-threads-am5-wraith-stealth-100-100001015box', kind: 'retailer', coverage: 'Brazil listing', usage: { rank: 1 }, note: 'Single retailer listing quoted as the Pix (cash) price, not a market average.' },
  { id: 'pcpricetracker-in', name: 'PCPriceTracker', url: 'https://www.pcpricetracker.in/', kind: 'aggregator', coverage: 'India multi-store comparison index', usage: { rank: 3 }, note: 'Aggregator, not the seller. Its pages returned HTTP 403 during research, so its price history could not be read here; listed as an authorised-feed target rather than as archived evidence.' },
  { id: 'mdcomputers-in', name: 'MDComputers', url: 'https://mdcomputers.in/', kind: 'retailer', coverage: 'India retailer index', usage: { rank: 1 }, note: 'A dated invoice or listing is primary evidence for that seller only.' },
  { id: 'vedant-in', name: 'Vedant Computers', url: 'https://www.vedantcomputers.com/', kind: 'retailer', coverage: 'India retailer index', usage: { rank: 1 }, note: 'Named as one of the stores holding the lowest recorded 7800X3D quote.' },
  { id: 'primeabgb-in', name: 'PrimeABGB', url: 'https://www.primeabgb.com/', kind: 'retailer', coverage: 'India retailer index', usage: { rank: 1 }, note: 'Named as one of the stores holding the lowest recorded 7800X3D quote.' },
  { id: 'pcpartpicker-us', name: 'PCPartPicker (US)', url: 'https://pcpartpicker.com/', kind: 'aggregator', coverage: 'US comparison index', usage: { rank: 3 }, note: 'Returned HTTP 403 during research, so no snippet was treated as a price.' },
  { id: 'geizhals-de', name: 'Geizhals', url: 'https://geizhals.de/', kind: 'aggregator', coverage: 'Germany / EU comparison index', usage: { rank: 3 }, note: 'Returned HTTP 403 during research.' },
  { id: 'pricena-ae', name: 'Pricena (UAE)', url: 'https://www.pricena.com/en-ae/', kind: 'aggregator', coverage: 'UAE comparison index', usage: { rank: 3 }, note: 'Dubizzle is second-hand classifieds and is not a like-for-like new-retail comparator.' },
  { id: 'hardwarezone-sg', name: 'HardwareZone Sim Lim Square price lists', url: 'https://www.hardwarezone.com.sg/pc/sim-lim-square-weekly-price-list-downloads', kind: 'aggregator', coverage: 'Singapore weekly retailer price lists', usage: { rank: 3 }, note: 'Weekly retailer price-list downloads.' },
  { id: 'jd-cn', name: 'JD.com price reference', url: 'https://www.jd.com/jiage/', kind: 'aggregator', coverage: 'China price reference', usage: { rank: 3 }, note: 'No JD quote was readable during research; only the official launch price is archived.' },
  { id: 'zoombrazil', name: 'Zoom (Brazil)', url: 'https://www.zoom.com.br/', kind: 'aggregator', coverage: 'Brazil comparison index', usage: { rank: 3 }, note: 'Comparison index; Buscapé, KaBuM, and Pichau cover the same market.' },
  // ── Retailer and marketplace targets per market (no archived figure yet) ──
  { id: 'smc-in', name: 'SMC International', url: 'https://www.smcinternational.in/', kind: 'retailer', coverage: 'India retailer index', usage: { rank: 1 }, note: 'Named as holding the highest recorded 7800X3D quote in the reviewed reporting.' },
  { id: 'easy-computers-in', name: 'Easy Computers', url: 'https://www.easyomputers.com/', kind: 'retailer', coverage: 'India retailer index', usage: { rank: 1 }, note: 'Regional Indian retailer; a dated invoice would be primary evidence.' },
  { id: 'antpc-in', name: 'Ant PC', url: 'https://www.ant-pc.com/', kind: 'retailer', coverage: 'India assembled-PC retailer', usage: { rank: 1 }, note: 'Sells assembled systems; read component listings only, not system bundles.' },
  { id: 'amazon-in', name: 'Amazon India', url: 'https://www.amazon.in/best-sellers-computers/zgbs/computers', kind: 'marketplace', coverage: 'India marketplace', usage: { rank: 2 }, note: 'Third-party listings vary by seller and are not a uniform market price.' },
  { id: 'flipkart-in', name: 'Flipkart', url: 'https://www.flipkart.com/computers/pr?sid=6bo', kind: 'marketplace', coverage: 'India marketplace', usage: { rank: 2 }, note: 'Marketplace listings; seller, warranty, and bundle terms differ between offers.' },
  { id: 'newegg-us', name: 'Newegg (US)', url: 'https://www.newegg.com/', kind: 'marketplace', coverage: 'US marketplace', usage: { rank: 2 }, note: 'Combination of first-party and marketplace sellers.' },
  { id: 'bestbuy-us', name: 'Best Buy', url: 'https://www.bestbuy.com/', kind: 'retailer', coverage: 'US retailer', usage: { rank: 1 }, note: 'US big-box retailer with frequent short-lived promotions.' },
  { id: 'microcenter-us', name: 'Micro Center', url: 'https://www.microcenter.com/', kind: 'retailer', coverage: 'US retailer', usage: { rank: 1 }, note: 'In-store pricing frequently differs from online pricing.' },
  { id: 'bh-us', name: 'B&H Photo Video', url: 'https://www.bhphotovideo.com/', kind: 'retailer', coverage: 'US retailer', usage: { rank: 1 }, note: 'US retailer; tax treatment varies by state.' },
  { id: 'overclockers-uk', name: 'Overclockers UK', url: 'https://www.overclockers.co.uk/', kind: 'retailer', coverage: 'UK retailer', usage: { rank: 1 }, note: 'UK enthusiast retailer.' },
  { id: 'scan-uk', name: 'Scan Computers', url: 'https://www.scan.co.uk/', kind: 'retailer', coverage: 'UK retailer', usage: { rank: 1 }, note: 'UK retailer and system integrator.' },
  { id: 'ccl-uk', name: 'CCL Computers', url: 'https://www.cclonline.com/', kind: 'retailer', coverage: 'UK retailer', usage: { rank: 1 }, note: 'UK retailer.' },
  { id: 'idealo-uk', name: 'idealo UK', url: 'https://www.idealo.co.uk/', kind: 'aggregator', coverage: 'UK comparison index', usage: { rank: 3 }, note: 'Comparison index; not a seller.' },
  { id: 'idealo-de', name: 'idealo Germany', url: 'https://www.idealo.de/', kind: 'aggregator', coverage: 'Germany / EU comparison index', usage: { rank: 3 }, note: 'Comparison index covering several European markets.' },
  { id: 'mindfactory-de', name: 'Mindfactory', url: 'https://www.mindfactory.de/', kind: 'retailer', coverage: 'Germany retailer', usage: { rank: 1 }, note: 'German retailer; prices are usually quoted VAT-inclusive.' },
  { id: 'alternate-de', name: 'Alternate', url: 'https://www.alternate.de/', kind: 'retailer', coverage: 'Germany / EU retailer', usage: { rank: 1 }, note: 'German retailer with several European storefronts.' },
  { id: 'caseking-de', name: 'Caseking', url: 'https://www.caseking.de/', kind: 'retailer', coverage: 'Germany retailer', usage: { rank: 1 }, note: 'German enthusiast retailer.' },
  { id: 'amazon-jp', name: 'Amazon Japan', url: 'https://www.amazon.co.jp/', kind: 'marketplace', coverage: 'Japan marketplace', usage: { rank: 2 }, note: 'Marketplace listings; Kakaku aggregates these plus others.' },
  { id: 'tsukumo-jp', name: 'TSUKUMO', url: 'https://www.tsukumo.co.jp/', kind: 'retailer', coverage: 'Japan retailer', usage: { rank: 1 }, note: 'Japanese retailer; parts pricing quoted pre-tax.' },
  { id: 'dospara-jp', name: 'Dospara', url: 'https://www.dospara.co.jp/', kind: 'retailer', coverage: 'Japan retailer', usage: { rank: 1 }, note: 'Japanese retailer; parts pricing quoted pre-tax.' },
  { id: 'pc-koubou-jp', name: 'PC Koubou', url: 'https://www.pc-koubou.jp/', kind: 'retailer', coverage: 'Japan retailer', usage: { rank: 1 }, note: 'Japanese retailer.' },
  { id: 'amazon-ae', name: 'Amazon UAE', url: 'https://www.amazon.ae/', kind: 'marketplace', coverage: 'UAE marketplace', usage: { rank: 2 }, note: 'Marketplace listings; some items ship from outside the UAE.' },
  { id: 'microless-ae', name: 'Microless', url: 'https://www.microless.com/', kind: 'retailer', coverage: 'UAE retailer', usage: { rank: 1 }, note: 'UAE electronics retailer.' },
  { id: 'sharaf-ae', name: 'Sharaf DG', url: 'https://www.sharafdg.com/', kind: 'retailer', coverage: 'UAE retailer', usage: { rank: 1 }, note: 'UAE electronics retailer.' },
  { id: 'pccasegear-au', name: 'PC Case Gear', url: 'https://www.pccasegear.com/', kind: 'retailer', coverage: 'Australia retailer', usage: { rank: 1 }, note: 'Australian retailer; prices include GST.' },
  { id: 'scorptec-au', name: 'Scorptec', url: 'https://www.scorptec.com.au/', kind: 'retailer', coverage: 'Australia retailer', usage: { rank: 1 }, note: 'Australian retailer; prices include GST.' },
  { id: 'mwave-au', name: 'Mwave', url: 'https://www.mwave.com.au/', kind: 'retailer', coverage: 'Australia retailer', usage: { rank: 1 }, note: 'Australian retailer.' },
  { id: 'canada-computers', name: 'Canada Computers', url: 'https://www.canadacomputers.com/', kind: 'retailer', coverage: 'Canada retailer', usage: { rank: 1 }, note: 'Canadian retailer.' },
  { id: 'memoryexpress-ca', name: 'Memory Express', url: 'https://www.memoryexpress.com/', kind: 'retailer', coverage: 'Canada retailer', usage: { rank: 1 }, note: 'Canadian retailer.' },
  { id: 'amazon-ca', name: 'Amazon Canada', url: 'https://www.amazon.ca/', kind: 'marketplace', coverage: 'Canada marketplace', usage: { rank: 2 }, note: 'Marketplace listings; cross-border sellers appear frequently.' },
  { id: 'lazada-sg', name: 'Lazada Singapore', url: 'https://www.lazada.sg/', kind: 'marketplace', coverage: 'Singapore marketplace', usage: { rank: 2 }, note: 'Marketplace listings; seller quality varies widely.' },
  { id: 'shopee-sg', name: 'Shopee Singapore', url: 'https://shopee.sg/', kind: 'marketplace', coverage: 'Singapore marketplace', usage: { rank: 2 }, note: 'Marketplace listings; check seller ratings before quoting.' },
  { id: 'aftershock-sg', name: 'Aftershock PC', url: 'https://www.aftershockpc.com/', kind: 'retailer', coverage: 'Singapore system integrator', usage: { rank: 1 }, note: 'Singapore integrator; read component listings, not system bundles.' },
  { id: 'zol-cn', name: 'ZOL price index', url: 'https://detail.zol.com.cn/', kind: 'aggregator', coverage: 'China price reference', usage: { rank: 3 }, note: 'Chinese product-price listings index.' },
  { id: 'pconline-cn', name: 'PConline price index', url: 'https://product.pconline.com.cn/', kind: 'aggregator', coverage: 'China price reference', usage: { rank: 3 }, note: 'Chinese hardware price listings.' },
  { id: 'tmall-cn', name: 'Tmall', url: 'https://www.tmall.com/', kind: 'marketplace', coverage: 'China marketplace', usage: { rank: 2 }, note: 'Marketplace listings; prices vary by store and promotion period.' },
  { id: 'pichau-br', name: 'Pichau', url: 'https://www.pichau.com.br/', kind: 'retailer', coverage: 'Brazil retailer', usage: { rank: 1 }, note: 'Brazilian retailer; cash and instalment prices differ.' },
  { id: 'terabyte-br', name: 'TerabyteShop', url: 'https://www.terabyteshop.com.br/', kind: 'retailer', coverage: 'Brazil retailer', usage: { rank: 1 }, note: 'Brazilian retailer.' },
  { id: 'buscape-br', name: 'Buscape', url: 'https://www.buscape.com.br/', kind: 'aggregator', coverage: 'Brazil comparison index', usage: { rank: 3 }, note: 'Comparison index covering several Brazilian retailers.' },
]);

export const SOURCE_BY_ID = new Map(PRICE_SOURCES.map((source) => [source.id, source]));

/** Instruments the archive understands, with the category and label the UI shows. */
export const ARCHIVE_INSTRUMENTS = Object.freeze([
  { key: 'cpu-ryzen-5-5600x', label: 'AMD Ryzen 5 5600X', category: 'cpu', launchYear: 2020 },
  { key: 'cpu-ryzen-7-5800x', label: 'AMD Ryzen 7 5800X', category: 'cpu', launchYear: 2020 },
  { key: 'cpu-ryzen-5-7600', label: 'AMD Ryzen 5 7600', category: 'cpu', launchYear: 2023 },
  { key: 'cpu-ryzen-7-7800x3d', label: 'AMD Ryzen 7 7800X3D', category: 'cpu', launchYear: 2023 },
  { key: 'cpu-core-i5-14600k', label: 'Intel Core i5-14600K', category: 'cpu', launchYear: 2023 },
  { key: 'cpu-core-ultra-5-245k', label: 'Intel Core Ultra 5 245K', category: 'cpu', launchYear: 2024 },
  { key: 'gpu-rtx-3060', label: 'NVIDIA GeForce RTX 3060 12GB', category: 'gpu', launchYear: 2021 },
  { key: 'gpu-rtx-4060', label: 'NVIDIA GeForce RTX 4060 8GB', category: 'gpu', launchYear: 2023 },
  { key: 'gpu-rtx-4060-ti', label: 'NVIDIA GeForce RTX 4060 Ti', category: 'gpu', launchYear: 2023 },
  { key: 'gpu-rtx-4080-16gb', label: 'NVIDIA GeForce RTX 4080 16GB', category: 'gpu', launchYear: 2022 },
  { key: 'gpu-rtx-4090', label: 'NVIDIA GeForce RTX 4090', category: 'gpu', launchYear: 2022 },
  { key: 'gpu-rtx-5070', label: 'NVIDIA GeForce RTX 5070', category: 'gpu', launchYear: 2025 },
  { key: 'gpu-rtx-5070-ti', label: 'NVIDIA GeForce RTX 5070 Ti', category: 'gpu', launchYear: 2025 },
  { key: 'gpu-rtx-5080', label: 'NVIDIA GeForce RTX 5080', category: 'gpu', launchYear: 2025 },
  { key: 'gpu-rtx-5090', label: 'NVIDIA GeForce RTX 5090', category: 'gpu', launchYear: 2025 },
  { key: 'motherboard-b650', label: 'B650 (AM5) motherboard', category: 'motherboard', launchYear: 2022 },
  { key: 'memory-16gb-ddr5', label: '16GB DDR5 desktop kit', category: 'memory', launchYear: 2021 },
  { key: 'storage-1tb-nvme', label: '1TB NVMe SSD', category: 'storage', launchYear: 2020 },
  { key: 'psu-650w-gold', label: '650W 80+ Gold PSU', category: 'psu', launchYear: 2020 },
  { key: 'cooler-ak620', label: 'DeepCool AK620 air cooler', category: 'cooler', launchYear: 2021 },
]);

export const INSTRUMENT_BY_KEY = new Map(ARCHIVE_INSTRUMENTS.map((instrument) => [instrument.key, instrument]));

/**
 * Every verified, source-attributed figure in the archive.
 *
 * Only pages that were actually read are cited. Where a figure is a
 * `launch-price` it is the price announced for that market, which is a
 * different quantity from a `listing` or a `current-lowest` observation; the
 * `basis` field is what keeps those apart in the UI.
 * @type {ReadonlyArray<PricePoint>}
 */
export const PRICE_POINTS = Object.freeze([
  // ── India ──────────────────────────────────────────────────────────────────
  { key: 'cpu-ryzen-5-5600x', category: 'cpu', market: 'in', currency: 'INR', year: 2020, period: '2020-11', value: 22990, basis: 'launch-price', sourceId: 'toi-ryzen5000', sourceUrl: 'https://timesofindia.indiatimes.com/gadgets-news/amd-ryzen-5000-series-desktop-processors-arrives-in-india-at-a-starting-price-of-rs-22990/articleshow/79067781.cms', note: 'Reported India starting price when the Ryzen 5000 series arrived.' },
  { key: 'cpu-ryzen-7-5800x', category: 'cpu', market: 'in', currency: 'INR', year: 2020, period: '2020-11', value: 34490, basis: 'launch-price', sourceId: 'toi-ryzen5000', sourceUrl: 'https://timesofindia.indiatimes.com/gadgets-news/amd-ryzen-5000-series-desktop-processors-arrives-in-india-at-a-starting-price-of-rs-22990/articleshow/79067781.cms', note: 'Reported India price for the 5800X at the same launch.' },
  { key: 'gpu-rtx-3060', category: 'gpu', market: 'in', currency: 'INR', year: 2021, period: '2021-03', value: 29500, basis: 'launch-price', sourceId: 'ign-rtx3060-in', sourceUrl: 'https://in.ign.com/pc/155797/news/nvidia-geforce-rtx-3060-india-price-ps5-restocks', note: 'India starting price Nvidia confirmed.' },
  { key: 'gpu-rtx-3060', category: 'gpu', market: 'in', currency: 'INR', year: 2021, period: '2021-03', value: 50699, basis: 'listing', sourceId: 'ign-rtx3060-in', sourceUrl: 'https://in.ign.com/pc/155797/news/nvidia-geforce-rtx-3060-india-price-ps5-restocks', note: 'A specific Colorful RTX 3060 NB 12G-V listing at RP Tech during the shortage — the same page as the launch price, and a very different number.' },
  { key: 'gpu-rtx-4080-16gb', category: 'gpu', market: 'in', currency: 'INR', year: 2022, period: '2022-09', value: 133000, basis: 'launch-price', sourceId: 'onsitego-rtx40-in', sourceUrl: 'https://onsitego.com/blog/nvidia-geforce-rtx-4080-rtx-4090-gpus-launched/', note: 'India starting price reported at announcement.' },
  { key: 'gpu-rtx-4090', category: 'gpu', market: 'in', currency: 'INR', year: 2022, period: '2022-09', value: 177000, basis: 'launch-price', sourceId: 'onsitego-rtx40-in', sourceUrl: 'https://onsitego.com/blog/nvidia-geforce-rtx-4080-rtx-4090-gpus-launched/', note: 'India starting price reported at announcement. A proposed 12GB “4080” price on the same page is excluded because that model was never released under that name.' },
  { key: 'cpu-ryzen-7-7800x3d', category: 'cpu', market: 'in', currency: 'INR', year: 2023, period: '2023-04', value: 46000, basis: 'launch-price', sourceId: 'ign-7800x3d', sourceUrl: 'https://in.ign.com/amd-ryzen-7-7800x3d/189054/review/amd-ryzen-7-7800x3d-review', note: 'Described as “around ₹46,000” at launch in India.' },
  { key: 'cpu-ryzen-7-7800x3d', category: 'cpu', market: 'in', currency: 'INR', year: 2023, period: '2023-04', value: 42399, basis: 'listing', sourceId: 'vedant-in', sourceUrl: 'https://www.vedantcomputers.com/', note: 'Lowest exact retailer quote in the reviewed reporting (PrimeABGB/Vedant); the retailer index is cited because the review page carries the figure.' },
  { key: 'cpu-ryzen-7-7800x3d', category: 'cpu', market: 'in', currency: 'INR', year: 2023, period: '2023-04', value: 45499, basis: 'listing', sourceId: 'ign-7800x3d', sourceUrl: 'https://in.ign.com/amd-ryzen-7-7800x3d/189054/review/amd-ryzen-7-7800x3d-review', note: 'Highest exact retailer quote recorded (SMC International) in the same review.' },
  { key: 'gpu-rtx-5070', category: 'gpu', market: 'in', currency: 'INR', year: 2025, period: '2025-01', value: 59000, basis: 'launch-price', sourceId: 'iexpress-rtx50-in', sourceUrl: 'https://indianexpress.com/article/technology/tech-news-technology/nvidia-geforce-rtx-5090-5080-5070-ti-price-availability-india-9767028/', note: 'Reference/Founders Edition India price.' },
  { key: 'gpu-rtx-5070-ti', category: 'gpu', market: 'in', currency: 'INR', year: 2025, period: '2025-01', value: 80000, basis: 'launch-price', sourceId: 'iexpress-rtx50-in', sourceUrl: 'https://indianexpress.com/article/technology/tech-news-technology/nvidia-geforce-rtx-5090-5080-5070-ti-price-availability-india-9767028/', note: 'Reference/Founders Edition India price.' },
  { key: 'gpu-rtx-5080', category: 'gpu', market: 'in', currency: 'INR', year: 2025, period: '2025-01', value: 107000, basis: 'launch-price', sourceId: 'mint-rtx50-in', sourceUrl: 'https://www.livemint.com/technology/tech-news/buying-nvidia-rtx-50-series-gpu-heres-the-pricing-for-the-rtx-5070-5070-ti-5080-and-5090-in-india-11736514075723.html', note: 'Reference India price, independently reported by two outlets.' },
  { key: 'gpu-rtx-5090', category: 'gpu', market: 'in', currency: 'INR', year: 2025, period: '2025-01', value: 214000, basis: 'launch-price', sourceId: 'mint-rtx50-in', sourceUrl: 'https://www.livemint.com/technology/tech-news/buying-nvidia-rtx-50-series-gpu-heres-the-pricing-for-the-rtx-5070-5070-ti-5080-and-5090-in-india-11736514075723.html', note: 'Reference India price, independently reported by two outlets.' },

  // ── United States ──────────────────────────────────────────────────────────
  { key: 'gpu-rtx-4060', category: 'gpu', market: 'us', currency: 'USD', year: 2023, period: '2023-06', value: 299, basis: 'launch-price', sourceId: 'nvidia-rtx4060-us', sourceUrl: 'https://www.nvidia.com/en-us/geforce/news/geforce-rtx-4060-4060ti/', note: 'Official US launch starting price, not a current retail quote.' },

  // ── United Kingdom ─────────────────────────────────────────────────────────
  { key: 'gpu-rtx-4060', category: 'gpu', market: 'uk', currency: 'GBP', year: 2026, period: '2026-10', value: 687.78, basis: 'listing', sourceId: 'amazon-uk-rtx4060', sourceUrl: 'https://www.amazon.co.uk/MSI-GeForce-VENTUS-Gaming-Graphics/dp/B0C7W8GZMJ', note: 'Observed new-price offer including estimated import charges; shipped from Amazon EU.' },
  { key: 'gpu-rtx-4060', category: 'gpu', market: 'uk', currency: 'GBP', year: 2026, period: '2026-10', value: 320, basis: 'listing', sourceId: 'amazon-uk-rtx4060', sourceUrl: 'https://www.amazon.co.uk/MSI-GeForce-VENTUS-Gaming-Graphics/dp/B0C7W8GZMJ', note: 'Used offer on the same listing page.' },

  // ── Japan ──────────────────────────────────────────────────────────────────
  { key: 'cpu-ryzen-5-7600', category: 'cpu', market: 'jp', currency: 'JPY', year: 2023, period: '2023-01', value: 37326, basis: 'launch-price', sourceId: 'kakaku-ryzen7600', sourceUrl: 'https://kakaku.com/item/K0001507447/pricehistory/', note: 'Reference price Kakaku uses as the baseline for its −29.1% history figure.' },
  { key: 'cpu-ryzen-5-7600', category: 'cpu', market: 'jp', currency: 'JPY', year: 2026, period: '2026-10', value: 26480, basis: 'current-lowest', sourceId: 'kakaku-ryzen7600', sourceUrl: 'https://kakaku.com/item/K0001507447/pricehistory/', note: 'Lowest listed price at the time of reading; the history page labels the fall as 29.1%.' },
  { key: 'gpu-rtx-4060', category: 'gpu', market: 'jp', currency: 'JPY', year: 2026, period: '2026-10', value: 75000, basis: 'current-lowest', sourceId: 'kakaku-rtx4060', sourceUrl: 'https://kakaku.com/item/K0001548658/', note: 'Lowest listed price; the same page records a 29 June 2023 release date.' },

  // ── Australia ──────────────────────────────────────────────────────────────
  { key: 'gpu-rtx-4060-ti', category: 'gpu', market: 'au', currency: 'AUD', year: 2026, period: '2026-10', value: 599, basis: 'listing', sourceId: 'staticice-rtx4060-au', sourceUrl: 'https://www.staticice.com.au/cgi-bin/search.cgi?q=rtx%204060', note: 'Multiple 4060 Ti listings at this price; the standard RTX 4060 did not appear in the fetched results, so no RTX 4060 Australian price is recorded.' },

  // ── Singapore ──────────────────────────────────────────────────────────────
  { key: 'gpu-rtx-4060', category: 'gpu', market: 'sg', currency: 'SGD', year: 2026, period: '2026-10', value: 570, basis: 'listing', sourceId: 'sourceit-sg-rtx4060', sourceUrl: 'https://sourceit.com.sg/products/nvidia-asus-geforce-rtx-4060-dual-white-oc-graphics-card', note: 'Tax included; shipping calculated separately.' },

  // ── China ──────────────────────────────────────────────────────────────────
  { key: 'gpu-rtx-4060', category: 'gpu', market: 'cn', currency: 'CNY', year: 2023, period: '2023-06', value: 2399, basis: 'launch-price', sourceId: 'nvidia-rtx4060-cn', sourceUrl: 'https://www.nvidia.cn/geforce/news/geforce-rtx-4060-4060ti/', note: 'Official China launch starting price, not a JD.com quote.' },

  // ── Brazil ─────────────────────────────────────────────────────────────────
  { key: 'cpu-ryzen-5-7600', category: 'cpu', market: 'br', currency: 'BRL', year: 2026, period: '2026-10', value: 2535.75, basis: 'current-lowest', sourceId: 'kabum-br-ryzen7600', sourceUrl: 'https://www.kabum.com.br/produto/420277/processador-amd-ryzen-5-7600-3-8ghz-5-1ghz-turbo-cache-32mb-hexa-core-12-threads-am5-wraith-stealth-100-100001015box', note: 'Pix (cash) price at one retailer; the same page advertises 10 interest-free instalments of R$253.57.' },
]);

/** Snapshot date for the figures above — the day the sources were read. */
export const ARCHIVE_SNAPSHOT_DATE = '2026-10-13';

const BASIS_LABEL = {
  'launch-price': 'Launch / reference price',
  'street-price': 'Street price',
  listing: 'Observed listing',
  'current-lowest': 'Lowest listed price',
};

/** Human label for a price basis, used by the UI and the tests. */
export function basisLabel(basis) {
  return BASIS_LABEL[basis] || 'Price';
}

/** Group every point by instrument key, then by market. */
function indexPoints() {
  const byKey = new Map();
  for (const point of PRICE_POINTS) {
    if (!byKey.has(point.key)) byKey.set(point.key, []);
    byKey.get(point.key).push(point);
  }
  return byKey;
}

const POINTS_BY_KEY = indexPoints();

/** All verified points for an instrument, newest first. */
export function pointsFor(key, { market = null } = {}) {
  const points = POINTS_BY_KEY.get(key) || [];
  return points.filter((point) => !market || point.market === market)
    .slice()
    .sort((a, b) => String(b.period || b.year).localeCompare(String(a.period || a.year)) || b.value - a.value);
}

/** How many archive entries currently cite each source. */
export function sourceUsageCounts() {
  const counts = new Map();
  for (const point of PRICE_POINTS) counts.set(point.sourceId, (counts.get(point.sourceId) || 0) + 1);
  return counts;
}

/**
 * Resolve which source Vesper leads with for a set of records.
 *
 * Rule: the source with the most recorded observations wins — "use the one that
 * is most used" — and ties break on the documented `usage.rank`, so a dated
 * retailer record beats an aggregator, which beats press and manufacturer
 * announcements. Returns every contributing source so nothing is hidden.
 *
 * @param {PricePoint[]} records
 * @returns {{source: PriceSource|null, contributors: Array<{source: PriceSource, count: number}>}}
 */
export function preferredSourceFor(records = []) {
  const counts = new Map();
  for (const record of records) counts.set(record.sourceId, (counts.get(record.sourceId) || 0) + 1);
  const contributors = [...counts.entries()]
    .map(([id, count]) => ({ source: SOURCE_BY_ID.get(id) || null, count }))
    .filter((entry) => entry.source)
    .sort((a, b) => b.count - a.count || a.source.usage.rank - b.source.usage.rank || a.source.name.localeCompare(b.source.name));
  return { source: contributors[0]?.source || null, contributors };
}

/**
 * Build the per-year table for one instrument in one market.
 *
 * Years with no verified figure are reported as `not-available`; years before
 * the instrument existed are `not-released` — the two are never conflated, and
 * neither is ever filled with a synthetic number.
 *
 * @param {string} key
 * @param {{market?: string, years?: number[]}} [options]
 * @returns {Array<{year: number, status: YearStatus, currency: string, entries: PricePoint[], best: number|null, worst: number|null, preferred: PriceSource|null, contributors: Array<{source: PriceSource, count: number}>, label: string}>}
 */
export function archiveYearTable(key, { market = 'in', years = ARCHIVE_YEARS } = {}) {
  const instrument = INSTRUMENT_BY_KEY.get(key);
  const instrumentPoints = pointsFor(key, { market });
  const currency = MARKET_BY_ID.get(market)?.currency || 'INR';
  return years.map((year) => {
    const entries = instrumentPoints.filter((point) => point.year === year);
    if (!entries.length) {
      const notReleased = instrument?.launchYear != null && year < instrument.launchYear;
      return {
        year,
        status: notReleased ? 'not-released' : 'not-available',
        currency,
        entries: [],
        best: null,
        worst: null,
        preferred: null,
        contributors: [],
        label: notReleased ? 'Not released' : 'Not available',
      };
    }
    const values = entries.map((point) => point.value);
    const { source, contributors } = preferredSourceFor(entries);
    return {
      year,
      status: 'verified',
      currency,
      entries,
      best: Math.min(...values),
      worst: Math.max(...values),
      preferred: source,
      contributors,
      label: entries.length > 1 ? `${entries.length} verified figures` : 'Verified',
    };
  });
}

/**
 * Lowest-price badge for an instrument: the cheapest verified figure and the
 * percentage fall from the first (oldest) verified figure, matching the
 * drop-percentage badge the tracker shows.
 *
 * @param {string} key
 * @param {{market?: string}} [options]
 * @returns {{available: boolean, reason?: string, lowest: PricePoint|null, first: PricePoint|null, latest: PricePoint|null, dropFromFirstPercent: number|null, dropFromPeakPercent: number|null, currency: string}}
 */
export function lowestPriceBadge(key, { market = 'in' } = {}) {
  const points = pointsFor(key, { market });
  const currency = MARKET_BY_ID.get(market)?.currency || 'INR';
  if (!points.length) {
    return { available: false, reason: `No verified ${MARKET_BY_ID.get(market)?.name || market} figure exists for this component yet.`, lowest: null, first: null, latest: null, dropFromFirstPercent: null, dropFromPeakPercent: null, currency };
  }
  const ordered = points.slice().sort((a, b) => String(a.period || a.year).localeCompare(String(b.period || b.year)));
  const lowest = ordered.reduce((min, point) => (point.value < min.value ? point : min), ordered[0]);
  const first = ordered[0];
  const latest = ordered.at(-1);
  const peak = ordered.reduce((max, point) => (point.value > max.value ? point : max), ordered[0]);
  return {
    available: true,
    lowest,
    first,
    latest,
    // Only meaningful inside a single market/currency pair — never cross-market.
    dropFromFirstPercent: first.value > 0 ? Number((((first.value - lowest.value) / first.value) * 100).toFixed(1)) : null,
    dropFromPeakPercent: peak.value > 0 ? Number((((peak.value - lowest.value) / peak.value) * 100).toFixed(1)) : null,
    currency,
  };
}

/**
 * Compare one instrument across every market Vesper tracks. Markets without a
 * verified figure are returned with `verified: false` and the local comparator
 * sites to check by hand — no conversion, no guess.
 *
 * @param {string} key
 * @param {{year?: number|null}} [options]
 */
export function countryBoard(key, { year = null } = {}) {
  return MARKETS.map((market) => {
    const points = pointsFor(key, { market: market.id }).filter((point) => year == null || point.year === year);
    const { source, contributors } = preferredSourceFor(points);
    return {
      market,
      verified: points.length > 0,
      points,
      preferred: source,
      contributors,
      lowest: points.length ? Math.min(...points.map((point) => point.value)) : null,
      highest: points.length ? Math.max(...points.map((point) => point.value)) : null,
      localTrackers: market.trackers,
    };
  });
}

/**
 * Archive coverage summary: how many instrument/year rows are verified versus
 * reported as not available. Honest headline numbers for the terminal header.
 */
export function archiveSummary({ markets = [...new Set(PRICE_POINTS.map((point) => point.market))] } = {}) {
  const counts = { verified: 0, 'not-available': 0, 'not-released': 0 };
  for (const instrument of ARCHIVE_INSTRUMENTS) {
    for (const market of markets) {
      for (const row of archiveYearTable(instrument.key, { market })) counts[row.status] += 1;
    }
  }
  return {
    snapshotDate: ARCHIVE_SNAPSHOT_DATE,
    instruments: ARCHIVE_INSTRUMENTS.length,
    markets: MARKETS.length,
    marketsWithData: MARKETS.filter((market) => market.verified).length,
    points: PRICE_POINTS.length,
    sources: PRICE_SOURCES.length,
    counts,
  };
}

/**
 * The full credit list: every source, what it covers, how many archive entries
 * cite it, and whether it contributed an actual figure or is only an
 * authorised-feed target.
 */
export function sourceCredits() {
  const counts = sourceUsageCounts();
  return PRICE_SOURCES.map((source) => ({
    ...source,
    observations: counts.get(source.id) || 0,
    contributed: (counts.get(source.id) || 0) > 0,
  })).sort((a, b) => b.observations - a.observations || a.usage.rank - b.usage.rank || a.name.localeCompare(b.name));
}

/** Year rows across every instrument, used by the terminal's "all products" table. */
export function archiveMatrix({ market = 'in', years = ARCHIVE_YEARS } = {}) {
  return ARCHIVE_INSTRUMENTS.filter((instrument) => (POINTS_BY_KEY.get(instrument.key) || []).some((point) => point.market === market))
    .map((instrument) => ({ instrument, rows: archiveYearTable(instrument.key, { market, years }) }));
}
