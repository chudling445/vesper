# India market trackers

The **Market Trackers** tab in Builds & Money keeps dated, attributed observations for Indian PC parts, index/fund values, and home-loan/LAP terms. Web and desktop use the same planner. Tracker data is stored in the local ignored `work` directory and is not committed or sent to an external service by Vesper. Feed polling is opt-in except for AMFI's public daily NAV file.

## What updates automatically

| Dataset | Check interval | Built-in source | What the timestamp means |
|---|---:|---|---|
| PC component listings | 3 hours | None | Configure a permitted retailer/marketplace feed. No stores are scraped by default. |
| Mutual-fund NAV | Hourly | [AMFI published NAV file](https://portal.amfiindia.com/spages/NAVAll.txt) | Polling is hourly, but the NAV is normally published once per business day. The source's NAV date and Vesper's check time are stored separately. Weekends, holidays, and source delays can leave NAV unchanged or stale. |
| Index levels and ETFs | Hourly | None | Configure a permitted source feed; no exchange API or index dataset is bundled. |
| Home-loan and LAP terms | Every 48 hours | None | Configure a permitted lender/publication feed or enter dated terms manually. Rates vary by borrower, property, amount, credit score, and eligibility. |
| Market-stress indicators | Every 2 hours | None | Configure sources that publish raw values and a documented 0–100 normalization. No crash probability, crash timing, or financial-advice signal is calculated. |

AMFI's NAV file provides current scheme NAVs; it is not a complete historical archive. The built-in adapter keeps scheme names that identify an index (for example Nifty, Sensex, or BSE index names); it does not label every mutual fund an index fund and ignores old scheme rows more than 30 days behind the check date. Automatic history starts when Vesper first observes each published date. For an individual AMFI index scheme, **Import verified history from 2020** can request the historical series from [MFAPI.in](https://www.mfapi.in/docs/), whose public API documents free, unauthenticated access and asks clients to cache responses. Vesper fetches only the selected scheme on explicit user action, checks that the API's latest NAV on the official AMFI observation date matches the current [AMFI NAV file](https://portal.amfiindia.com/spages/NAVAll.txt), and refuses the import if the scheme code/name differs or the same-date cross-check is missing or differs. It stores only records from 2020 through the cross-checked date, with MFAPI.in named and linked as the history source; this is a third-party mirror, not an AMFI historical publication. The older daily series is attributed to that mirror but cannot be independently cross-checked record-by-record against AMFI's current-only file. The import is not automatic or repeated on the hourly schedule. Index values are never mixed with rupee-denominated fund NAVs.

The data adapters do not promise coverage of “all sites.” Use only feeds you are authorized to access and whose terms permit automated requests. Vesper does not bypass logins, bot checks, paywalls, rate limits, or access controls. No API keys or prices are bundled. If a source does not publish a value, the tracker shows missing coverage rather than guessing.

## Configure live feeds

Copy `pc-price-feeds.example.json` to the ignored `pc-price-feeds.local.json` and/or copy `money-tracker-feeds.example.json` to the ignored `money-tracker-feeds.local.json`. These local files are intentionally excluded by `.gitignore` and `.dockerignore`. Restart Vesper after changing feed URLs. Never put a secret in a URL or commit a local feed file. A feed can use `tokenEnv` to name an environment variable; the value is sent as a bearer token only to that feed's configured HTTPS host and is not returned to the browser.

Feed hosts must use public HTTPS, resolve only to public addresses, and return a non-redirecting endpoint. Requests have a 15-second timeout, a 4 MiB response limit, no browser access, and no arbitrary request headers. A source that needs a special signature should be connected through a small, operator-controlled adapter that emits the documented JSON. Per-feed failures appear in the UI and server log; an unavailable feed does not erase its stored observations.

Example `pc-price-feeds.local.json`:

```json
{
  "schemaVersion": 1,
  "feeds": [
    {
      "id": "authorized-parts-feed",
      "name": "Authorized parts feed",
      "url": "https://your-domain.example/api/vesper-parts.json",
      "tokenEnv": "VESPER_PARTS_FEED_TOKEN"
    }
  ]
}
```

The configured endpoint returns JSON in this shape:

```json
{
  "schemaVersion": 1,
  "observedAt": "2026-10-12T12:00:00.000Z",
  "listings": [
    {
      "partId": "gpu-geforce-rtx-4060-8gb",
      "condition": "new",
      "priceINR": 28999,
      "source": "Authorized retailer",
      "sourceUrl": "https://retailer.example/product",
      "listingId": "retailer-sku-123",
      "availability": "available",
      "observedAt": "2026-10-12T11:55:00.000Z"
    }
  ]
}
```

`condition` is exactly `new`, `used`, or `free`; free listings have price zero. Prices must already be INR. A source must identify each listing and return its observed time; an import can contain older dated observations back to 2020. Unknown products stay separate custom items unless the feed supplies a catalog `partId` or exact name. Vesper does not convert foreign currencies or infer product matches by fuzzy title similarity.

The money feed configuration has separate `fundFeeds`, `loanFeeds`, and `stressFeeds` arrays. A fund feed returns `{ "schemaVersion": 1, "type": "fund", "funds": [...] }`; each item has `instrumentId`, `name`, `instrumentType` (`index`, `index-fund`, `etf`, or `other`), `valueType` (`index-level` for an index, `nav` for a fund/ETF), positive `value`, `observedAt`, `source`, and HTTPS `sourceUrl`. NAV is INR per unit; an index level is points with its own unit, not currency. `publishedAt` is optional when the publisher provides it. `returnBasis` for indices is `price-index`, `total-return-index`, or `not-stated`. For official lender terms, the [ICICI Bank interest-rate page](https://www.icici.bank.in/personal-banking/loans/home-loan/interest-rates) includes home-loan and loan-against-property tables; capture the rate slab, publication/validity dates, fees, and eligibility that apply to the observation rather than copying a single conditional starting rate.

For a stress provider, add an entry to `stressFeeds`, for example:

```json
{
  "id": "authorized-stress-provider",
  "name": "Authorized market-stress source",
  "url": "https://your-domain.example/api/vesper-stress.json",
  "tokenEnv": "VESPER_STRESS_FEED_TOKEN"
}
```

Its HTTPS JSON endpoint must return `{"schemaVersion":1,"type":"stress","stress":[...]}` with the stress-observation fields described below. Keep credentials in environment variables, not in the URL or feed JSON.

A loan feed returns `{ "schemaVersion": 1, "type": "loan", "loans": [...] }`; each item has `lender`, `loanType` (`home-loan` or `lap`), `annualRatePercent` or ordered `annualRateMinPercent`/`annualRateMaxPercent`, and HTTPS `sourceUrl`. Optional fields include `productName`, processing fee percent/fixed INR, minimum/maximum tenure in months, maximum LTV, eligibility, terms, and `publishedAt`. Vesper records `checkedAt` itself; a check time does not mean the lender changed or confirmed its terms.

A stress feed returns `{ "schemaVersion": 1, "type": "stress", "stress": [...] }`. Each item needs `market` (`india`, `global`, or `reference-2008`), `category` (`volatility`, `drawdown`, `credit`, `liquidity`, `breadth`, `currency`, or `flows`), `indicatorId`, `name`, raw numeric `value`, `unit`, `stressScore` from 0 through 100, a source `scoreMethod`, `observedAt`, `source`, and HTTPS `sourceUrl`. The source-specific method must explain how the raw indicator became a normalized stress score and why higher scores mean more observed stress. Vesper does not invent that mapping. `reference-2008` records must be dated in 2008 and are manual/imported historical references; live feeds may only send recent observations.

For the visual summary, the latest observation for each indicator is used. Within a represented category, indicator scores are averaged; represented categories receive equal weight. Missing categories are excluded, never filled with zero. The result is a transparent descriptive composite with displayed category/indicator coverage, not a validated universal index. Current India/global records older than 72 hours are marked stale; sources may publish less frequently than the two-hour feed poll. A decline means the selected indicators eased, not that an intervention caused the decline. The 2008 view is a historical reference and does not imply current conditions are equivalent.

## Manual history and calculations

The tracker forms add individual source-backed records. The JSON import accepts either an array of records or an object with an `observations` array. Use **Export selected history** to download a portable JSON file. Imported records must keep the original source name, HTTPS source URL, and observation date; feed credentials are never part of an export.

For each PC part and condition, annual rows cover 2020 through the current calendar year. “Not released” is shown only when the catalog has a launch year; otherwise missing periods say “No verified data.” Best price, median, mean, sample count, source count, and new/used differences use distinct observed listings from the last 30 days. Listings can differ in condition, seller, warranty, shipping, and availability, so these summaries are not purchase recommendations.

The optional 2027/2028 part-price projection uses a Theil–Sen robust linear trend on annual medians of recorded observations. It is withheld unless there are at least six dated observations, three distinct calendar years, three distinct listings, and a recent observation within 18 months. Its displayed range is a heuristic uncertainty band, not a confidence guarantee. It never uses the catalogue's approximate launch-price or legacy market-regime metadata to fill missing years or forecast a value.

Index/fund percentage changes are calculated only within the same instrument, value type, and source using dated values. NAV change alone excludes cash distributions; a price-index change excludes dividends, while a total-return index includes reinvestment only if that is the source's stated index basis. Different funds or indices do not become comparable simply because both are displayed as percentages. No future fund return is predicted.

The EMI calculator uses a monthly reducing-balance payment: `EMI = P × r × (1+r)^n ÷ ((1+r)^n−1)`, where `r` is the annual nominal rate divided by 12 and `n` is the number of months. It assumes a fixed rate and equal monthly payments. Entered processing fees can be added; unknown fees, insurance, taxes, legal/valuation costs, floating-rate changes, lender rounding, disbursement timing, and borrower eligibility are excluded. The result is a mathematical estimate, not a lender offer, eligibility decision, or financial advice.

## Source timing and limits

- AMFI's public NAV file carries a NAV effective date, not a precise publication timestamp; Vesper stores that date separately from its hourly fetch/check time. NAV publication and availability are not hourly.
- MFAPI.in is a third-party historical NAV mirror. A successful import verifies only that the API's NAV for the newest AMFI-published date matches the official AMFI file; it does not establish that every older mirrored record has been independently verified. If this cross-check fails, the historical import is withheld rather than silently accepted.
- Fund NAV comparisons do not automatically account for distributions, loads, expense ratios, tax, or tracking error. Prefer a total-return index when comparing market performance, and verify source methodology.
- Indian lender advertising often describes conditional “starting at” rates. Preserve the source's borrower slab, product, eligibility, publication date, fees, and other terms in separate records or notes; do not compare conditional rates as guaranteed offers.
- A source outage or holiday can make the most recent observation stale. Always inspect the source and its timestamps directly before making a purchase or financial decision.
