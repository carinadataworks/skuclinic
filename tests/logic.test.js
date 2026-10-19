/* Node checks for parsers, bid math, file detection, and leak actions.
   Run: node tests/logic.test.js
   No dependencies beyond the vendored SheetJS build. */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var root = path.join(__dirname, '..');
var context = { console: console };
context.window = context;
context.globalThis = context;
context.XLSX = require(path.join(root, 'vendor/xlsx.full.min.js'));
vm.createContext(context);
['js/util.js', 'js/compute.js', 'js/detect.js', 'js/leak.js'].forEach(function (file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
});
var TM = context.TM;
var XLSX = context.XLSX;

function grid(file) {
  var text = fs.readFileSync(path.join(root, file), 'utf8');
  var wb = XLSX.read(text, { type: 'string' });
  return TM.gridFromWorkbook(wb);
}

var failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok  ' + name);
  } catch (err) {
    failed++;
    console.error('FAIL ' + name);
    console.error(err.stack || err);
  }
}

check('zeros and currency parse', function () {
  assert.strictEqual(TM.parseNumber(0), 0);
  assert.strictEqual(TM.parseNumber('0'), 0);
  assert.strictEqual(TM.parseNumber('$1,234.56'), 1234.56);
  assert.strictEqual(TM.parseNumber(''), undefined);
  assert.strictEqual(TM.parseNumber('--'), undefined);
});

check('buffer 0 stays 0 and 1 stays 1 percent', function () {
  assert.strictEqual(TM.parsePercent(0), 0);
  assert.strictEqual(TM.parsePercent('0'), 0);
  assert.strictEqual(TM.parsePercent('1'), 1);
  assert.strictEqual(TM.parsePercent('1%'), 1);
  assert.strictEqual(TM.parsePercent(1), 1);
  assert.strictEqual(TM.parsePercent('0.2'), 20);
  assert.strictEqual(TM.parsePercent(0.2), 20);
  assert.strictEqual(TM.parsePercent('20%'), 20);
  assert.strictEqual(TM.parsePercent('100'), 100);
});

check('0% buffer does not become 20%', function () {
  var c = TM.computeProduct({ price: 30, cogs: 12, clicks: 20, sales: 1, spend: 10 }, 0);
  assert.ok(Math.abs(c.maxcpc - 0.9) < 0.001, 'max cpc ' + c.maxcpc);
  var c20 = TM.computeProduct({ price: 30, cogs: 12, clicks: 20, sales: 1, spend: 10 }, 20);
  assert.ok(Math.abs(c20.maxcpc - 0.72) < 0.001, 'max cpc 20 ' + c20.maxcpc);
});

check('spend with zero sales is losing money and keeps the zero', function () {
  var c = TM.computeProduct({ price: 20, cogs: 8, spend: 200, clicks: 300, sales: 0 }, 20);
  assert.strictEqual(c.sales, 0);
  assert.strictEqual(c.recKey, 'downZero');
  assert.ok(c.recText.indexOf('losing money') !== -1);
  assert.ok(Math.abs(c.netProfit - (-200)) < 0.001, 'net ' + c.netProfit);
});

check('imported buffer of 1 is 1 percent', function () {
  var c = TM.computeProduct({ price: 30, cogs: 12, clicks: 20, sales: 1, spend: 10, buffer: 1 }, 20);
  assert.strictEqual(c.bufferPct, 1);
  assert.ok(c.maxcpc > 0.8, 'max cpc should stay near 0.89, got ' + c.maxcpc);
});

check('google ads title rows and columns', function () {
  var a = TM.analyze(grid('samples/google-ads-product-report.csv'));
  assert.strictEqual(a.ok, true, a.error);
  assert.strictEqual(a.type, 'google_ads');
  assert.ok(a.headerIndex >= 2, 'header index ' + a.headerIndex);
  assert.ok(a.period && a.period.days === 31, JSON.stringify(a.period));
  var m = TM.materialize(a, a.mapping);
  assert.strictEqual(m.error, null, m.error);
  assert.strictEqual(m.records.length, 10);
  assert.ok(m.skippedTotal >= 1);
  var usb = m.records.filter(function (r) { return r.sku === 'USB-CABLE'; })[0];
  assert.strictEqual(usb.sales, 0);
  assert.strictEqual(usb.spend, 180);
  assert.ok(!m.records.some(function (r) { return String(r.sku).toLowerCase() === 'total'; }));
  assert.ok(m.records.every(function (r) { return r.sku && r.spend != null; }));
});

check('shopify product export', function () {
  var a = TM.analyze(grid('samples/shopify-products.csv'));
  assert.strictEqual(a.type, 'shopify_products');
  var m = TM.materialize(a, a.mapping);
  assert.strictEqual(m.records.length, 10);
  assert.strictEqual(m.records[0].sku, 'CAMP-MUG');
  assert.strictEqual(m.records[0].price, 28);
  assert.strictEqual(m.records[0].cogs, 8);
});

check('shopify orders roll up', function () {
  var a = TM.analyze(grid('samples/shopify-orders.csv'));
  assert.strictEqual(a.type, 'shopify_orders');
  var m = TM.materialize(a, a.mapping);
  var mug = m.records.filter(function (r) { return r.sku === 'CAMP-MUG'; })[0];
  assert.strictEqual(mug.units, 80);
  assert.ok(Math.abs(mug.avgPrice - 28) < 0.001);
  assert.ok(!m.records.some(function (r) { return r.sku === 'USB-CABLE'; }));
});

check('cost sheet keeps zero other cost', function () {
  var a = TM.analyze(grid('samples/cost-sheet.csv'));
  assert.strictEqual(a.type, 'cost_sheet');
  var m = TM.materialize(a, a.mapping);
  var lamp = m.records.filter(function (r) { return r.sku === 'DESK-LAMP'; })[0];
  assert.strictEqual(lamp.other, 0);
  assert.strictEqual(lamp.shipping, 2);
  assert.strictEqual(lamp.cogs, 14);
});

check('amazon fee preview', function () {
  var a = TM.analyze(grid('samples/amazon-fee-preview.csv'));
  assert.strictEqual(a.type, 'amazon_fee_preview');
  var m = TM.materialize(a, a.mapping);
  var kase = m.records.filter(function (r) { return r.sku === 'CLEAR-CASE'; })[0];
  assert.strictEqual(kase.fees, 8.4);
  assert.strictEqual(kase.asin, 'B0CASE0005');
});

check('amazon settlement aggregates and ignores tax', function () {
  var a = TM.analyze(grid('samples/amazon-settlement.csv'));
  assert.strictEqual(a.type, 'amazon_settlement');
  var m = TM.materialize(a, a.mapping);
  assert.ok(m.period && m.period.days === 31, JSON.stringify(m.period));
  var mug = m.records.filter(function (r) { return r.sku === 'CAMP-MUG'; })[0];
  assert.strictEqual(mug.units, 3);
  assert.ok(Math.abs(mug.avgPrice - 28) < 0.001, 'avg ' + mug.avgPrice);
  assert.ok(Math.abs(mug.fees - (4.2 + 1.6 + 8.4 + 3.2) / 3) < 0.001, 'fees ' + mug.fees);
});

check('title-only file is an error, not a success', function () {
  var wb = XLSX.read('Just a note\nNothing useful here\n', { type: 'string' });
  var a = TM.analyze(TM.gridFromWorkbook(wb));
  assert.strictEqual(a.ok, false);
  assert.ok(/header/i.test(a.error));
});

check('header with no data rows is an error', function () {
  var wb = XLSX.read('Item ID,Title,Cost,Clicks,Conversions\n', { type: 'string' });
  var a = TM.analyze(TM.gridFromWorkbook(wb));
  assert.strictEqual(a.ok, false);
  assert.ok(/no product rows/i.test(a.error));
});

check('leak actions on the sample catalog', function () {
  var products = {};
  function take(file) {
    var a = TM.analyze(grid(file));
    var m = TM.materialize(a, a.mapping);
    assert.strictEqual(m.error, null, file + ' ' + m.error);
    m.records.forEach(function (rec) {
      var key = rec.sku;
      products[key] = products[key] || { upc: rec.sku };
      Object.keys(rec).forEach(function (k) {
        if (k === 'sku') products[key].upc = rec.sku;
        else products[key][k] = rec[k];
      });
      if ((products[key].price == null || products[key].price === '') && rec.avgPrice != null) {
        products[key].price = rec.avgPrice;
      }
    });
  }
  ['samples/shopify-products.csv', 'samples/shopify-orders.csv', 'samples/cost-sheet.csv', 'samples/google-ads-product-report.csv', 'samples/amazon-fee-preview.csv'].forEach(take);
  var factor = 365 / 31;
  function leak(sku) {
    return TM.leakFor(products[sku], factor);
  }
  assert.strictEqual(leak('DESK-LAMP').action, 'cut_ads');
  assert.strictEqual(leak('USB-CABLE').action, 'cut_ads');
  assert.strictEqual(leak('CEDAR-CANDLE').action, 'raise_price');
  assert.strictEqual(leak('MARBLE-TABLE').action, 'stop_selling');
  assert.strictEqual(leak('CLEAR-CASE').action, 'review_fees');
  assert.strictEqual(leak('CAMP-MUG').action, 'healthy');
  assert.strictEqual(leak('STEEL-BOTTLE').action, 'healthy');
  var annual = Object.keys(products).reduce(function (sum, sku) {
    return sum + leak(sku).annualLeak;
  }, 0);
  assert.ok(annual > 1000, 'annual leak ' + annual);
  var usb = TM.computeProduct(products['USB-CABLE'], 20);
  assert.strictEqual(usb.recKey, 'downZero');
  assert.ok(usb.netProfit < 0);
});

check('mapping can be corrected', function () {
  var a = TM.analyze(grid('samples/google-ads-product-report.csv'));
  var bad = Object.assign({}, a.mapping);
  delete bad.sku;
  var m = TM.materialize(a, bad);
  assert.ok(m.error);
  assert.strictEqual(m.records.length, 0);
});

check('old storage keys copy to skuclinic when missing', function () {
  var old = 'true' + 'margin';
  var entries = {};
  entries[old + ':plan'] = 'pro';
  entries[old + ':workspace'] = '{"stores":[]}';
  entries[old + ':hideWelcome'] = '1';
  entries['skuclinic:plan'] = 'agency';
  var next = TM.migrateStorageKeys(entries);
  assert.strictEqual(next['skuclinic:plan'], 'agency');
  assert.strictEqual(next['skuclinic:workspace'], '{"stores":[]}');
  assert.strictEqual(next['skuclinic:hideWelcome'], '1');
  assert.strictEqual(next[old + ':plan'], 'pro');
});

check('html escape covers quotes and tags', function () {
  var s = TM.esc('<img src=x onerror="alert(1)">');
  assert.ok(s.indexOf('<') === -1);
  assert.ok(s.indexOf('"') === -1);
  assert.ok(s.indexOf('onerror') !== -1);
});

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all logic checks passed');
