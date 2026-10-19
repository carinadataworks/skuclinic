/* File-type detection, header row finding, and column mapping. Pure. */
(function (root) {
  var TM = root.TM || (root.TM = {});

  var FILE_TYPES = [
    {
      id: 'google_ads',
      label: 'Google Ads shopping / product report',
      blurb: 'Spend, clicks, and conversions by item.',
      aggregate: null,
      strong: ['item id', 'product item id'],
      support: ['clicks', 'impressions', 'impr', 'conversions', 'conv value', 'conversion value', 'avg cpc', 'campaign', 'ad group', 'currency code', 'cost', 'ad spend'],
      fields: [
        ['sku', ['item id', 'product item id', 'merchant product id']],
        ['name', ['title', 'product title', 'item title']],
        ['spend', ['cost', 'ad spend', 'spend']],
        ['clicks', ['clicks']],
        ['sales', ['conversions', 'conv', 'all conv']],
        ['convValue', ['conv value', 'conversion value', 'all conv value']]
      ]
    },
    {
      id: 'shopify_products',
      label: 'Shopify product export',
      blurb: 'Variant SKU, price, and cost per item.',
      aggregate: null,
      strong: ['variant sku', 'variant price', 'cost per item'],
      support: ['handle', 'vendor', 'published', 'option1 name', 'variant inventory qty', 'variant barcode'],
      fields: [
        ['sku', ['variant sku']],
        ['name', ['title']],
        ['price', ['variant price']],
        ['cogs', ['cost per item']],
        ['stock', ['variant inventory qty']]
      ]
    },
    {
      id: 'shopify_orders',
      label: 'Shopify orders export',
      blurb: 'Units sold, totaled by line-item SKU.',
      aggregate: 'orders',
      strong: ['lineitem sku', 'line item sku', 'lineitem quantity', 'line item quantity'],
      support: ['lineitem name', 'line item name', 'lineitem price', 'line item price', 'financial status', 'fulfillment status'],
      fields: [
        ['sku', ['lineitem sku', 'line item sku']],
        ['name', ['lineitem name', 'line item name']],
        ['units', ['lineitem quantity', 'line item quantity']],
        ['price', ['lineitem price', 'line item price']]
      ]
    },
    {
      id: 'shopify_sales',
      label: 'Shopify sales by product',
      blurb: 'Units and net sales by variant.',
      aggregate: 'sales',
      strong: ['product variant sku', 'net quantity'],
      support: ['net sales', 'gross sales', 'product title'],
      fields: [
        ['sku', ['product variant sku', 'variant sku']],
        ['name', ['product title', 'title']],
        ['units', ['net quantity', 'ordered item quantity']],
        ['revenue', ['net sales']]
      ]
    },
    {
      id: 'amazon_fee_preview',
      label: 'Amazon fee preview',
      blurb: 'Estimated Amazon fees per SKU. Optional.',
      aggregate: null,
      strong: ['estimated fee total', 'expected fulfillment fee per unit', 'fnsku', 'estimated referral fee per unit'],
      support: ['your price', 'sales price', 'asin', 'product name', 'fulfilled by', 'amazon store'],
      fields: [
        ['sku', ['sku', 'seller sku']],
        ['asin', ['asin']],
        ['name', ['product name', 'item name']],
        ['price', ['your price', 'sales price']],
        ['fees', ['estimated fee total']]
      ]
    },
    {
      id: 'amazon_settlement',
      label: 'Amazon settlement',
      blurb: 'Revenue and fees totaled by SKU. Optional.',
      aggregate: 'settlement',
      strong: ['amount type', 'settlement id', 'quantity purchased'],
      support: ['amount description', 'amount', 'posted date', 'transaction type', 'marketplace name', 'settlement start date', 'settlement end date'],
      fields: [
        ['sku', ['sku']],
        ['asin', ['asin']],
        ['amountType', ['amount type']],
        ['amountDesc', ['amount description']],
        ['amount', ['amount']],
        ['units', ['quantity purchased']],
        ['periodStart', ['settlement start date']],
        ['periodEnd', ['settlement end date']]
      ]
    },
    {
      id: 'cost_sheet',
      label: 'Cost sheet',
      blurb: 'Unit cost, shipping, and other costs by SKU.',
      aggregate: null,
      strong: ['unit cost', 'cogs', 'cost per unit', 'cogs per unit'],
      support: ['shipping', 'shipping cost', 'other cost', 'other costs', 'asin', 'sku'],
      fields: [
        ['sku', ['sku', 'upc sku', 'upc', 'item id']],
        ['name', ['product', 'product name', 'name', 'title']],
        ['cogs', ['unit cost', 'cogs', 'cost per unit', 'cogs per unit', 'cost']],
        ['shipping', ['shipping', 'shipping cost', 'shipping per unit']],
        ['other', ['other cost', 'other costs', 'other']],
        ['asin', ['asin']],
        ['price', ['price', 'sale price']]
      ]
    }
  ];

  var OPTIONAL = [
    ['sku', ['sku', 'variant sku', 'item id', 'product item id', 'upc sku', 'upc']],
    ['asin', ['asin']],
    ['name', ['product name', 'product title', 'title', 'name']],
    ['price', ['sale price', 'variant price', 'your price', 'price']],
    ['cogs', ['unit cost', 'cogs per unit', 'cost per unit', 'cost per item', 'cogs']],
    ['shipping', ['shipping cost', 'shipping per unit', 'shipping']],
    ['other', ['other costs', 'other cost']],
    ['fees', ['estimated fee total', 'fees per unit', 'fee per unit', 'total fees', 'fees']],
    ['spend', ['ad spend', 'spend']],
    ['clicks', ['clicks']],
    ['sales', ['conversions', 'all conv', 'sales']],
    ['units', ['units sold', 'units', 'net quantity', 'quantity']],
    ['stock', ['stock units', 'stock', 'variant inventory qty']],
    ['buffer', ['desired profit buffer', 'buffer']],
    ['revenue', ['net sales', 'revenue']]
  ];

  var KNOWN = [];
  FILE_TYPES.forEach(function (t) {
    t.strong.forEach(function (a) { KNOWN.push(a); });
    t.support.forEach(function (a) { KNOWN.push(a); });
    t.fields.forEach(function (f) { f[1].forEach(function (a) { KNOWN.push(a); }); });
  });
  OPTIONAL.forEach(function (f) { f[1].forEach(function (a) { KNOWN.push(a); }); });

  function isKnownHeader(norm) {
    if (!norm) return false;
    for (var i = 0; i < KNOWN.length; i++) {
      if (TM.headerEq(norm, KNOWN[i])) return true;
    }
    return false;
  }

  function findCol(norms, aliases, used) {
    for (var a = 0; a < aliases.length; a++) {
      for (var i = 0; i < norms.length; i++) {
        if (used && used[i]) continue;
        if (TM.headerEq(norms[i], aliases[a])) return i;
      }
    }
    return -1;
  }

  function hasAlias(norms, alias) {
    return findCol(norms, [alias], null) >= 0;
  }

  function typeById(id) {
    for (var i = 0; i < FILE_TYPES.length; i++) if (FILE_TYPES[i].id === id) return FILE_TYPES[i];
    return null;
  }

  function scoreTypes(norms) {
    var scores = {};
    FILE_TYPES.forEach(function (t) {
      var score = 0;
      var strongHits = 0;
      t.strong.forEach(function (a) {
        if (hasAlias(norms, a)) { score += 5; strongHits++; }
      });
      t.support.forEach(function (a) {
        if (hasAlias(norms, a)) score += 1;
      });
      if (strongHits === 0) score = Math.min(score, 3);
      if (t.id === 'google_ads' && hasAlias(norms, 'clicks') &&
          (hasAlias(norms, 'cost') || hasAlias(norms, 'ad spend') || hasAlias(norms, 'spend')) &&
          (hasAlias(norms, 'conversions') || hasAlias(norms, 'sales') || hasAlias(norms, 'conv'))) {
        score += 6;
      }
      if (t.id === 'shopify_products' && hasAlias(norms, 'handle') && hasAlias(norms, 'variant sku')) score += 3;
      scores[t.id] = score;
    });
    return scores;
  }

  function suggestMapping(typeId, norms) {
    var type = typeById(typeId);
    var used = {};
    var mapping = {};
    function claim(field, aliases) {
      if (mapping[field] != null) return;
      var idx = findCol(norms, aliases, used);
      if (idx >= 0) {
        mapping[field] = idx;
        used[idx] = field;
      }
    }
    if (type) type.fields.forEach(function (f) { claim(f[0], f[1]); });
    OPTIONAL.forEach(function (f) { claim(f[0], f[1]); });
    return mapping;
  }

  function headerScore(cells) {
    var known = 0;
    var numeric = 0;
    var nonempty = 0;
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (cell == null || String(cell).trim() === '') continue;
      nonempty++;
      if (typeof cell === 'number') numeric++;
      else if (isKnownHeader(TM.normHeader(cell))) known++;
    }
    if (nonempty < 2 || known < 2) return 0;
    if (numeric > known) return 0;
    return known;
  }

  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function parseDateToken(s) {
    if (!s) return null;
    var text = String(s).trim();
    var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    var named = /([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(text);
    if (named) {
      var mon = MONTHS[named[1].slice(0, 3).toLowerCase()];
      if (mon != null) return new Date(Date.UTC(+named[3], mon, +named[2]));
    }
    var us = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
    if (us) return new Date(Date.UTC(+us[3], +us[1] - 1, +us[2]));
    return null;
  }

  function periodFromText(text) {
    if (!text) return null;
    var re = /([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\s*(?:-|–|—|\bto\b)+\s*([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i;
    var m = re.exec(text);
    if (!m) return null;
    var a = parseDateToken(m[1]);
    var b = parseDateToken(m[2]);
    if (!a || !b) return null;
    if (b < a) { var swap = a; a = b; b = swap; }
    var days = Math.round((b - a) / 86400000) + 1;
    if (!(days > 0) || days > 4000) return null;
    var label = a.toISOString().slice(0, 10) + ' to ' + b.toISOString().slice(0, 10) + ' (' + days + ' days)';
    return { start: a.toISOString().slice(0, 10), end: b.toISOString().slice(0, 10), days: days, label: label };
  }

  function analyze(grid) {
    var rows = grid || [];
    var best = -1;
    var bestScore = 0;
    var limit = Math.min(rows.length, 40);
    for (var i = 0; i < limit; i++) {
      var cells = rows[i] || [];
      var score = headerScore(cells);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) {
      return {
        ok: false,
        error: 'No header row found in the first 40 rows. TrueMargin looks for names like Variant SKU, Item ID, Unit cost, or estimated fee total. A title above the header is fine — this file does not seem to have a header at all.'
      };
    }
    var headers = (rows[best] || []).map(function (c) { return String(c == null ? '' : c).trim(); });
    var norms = headers.map(TM.normHeader);
    var data = [];
    for (var r = best + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var any = false;
      for (var c = 0; c < row.length; c++) {
        if (row[c] != null && String(row[c]).trim() !== '') { any = true; break; }
      }
      if (any) data.push(row);
    }
    if (!data.length) {
      var shown = headers.filter(Boolean).slice(0, 6).join(', ');
      return {
        ok: false,
        error: 'Found a header row (' + shown + ') but no product rows under it.'
      };
    }
    var scores = scoreTypes(norms);
    var ranked = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a]; });
    var typeId = scores[ranked[0]] >= 5 ? ranked[0] : 'cost_sheet';
    if (scores[ranked[0]] < 5) typeId = 'unknown';
    var preamble = [];
    for (var p = 0; p < best; p++) {
      var line = (rows[p] || []).filter(function (cell) { return String(cell || '').trim() !== ''; }).join(' ');
      if (line) preamble.push(line);
    }
    var period = periodFromText(preamble.join(' | '));
    var mapping = typeId === 'unknown' ? suggestMapping('cost_sheet', norms) : suggestMapping(typeId, norms);
    var type = typeById(typeId);
    return {
      ok: true,
      headerIndex: best,
      headers: headers,
      headerNorms: norms,
      data: data,
      preamble: preamble.join(' · '),
      period: period,
      type: typeId,
      typeLabel: type ? type.label : 'Unrecognized file',
      typeBlurb: type ? type.blurb : 'Map the columns yourself. Nothing is imported until you confirm.',
      scores: scores,
      mapping: mapping,
      recognized: bestScore
    };
  }

  function junkId(s) {
    var t = String(s == null ? '' : s).trim().toLowerCase();
    return t === '--' || t === '—' || t === '-' || t === 'total' || t === 'totals' || t === '#';
  }

  function isTotal(rec, raw) {
    if (junkId(rec.sku) || String(rec.sku || '').trim().toLowerCase() === 'total') return true;
    if (String(rec.name || '').trim().toLowerCase() === 'total') return true;
    var first = String((raw && raw[0]) || '').trim().toLowerCase();
    if (first === 'total' || first === 'totals' || first === '--' || first === '—') return true;
    return false;
  }

  function assignText(rec, key, raw) {
    if (raw == null || String(raw).trim() === '') return;
    rec[key] = String(raw).trim();
  }

  function assignNum(rec, key, raw) {
    if (raw == null || String(raw).trim() === '') return;
    var n = key === 'buffer' ? TM.parsePercent(raw) : TM.parseNumber(raw);
    if (n === undefined) return;
    rec[key] = n;
  }

  function readMapped(row, mapping) {
    var rec = {};
    Object.keys(mapping).forEach(function (field) {
      var idx = mapping[field];
      if (idx == null || idx < 0) return;
      var raw = row[idx];
      if (field === 'sku' || field === 'asin' || field === 'name' || field === 'amountType' || field === 'amountDesc' || field === 'periodStart' || field === 'periodEnd') {
        assignText(rec, field, raw);
      } else {
        assignNum(rec, field, raw);
      }
    });
    return rec;
  }

  function materialize(analysis, mapping) {
    if (!analysis || !analysis.ok) return { records: [], error: analysis && analysis.error };
    mapping = mapping || analysis.mapping || {};
    if (mapping.sku == null) {
      return { records: [], skippedBlank: 0, skippedTotal: 0, error: 'Choose the SKU column before importing. Nothing was imported.' };
    }
    var type = typeById(analysis.type);
    var aggregate = type ? type.aggregate : null;
    if (analysis.type === 'unknown') aggregate = null;

    var skippedBlank = 0;
    var skippedTotal = 0;
    var records = [];

    if (aggregate === 'settlement') {
      return materializeSettlement(analysis, mapping);
    }
    if (aggregate === 'orders' || aggregate === 'sales') {
      return materializeRollup(analysis, mapping, aggregate);
    }

    analysis.data.forEach(function (row) {
      var rec = readMapped(row, mapping);
      if (isTotal(rec, row)) { skippedTotal++; return; }
      if (junkId(rec.sku)) { skippedBlank++; return; }
      if (!TM.hasValue(rec.sku) && !TM.hasValue(rec.name)) { skippedBlank++; return; }
      records.push(rec);
    });

    var notes = [];
    if (analysis.period) notes.push('Date range in the file: ' + analysis.period.label + '.');
    return {
      records: records,
      skippedBlank: skippedBlank,
      skippedTotal: skippedTotal,
      aggregated: false,
      period: analysis.period || null,
      notes: notes,
      error: records.length ? null : 'Header recognized, but every row under it was blank or a totals row. Nothing was imported.'
    };
  }

  function materializeRollup(analysis, mapping, kind) {
    var groups = {};
    var order = [];
    var skippedBlank = 0;
    var skippedTotal = 0;
    analysis.data.forEach(function (row) {
      var rec = readMapped(row, mapping);
      if (isTotal(rec, row)) { skippedTotal++; return; }
      if (!TM.hasValue(rec.sku) && !TM.hasValue(rec.name)) { skippedBlank++; return; }
      var key = TM.skuKey(rec.sku || rec.name);
      if (!groups[key]) {
        groups[key] = { sku: rec.sku, name: rec.name, asin: rec.asin, units: 0, revenue: 0, hasUnits: false, hasRevenue: false };
        order.push(key);
      }
      var g = groups[key];
      if (!g.name && rec.name) g.name = rec.name;
      if (!g.sku && rec.sku) g.sku = rec.sku;
      if (kind === 'orders') {
        var qty = rec.units != null ? rec.units : 0;
        var unitPrice = rec.price != null ? rec.price : 0;
        if (rec.units != null) { g.units += rec.units; g.hasUnits = true; }
        if (rec.price != null && rec.units != null) { g.revenue += unitPrice * qty; g.hasRevenue = true; }
      } else {
        if (rec.units != null) { g.units += rec.units; g.hasUnits = true; }
        if (rec.revenue != null) { g.revenue += rec.revenue; g.hasRevenue = true; }
      }
    });
    var records = order.map(function (key) {
      var g = groups[key];
      var rec = {};
      if (g.sku) rec.sku = g.sku;
      if (g.name) rec.name = g.name;
      if (g.hasUnits) rec.units = g.units;
      if (g.hasRevenue && g.units > 0) rec.avgPrice = g.revenue / g.units;
      return rec;
    });
    var notes = [kind === 'orders'
      ? 'Orders are totaled by SKU. Units sold add up; price becomes the average selling price and does not replace a list price you already imported.'
      : 'Sales rows are totaled by SKU.'];
    return {
      records: records,
      skippedBlank: skippedBlank,
      skippedTotal: skippedTotal,
      aggregated: true,
      period: analysis.period || null,
      notes: notes,
      error: records.length ? null : 'No SKUs found under that header. Nothing was imported.'
    };
  }

  function materializeSettlement(analysis, mapping) {
    if (mapping.sku == null || mapping.amount == null) {
      return {
        records: [],
        skippedBlank: 0,
        skippedTotal: 0,
        error: 'A settlement file needs a SKU column and an amount column. Nothing was imported.'
      };
    }
    var groups = {};
    var order = [];
    var skippedBlank = 0;
    var start = null;
    var end = null;
    analysis.data.forEach(function (row) {
      var rec = readMapped(row, mapping);
      if (!TM.hasValue(rec.sku) || junkId(rec.sku)) { skippedBlank++; return; }
      var key = TM.skuKey(rec.sku);
      if (!groups[key]) {
        groups[key] = { sku: rec.sku, asin: rec.asin, revenue: 0, fees: 0, units: 0 };
        order.push(key);
      }
      var g = groups[key];
      if (!g.asin && rec.asin) g.asin = rec.asin;
      var type = TM.normHeader(rec.amountType || '');
      var desc = TM.normHeader(rec.amountDesc || '');
      var amount = rec.amount || 0;
      if (type.indexOf('tax') !== -1 || desc.indexOf('tax') !== -1) return;
      if (type.indexOf('fee') !== -1) g.fees += Math.abs(amount);
      else if (desc.indexOf('principal') !== -1 || type.indexOf('promotion') !== -1) {
        g.revenue += amount;
        if (desc.indexOf('principal') !== -1 && rec.units != null) g.units += rec.units;
      }
      if (!start && rec.periodStart) start = parseDateToken(rec.periodStart);
      if (!end && rec.periodEnd) end = parseDateToken(rec.periodEnd);
    });
    var period = analysis.period;
    if (start && end) {
      if (end < start) { var sw = start; start = end; end = sw; }
      var days = Math.round((end - start) / 86400000) + 1;
      if (days > 0) {
        period = {
          start: start.toISOString().slice(0, 10),
          end: end.toISOString().slice(0, 10),
          days: days,
          label: start.toISOString().slice(0, 10) + ' to ' + end.toISOString().slice(0, 10) + ' (' + days + ' days)'
        };
      }
    }
    var records = [];
    order.forEach(function (key) {
      var g = groups[key];
      if (!g.units && !g.revenue && !g.fees) return;
      var rec = { sku: g.sku };
      if (g.asin) rec.asin = g.asin;
      if (g.units) rec.units = g.units;
      if (g.units > 0) rec.avgPrice = g.revenue / g.units;
      if (g.units > 0 && g.fees) rec.fees = g.fees / g.units;
      records.push(rec);
    });
    return {
      records: records,
      skippedBlank: skippedBlank,
      skippedTotal: 0,
      aggregated: true,
      period: period || null,
      notes: ['Settlement lines are totaled by SKU. Principal becomes revenue, fee lines become fees per unit, tax lines are ignored.'],
      error: records.length ? null : 'No SKU amounts found in that settlement file. Nothing was imported.'
    };
  }

  function gridFromWorkbook(wb) {
    var names = (wb && wb.SheetNames) || [];
    if (!names.length) return [];
    var name = names.indexOf('Product Data') >= 0 ? 'Product Data' : names[0];
    var X = root.XLSX;
    if (!X) throw new Error('Spreadsheet library is not loaded.');
    return X.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
  }

  TM.FILE_TYPES = FILE_TYPES;
  TM.analyze = analyze;
  TM.suggestMapping = suggestMapping;
  TM.materialize = materialize;
  TM.gridFromWorkbook = gridFromWorkbook;
  TM.periodFromText = periodFromText;
  TM.isKnownHeader = isKnownHeader;
})(typeof window !== 'undefined' ? window : globalThis);
