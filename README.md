# TrueMargin

TrueMargin is a browser-only profit tool for Shopify brands that run Google Shopping or Performance Max, roughly $10K–$200K a month and 20–300 SKUs. You drop in the exports you already download. It joins them by SKU and tells you the most you can pay per click, and which products to fix: raise the price, cut the ad, stop selling, or review fees.

Nothing is uploaded. There is no server, no account connection, and no secret in this repo.

© 2026 Kyle Guy. All rights reserved.

## Run it

Any static file server works. From this folder:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/`. The marketing page is `index.html`. The app is `app/`.

GitHub Pages works from the repository root. `.nojekyll` is included so Pages does not rewrite the files.

Opening `index.html` as a `file://` URL loads the pages, but **Load sample files** needs a server so the browser can fetch the CSVs.

## What you can do

- Drop a Shopify product export, a Shopify orders export, a Google Ads product report, a cost sheet, or an Amazon fee preview or settlement. Amazon is optional.
- The header row is found for you, including the title rows on a Google Ads CSV. You get a mapping preview and can change the file type or any column.
- Bid calculator: max CPC, target ROAS, and a recommendation per SKU. Spend with zero sales is “Decrease — losing money.” A buffer of 0% stays 0%. An imported buffer of `1` is 1%, not 100%. `0.2` is read as 20%.
- Profit Leak Finder: profit per unit and per SKU after cost, fees, and ad spend, plus an estimated annual leak.
- Free plan: 25 SKUs, this tab only. Pro: unlimited SKUs, settings saved in this browser, CSV of the fixes. Agency: a separate store per client, for freelance ad managers.

## Where the Stripe links go

Edit `config.js`:

```js
var STRIPE_PRO_MONTHLY_LINK = ''; // $29/mo
var STRIPE_PRO_YEARLY_LINK = '';  // $290/yr
var STRIPE_AGENCY_LINK = '';      // $79/mo
```

Leave a string empty and that button says **Coming soon**.

There are no accounts yet. Pro and Agency can be unlocked in the browser with the placeholder codes in the same file (`PRO_UNLOCK_CODE`, `AGENCY_UNLOCK_CODE`). That check is not security — anyone who can read `config.js` can unlock the paid features. Replace it with real Stripe billing before you charge anyone. The upgrade dialog is marked TODO for that reason. The email form on the home page does not submit anywhere; it is marked TODO as well.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Landing page |
| `app/` | The calculator |
| `guide.html` | How to export from Shopify, Google Ads, and Amazon |
| `privacy.html`, `terms.html` | Drafts. Both say data is processed only in the browser. |
| `config.js` | Stripe links and the temporary unlock codes |
| `js/` | App, import detection, bid math, leak math |
| `css/` | Styles. No build step. |
| `samples/` | One sample file for Shopify, Google Ads, and Amazon, plus orders, a cost sheet, and a small settlement |
| `vendor/xlsx.full.min.js` | SheetJS Community Edition 0.20.3 (Apache-2.0). See `vendor/SHEETJS-LICENSE`. |
| `tests/logic.test.js` | Parser and recommendation checks. `node tests/logic.test.js` |

## Privacy

Product files, orders, costs, and ad numbers are processed locally in the browser. They are never uploaded and we never store them. Paid “saved settings” use this browser’s local storage only.
