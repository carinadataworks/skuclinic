# SkuClinic

SkuClinic is a browser-only profit tool for Shopify brands that run Google Shopping or Performance Max, roughly $10K–$200K a month and 20–300 SKUs. You drop in the exports you already download. It joins them by SKU and tells you the most you can pay per click, and which products to fix: raise the price, cut the ad, stop selling, or review fees.

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
- Plans (planned, not billed yet; the single source is `js/plans.js`): Free, 25 SKUs, this tab only. Audit Pass, $29 one-time for 30 days of Pro. Pro, $15/mo or $120/yr: up to 50,000 SKUs, settings saved in this browser, CSV of the fixes. Multichannel, $29/mo or $240/yr: everything in Pro plus up to 5 separate stores or clients, up to 50,000 SKUs per store. Founding members: 40% off for life on Pro and Multichannel for the first 200 paid accounts, while the subscription stays active.

## Where the Stripe links go

Edit `config.js`:

```js
var STRIPE_AUDIT_LINK = '';          // Audit Pass, $29 one-time
var STRIPE_PRO_MONTHLY_LINK = '';    // Pro, $15/mo
var STRIPE_PRO_YEARLY_LINK = '';     // Pro, $120/yr
var STRIPE_MULTI_MONTHLY_LINK = '';  // Multichannel, $29/mo
var STRIPE_MULTI_YEARLY_LINK = '';   // Multichannel, $240/yr
var SIGNUP_FORM_ENDPOINT = 'https://formsubmit.co/ajax/skuclinicapp@gmail.com';
var SIGNUP_SCRIPT_URL = '';       // Google Apps Script /exec URL; set it to replace FormSubmit
var CF_ANALYTICS_TOKEN = '';      // Cloudflare Web Analytics token
```

Leave a Stripe string empty and that button says **Join founding list:** plus the plan and price (for example *Join founding list: Pro $15/mo*). The prices on the page are marked planned and are not billed. Paste a Payment Link and that button opens checkout.

`SIGNUP_FORM_ENDPOINT` is the FormSubmit AJAX address. Empty means the signup form does not send anything and says nothing is stored. The same address receives feedback from the app. Feedback buttons stay hidden until it is set.

`SIGNUP_SCRIPT_URL` is the `/exec` URL of a Google Apps Script web app deployed from skuclinicapp@gmail.com (script and steps: `signup-backend/Code.gs` and `README.md`, kept outside this repo). When it is set, signup and feedback POST there instead of FormSubmit (`fetch` with `mode: 'no-cors'` and a form-encoded body). The script adds a row to the "SkuClinic signups" Sheet and emails the inbox from itself, so it is not flagged as spam. The response is opaque, so a completed request counts as sent and a network error as failed. Empty means FormSubmit is used exactly as before. The CSP `connect-src` already allows `script.google.com` and `script.googleusercontent.com`. When you switch, update the FormSubmit wording in `privacy.html`.

`CF_ANALYTICS_TOKEN` adds the Cloudflare Web Analytics beacon when set. Empty adds nothing.

There are no accounts yet. Pro and Multichannel can be unlocked in the browser with the codes in the same file (`PRO_UNLOCK_CODE`, `MULTICHANNEL_UNLOCK_CODE`). That check is not security — anyone who can read `config.js` can unlock the paid features. The note to replace it with real Stripe billing is a comment in `config.js` and in the app script, not copy on the site.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Landing page |
| `app/` | The calculator |
| `guide.html` | How to export from Shopify, Google Ads, and Amazon |
| `privacy.html`, `terms.html` | Drafts. Both say data is processed only in the browser. |
| `config.js` | Stripe links, FormSubmit endpoint, Apps Script URL, analytics token, unlock codes |
| `js/` | App, import detection, bid math, leak math |
| `css/` | Styles. No build step. |
| `samples/` | One sample file for Shopify, Google Ads, and Amazon, plus orders, a cost sheet, and a small settlement |
| `vendor/xlsx.full.min.js` | SheetJS Community Edition 0.20.3 (Apache-2.0). See `vendor/SHEETJS-LICENSE`. |
| `tests/logic.test.js` | Parser and recommendation checks. `node tests/logic.test.js` |
| `tests/forms.test.js` | Signup and feedback payloads. `node tests/forms.test.js` |
| `tests/script-signup.e2e.js` | Browser check of the Apps Script path against a local mock. `NODE_PATH=<dir with playwright> node tests/script-signup.e2e.js` |

## Privacy

Product files, orders, costs, and ad numbers are processed locally in the browser. They are never uploaded and we never store them. Paid “saved settings” use this browser’s local storage only (IndexedDB in the same browser when a large workspace does not fit local storage).
