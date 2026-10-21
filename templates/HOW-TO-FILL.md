# SkuClinic blueprint: how to fill it in

One row per product (SKU). Fill it in with Google Sheets, Excel, or Numbers, then download it as CSV
(Google Sheets: File > Download > Comma-separated values) and drop it on the app.

| Column | Required? | What to put in it | Example |
|---|---|---|---|
| SKU | **Required** | Your product code. It must match the Item ID in Google Ads and the SKU in Shopify exactly, or the rows won't join up. | MUG-ENAMEL-12 |
| Product name | Recommended | Any name you'll recognize. | Enamel camp mug 12oz |
| Price | **Required** | The price you sell it for, per unit, before tax. | 28.00 |
| Unit cost | **Required** | What one unit costs you (COGS). | 8.00 |
| Shipping cost | Optional | The shipping *you* pay per unit (not what the customer pays). | 1.50 |
| Other costs | Optional | Packaging, inserts, and similar costs per unit. | 0.40 |
| Fees per unit | Optional | Payment and marketplace fees per unit, in dollars (for example, Shopify Payments 2.9% + $0.30 on $28 is $1.11). | 1.11 |
| Ad spend | Optional | What you spent on ads for this SKU during the period. | 90.00 |
| Clicks | Optional | Ad clicks during the period. | 400 |
| Conversions | Optional | Sales the ad platform credits to ads during the period. | 22 |
| Units sold | Optional | Total units sold in the period, from all sources. If you leave it blank, Conversions is used instead. | 80 |
| Stock units | Optional | Units you have on hand right now. | 120 |
| Desired profit buffer | Optional | The share of unit profit you refuse to spend on ads. 20 means 20%. 0 means 0%. Leave it blank to use the app's default (20%). | 20 |

Rules:
- Use plain numbers. `$1,234.50` works too, but leave out currency codes like `USD 12.00` and the € / £ signs (see the audit note on UTF-8).
- Use the same date range for every row: one month is the default. In the Leak Finder, set "Period these numbers cover" to match.
- Keep one row per SKU. If the same SKU appears twice, the last row replaces the earlier one. It does **not** add them up.
- Leave a cell blank if you don't know the value. Don't type 0 for "unknown": 0 means zero.
- Services and one-off items work if you treat them as a "SKU": put the price and your delivery cost in Unit cost.

What you get back: the Bid calculator shows the max CPC, target ROAS, and a bid recommendation. The Profit Leak Finder shows the
profit per unit and per period, the action (Raise price, Cut ads, Stop selling, Review fees, Healthy), and the estimated annual leak.
