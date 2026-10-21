/* SkuClinic column alias table.

   THIS IS THE ONE FILE TO EDIT WHEN A PLATFORM RENAMES AN EXPORT COLUMN.

   How matching works (see detect.js):
   1. Every header is normalized: lower case, punctuation and currency signs
      removed, underscores / dashes / slashes become spaces. So "Variant SKU",
      "variant_sku", "VARIANT-SKU" and "Variant SKU:" are all "variant sku".
      A trailing "(USD)", "per unit", or "per order" is also ignored.
   2. Exact pass: for each field, the aliases are tried in order. The first
      alias wins, so put the most specific name first.
   3. Fuzzy pass (only for fields still unmapped): a header that matches an
      alias with the spaces removed ("variantsku"), is one typo away from an
      alias of 6+ letters, or contains every word of an alias. A fuzzy match is
      shown as "guessed" in the mapping step so the user checks it. Words in
      AVOID stop a wrong guess (a "Compare at price" column is never Price).
   4. Any key column (REQUIRED per type) still missing shows a warning and
      the manual mapping step. Nothing is dropped without telling the user.

   Adding a renamed column: add the new name to the field's list below, keep
   the old name too (older exports are still around), and add a test in
   tests/logic.test.js ("renamed columns" section).

   FILE_TYPES entries:
     id / label / blurb  shown in the mapping step
     strong   headers that are close to unique to this export (5 points each)
     support  headers that are common in it (1 point each)
     fields   [field, [aliases...]] read from this export
     required fields that must be found, or the user is warned
     ownFieldsOnly  only the type's own fields are mapped (an order-level
              "Shipping" column is never read as a per-unit cost)
     aggregate  null (one row per SKU), 'orders', 'sales', or 'settlement'
     channel  'amazon' keeps the numbers in amz* fields so they never
              replace the store's own price, fees, or units
     sumDuplicates  rows for the same SKU are added together (Google Ads) */
(function (root) {
  var TM = root.TM || (root.TM = {});

  var FILE_TYPES = [
    {
      id: 'skuclinic_template',
      label: 'SkuClinic template',
      blurb: 'One row per SKU with price, cost, fees, ads, and units.',
      aggregate: null,
      strong: [],
      support: ['sku', 'product name', 'unit cost', 'fees per unit', 'units sold', 'stock units', 'desired profit buffer'],
      ownFieldsOnly: true,
      required: ['sku', 'price', 'cogs'],
      fields: [
        ['sku', ['sku']],
        ['name', ['product name', 'product', 'name']],
        ['price', ['price', 'sale price']],
        ['cogs', ['unit cost', 'cost per unit', 'cogs']],
        ['shipping', ['shipping cost', 'shipping per unit', 'shipping']],
        ['other', ['other costs', 'other cost', 'misc cost', 'misc costs', 'miscellaneous cost', 'packaging cost', 'handling cost']],
        ['fees', ['fees per unit', 'fee per unit']],
        ['payfee', ['payment fee', 'payment fee rate']],
        ['reffee', ['marketplace fee', 'marketplace fee rate', 'referral fee rate']],
        ['returns', ['returns', 'returns rate', 'return rate']],
        ['spend', ['ad spend', 'spend']],
        ['clicks', ['clicks']],
        ['sales', ['conversions']],
        ['units', ['units sold']],
        ['stock', ['stock units', 'stock']],
        ['buffer', ['desired profit buffer', 'buffer']]
      ]
    },
    {
      /* Google Ads > Products / Shopping report. "Item ID" is the classic
         column; newer UI downloads say "Product item ID". Cost is spend. */
      id: 'google_ads',
      label: 'Google Ads product report',
      blurb: 'Spend, clicks, and conversions by item. Rows for the same item in several campaigns are added together.',
      aggregate: null,
      sumDuplicates: true,
      required: ['sku', 'spend', 'clicks'],
      strong: ['item id', 'product item id', 'product id'],
      support: ['clicks', 'impressions', 'impr', 'conversions', 'conv value', 'conversion value', 'avg cpc', 'campaign', 'ad group', 'currency code', 'cost', 'ad spend'],
      fields: [
        ['sku', ['item id', 'product item id', 'product id', 'merchant product id', 'offer id']],
        ['name', ['title', 'product title', 'item title']],
        ['spend', ['cost', 'ad spend', 'spend', 'amount spent']],
        ['clicks', ['clicks']],
        ['sales', ['conversions', 'conv', 'all conv', 'purchases']],
        ['convValue', ['conv value', 'conversion value', 'all conv value', 'total conv value']]
      ]
    },
    {
      /* Merchant Center product feed (TSV/CSV or Sheets). Attribute names use
         underscores in the spec (image_link, sale_price); normalization makes
         them the same as "image link", "sale price". */
      id: 'google_merchant',
      label: 'Google Merchant Center feed',
      blurb: 'Product id, title, price, sale price, and cost of goods sold.',
      aggregate: null,
      ownFieldsOnly: true,
      required: ['sku', 'price'],
      strong: ['link', 'image link', 'availability', 'google product category', 'item group id', 'cost of goods sold', 'gtin', 'mpn', 'condition'],
      support: ['id', 'title', 'price', 'sale price', 'brand', 'description', 'product type'],
      fields: [
        ['sku', ['id', 'offer id']],
        ['name', ['title']],
        ['price', ['price']],
        ['salePrice', ['sale price']],
        ['cogs', ['cost of goods sold']]
      ]
    },
    {
      /* Shopify Products > Export. 2024+ exports renamed "Handle" to "URL handle"
         and "Variant Inventory Qty" to "Inventory quantity". Both are kept. */
      id: 'shopify_products',
      label: 'Shopify product export',
      blurb: 'SKU, price, cost per item, and inventory per variant. Variant rows take the product title.',
      aggregate: null,
      ownFieldsOnly: true,
      required: ['sku', 'price', 'cogs'],
      strong: ['variant sku', 'variant price', 'cost per item', 'url handle', 'inventory quantity', 'variant inventory qty'],
      support: ['handle', 'vendor', 'published', 'option1 name', 'variant barcode', 'compare at price', 'variant compare at price', 'published on online store', 'product category'],
      fields: [
        ['sku', ['variant sku', 'sku']],
        ['name', ['title', 'product title']],
        ['price', ['variant price', 'price']],
        ['cogs', ['cost per item', 'variant cost', 'unit cost']],
        ['stock', ['variant inventory qty', 'inventory quantity', 'inventory qty', 'available']],
        ['handle', ['handle', 'url handle']],
        ['opt1', ['option1 value', 'option 1 value']],
        ['opt2', ['option2 value', 'option 2 value']],
        ['opt3', ['option3 value', 'option 3 value']]
      ]
    },
    {
      /* Shopify Orders > Export. Older files say "Lineitem", some tools write
         "Line item". */
      id: 'shopify_orders',
      label: 'Shopify orders export',
      blurb: 'Units sold, totaled by line-item SKU. Refunded, voided, and cancelled orders are left out.',
      aggregate: 'orders',
      ownFieldsOnly: true,
      required: ['sku', 'units'],
      strong: ['lineitem sku', 'line item sku', 'lineitem quantity', 'line item quantity'],
      support: ['lineitem name', 'line item name', 'lineitem price', 'line item price', 'financial status', 'fulfillment status'],
      fields: [
        ['sku', ['lineitem sku', 'line item sku']],
        ['name', ['lineitem name', 'line item name']],
        ['units', ['lineitem quantity', 'line item quantity']],
        ['price', ['lineitem price', 'line item price']],
        ['discount', ['lineitem discount', 'line item discount']],
        ['orderId', ['name', 'order name', 'order', 'order number', 'order id']],
        ['finStatus', ['financial status', 'payment status']],
        ['cancelledAt', ['cancelled at', 'canceled at']],
        ['refunded', ['refunded amount', 'amount refunded']]
      ]
    },
    {
      /* Shopify Analytics > Reports > Sales by product variant. 2025+ reports
         say "Net items sold"; older ones "Net quantity". */
      id: 'shopify_sales',
      label: 'Shopify sales by product variant',
      blurb: 'Net items sold and net sales by variant SKU.',
      aggregate: 'sales',
      ownFieldsOnly: true,
      required: ['sku', 'units'],
      strong: ['product variant sku', 'net quantity', 'net items sold'],
      support: ['net sales', 'gross sales', 'product title', 'product variant title'],
      fields: [
        ['sku', ['product variant sku', 'variant sku']],
        ['name', ['product title', 'title']],
        ['variantTitle', ['product variant title', 'variant title']],
        ['units', ['net items sold', 'net quantity', 'ordered item quantity', 'quantity ordered']],
        ['revenue', ['net sales']]
      ]
    },
    {
      /* Etsy Shop Manager > Settings > Options > Download data > Listings.
         Headers are upper case (TITLE, PRICE, QUANTITY, SKU). QUANTITY is stock. */
      id: 'etsy_listings',
      label: 'Etsy listings export',
      blurb: 'SKU, title, price, and quantity in stock. Quantity is stock on hand, not units sold.',
      aggregate: null,
      ownFieldsOnly: true,
      required: ['sku', 'price'],
      strong: ['materials', 'image1', 'variation 1 type', 'variation 1 name', 'variation 1 values', 'who made', 'when made'],
      support: ['title', 'description', 'price', 'quantity', 'currency code', 'tags', 'sku'],
      fields: [
        ['sku', ['sku']],
        ['name', ['title']],
        ['price', ['price']],
        ['stock', ['quantity']]
      ]
    },
    {
      /* Etsy > Download data > Orders > "Order items" (EtsySoldOrderItems). */
      id: 'etsy_sold',
      label: 'Etsy sold order items',
      blurb: 'Units sold and selling price by SKU, after item discounts.',
      aggregate: 'orders',
      ownFieldsOnly: true,
      required: ['sku', 'units'],
      strong: ['sale date', 'item name', 'transaction id', 'listing id', 'order shipping', 'item total', 'ship name'],
      support: ['quantity', 'price', 'sku', 'buyer', 'coupon code', 'discount amount'],
      fields: [
        ['sku', ['sku']],
        ['name', ['item name']],
        ['units', ['quantity']],
        ['price', ['price']],
        ['discount', ['discount amount']]
      ]
    },
    {
      /* Seller Central > Reports > Fulfillment > Fee Preview. Raw downloads use
         dashed names (estimated-fee-total, your-price); normalization handles it. */
      id: 'amazon_fee_preview',
      label: 'Amazon fee preview',
      blurb: 'Estimated Amazon fees per SKU. Kept as the Amazon channel; it does not change your store price.',
      aggregate: null,
      channel: 'amazon',
      ownFieldsOnly: true,
      required: ['sku', 'fees'],
      strong: ['estimated fee total', 'expected fulfillment fee per unit', 'fnsku', 'estimated referral fee per unit'],
      support: ['your price', 'sales price', 'asin', 'product name', 'fulfilled by', 'amazon store'],
      fields: [
        ['sku', ['sku', 'seller sku', 'merchant sku']],
        ['asin', ['asin']],
        ['name', ['product name', 'item name']],
        ['price', ['your price', 'sales price']],
        ['fees', ['estimated fee total', 'total fees']]
      ]
    },
    {
      /* Seller Central > Payments > Settlement (flat file V2). */
      id: 'amazon_settlement',
      label: 'Amazon settlement',
      blurb: 'Amazon revenue, refunds, and fees totaled by SKU. Kept as the Amazon channel.',
      aggregate: 'settlement',
      channel: 'amazon',
      ownFieldsOnly: true,
      required: ['sku', 'amountType', 'amount'],
      strong: ['amount type', 'settlement id', 'quantity purchased'],
      support: ['amount description', 'amount', 'posted date', 'transaction type', 'marketplace name', 'settlement start date', 'settlement end date'],
      fields: [
        ['sku', ['sku', 'seller sku']],
        ['asin', ['asin']],
        ['amountType', ['amount type']],
        ['amountDesc', ['amount description']],
        ['amount', ['amount']],
        ['units', ['quantity purchased']],
        ['txnType', ['transaction type']],
        ['periodStart', ['settlement start date']],
        ['periodEnd', ['settlement end date']]
      ]
    },
    {
      /* Any spreadsheet the seller keeps: SKU plus a cost. */
      id: 'cost_sheet',
      label: 'Cost sheet',
      blurb: 'Unit cost, shipping, and other costs by SKU.',
      aggregate: null,
      required: ['sku', 'cogs'],
      strong: ['unit cost', 'cogs', 'cost per unit', 'cogs per unit', 'landed cost'],
      support: ['shipping', 'shipping cost', 'other cost', 'other costs', 'misc cost', 'asin', 'sku'],
      fields: [
        ['sku', ['sku', 'upc sku', 'upc', 'item id', 'item sku', 'product code']],
        ['name', ['product', 'product name', 'name', 'title']],
        ['cogs', ['unit cost', 'cogs', 'cost per unit', 'cogs per unit', 'landed cost', 'cost per item', 'cost']],
        ['shipping', ['shipping', 'shipping cost', 'shipping per unit']],
        ['other', ['other cost', 'other costs', 'other', 'misc cost', 'misc costs', 'misc', 'miscellaneous cost', 'packaging', 'packaging cost', 'handling cost']],
        ['asin', ['asin']],
        ['price', ['price', 'sale price']]
      ]
    }
  ];

  /* Generic aliases per field, used for files with no specific type (and
     added after a type's own fields unless the type is ownFieldsOnly). */
  var FIELD_ALIASES = [
    ['sku', ['sku', 'variant sku', 'seller sku', 'item sku', 'item id', 'product item id', 'upc sku', 'upc', 'product code']],
    ['asin', ['asin']],
    ['name', ['product name', 'product title', 'title', 'item name', 'name']],
    ['price', ['sale price', 'variant price', 'your price', 'selling price', 'unit price', 'price']],
    ['cogs', ['unit cost', 'cogs per unit', 'cost per unit', 'cost per item', 'landed cost', 'cogs']],
    ['shipping', ['shipping cost', 'shipping per unit', 'shipping']],
    ['other', ['other costs', 'other cost', 'packaging', 'packaging cost', 'misc cost', 'misc costs', 'miscellaneous cost', 'handling cost']],
    ['fees', ['estimated fee total', 'fees per unit', 'fee per unit', 'total fees', 'fees']],
    ['payfee', ['payment fee', 'payment fee rate', 'processing fee rate']],
    ['reffee', ['marketplace fee', 'referral fee rate', 'commission rate']],
    ['returns', ['returns rate', 'return rate']],
    ['spend', ['ad spend', 'spend', 'amount spent']],
    ['clicks', ['clicks']],
    ['sales', ['conversions', 'all conv', 'purchases']],
    ['units', ['units sold', 'units', 'net items sold', 'net quantity', 'quantity sold', 'quantity']],
    ['stock', ['stock units', 'stock', 'variant inventory qty', 'inventory quantity', 'on hand', 'inventory']],
    ['buffer', ['desired profit buffer', 'buffer']],
    ['revenue', ['net sales', 'revenue']]
  ];

  /* Words that rule out a fuzzy guess for a field. */
  var AVOID = {
    sku: ['parent', 'group', 'barcode'],
    price: ['compare', 'cost', 'shipping', 'tax', 'fee', 'total', 'discount'],
    cogs: ['shipping', 'tax', 'ad', 'ads', 'avg', 'conv', 'conversion', 'per click', 'cpc'],
    spend: ['budget'],
    units: ['price', 'value', 'refund'],
    stock: ['policy', 'tracker', 'location'],
    fees: ['rate', 'shipping'],
    clicks: ['rate', 'ctr'],
    sales: ['value', 'rate', 'cost']
  };

  var FIELD_LABELS = {
    sku: 'SKU', asin: 'ASIN', name: 'Product name', price: 'Price', salePrice: 'Sale price',
    cogs: 'Unit cost', shipping: 'Shipping per unit', other: 'Other cost', fees: 'Fees per unit $',
    payfee: 'Payment fee %', reffee: 'Marketplace fee %', returns: 'Returns %',
    spend: 'Ad spend', clicks: 'Clicks', sales: 'Conversions', convValue: 'Conv. value',
    units: 'Units sold', stock: 'Stock on hand', buffer: 'Buffer %', revenue: 'Revenue',
    handle: 'Product handle', opt1: 'Option 1', opt2: 'Option 2', opt3: 'Option 3',
    variantTitle: 'Variant title', discount: 'Line discount', orderId: 'Order number',
    finStatus: 'Financial status', cancelledAt: 'Cancelled at', refunded: 'Refunded amount',
    amountType: 'Amount type', amountDesc: 'Amount description', amount: 'Amount',
    txnType: 'Transaction type', periodStart: 'Period start', periodEnd: 'Period end'
  };

  TM.FILE_TYPES = FILE_TYPES;
  TM.FIELD_ALIASES = FIELD_ALIASES;
  TM.ALIAS_AVOID = AVOID;
  TM.FIELD_LABELS = FIELD_LABELS;
})(typeof window !== 'undefined' ? window : globalThis);
