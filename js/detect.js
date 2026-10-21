/* File-type detection, header row finding, and column mapping. Pure. */
(function (root) {
  var TM = root.TM || (root.TM = {});

  /* Alias tables live in js/aliases.js (load it first). */
  var FILE_TYPES = TM.FILE_TYPES;
  var OPTIONAL = TM.FIELD_ALIASES;
  var AVOID = TM.ALIAS_AVOID || {};
  var FIELD_LABELS = TM.FIELD_LABELS;
  var TEXT_FIELDS = { sku: 1, asin: 1, name: 1, amountType: 1, amountDesc: 1, periodStart: 1, periodEnd: 1,
    txnType: 1, orderId: 1, finStatus: 1, cancelledAt: 1, handle: 1, opt1: 1, opt2: 1, opt3: 1, variantTitle: 1 };
  var PERCENT_FIELDS = { buffer: 1, payfee: 1, reffee: 1, returns: 1 };
  var GENERIC_FIELDS = ['sku', 'asin', 'name', 'price', 'cogs', 'shipping', 'other', 'fees', 'payfee', 'reffee', 'returns',
    'spend', 'clicks', 'sales', 'units', 'stock', 'buffer', 'revenue'];

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
      if (t.id === 'shopify_products' && (hasAlias(norms, 'handle') || hasAlias(norms, 'url handle')) &&
          (hasAlias(norms, 'variant sku') || hasAlias(norms, 'sku'))) score += 3;
      if (t.id === 'skuclinic_template' && hasAlias(norms, 'sku') && hasAlias(norms, 'unit cost') && hasAlias(norms, 'price') &&
          (hasAlias(norms, 'ad spend') || hasAlias(norms, 'units sold') || hasAlias(norms, 'fees per unit') ||
           hasAlias(norms, 'desired profit buffer') || hasAlias(norms, 'stock units'))) {
        score += 30;
      }
      scores[t.id] = score;
    });
    return scores;
  }

  /* Fuzzy fallback for a header the exact pass missed. */
  function editDistanceAtMost1(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la > lb) i++;
      else if (lb > la) j++;
      else { i++; j++; }
    }
    return edits + (la - i) + (lb - j) <= 1;
  }
  function fuzzyMatch(norm, alias, field) {
    if (!norm || !alias) return false;
    var avoid = AVOID[field] || [];
    var words = norm.split(' ');
    for (var k = 0; k < avoid.length; k++) {
      if (avoid[k].indexOf(' ') >= 0 ? norm.indexOf(avoid[k]) >= 0 : words.indexOf(avoid[k]) >= 0) {
        if (alias.indexOf(avoid[k]) < 0) return false;
      }
    }
    var cn = norm.replace(/\s+/g, '');
    var ca = alias.replace(/\s+/g, '');
    if (cn === ca) return true;
    if (ca.length >= 6 && editDistanceAtMost1(cn, ca)) return true;
    var need = alias.split(' ');
    if (alias.length < 4 && need.length === 1) return false;
    for (var w = 0; w < need.length; w++) if (words.indexOf(need[w]) < 0) return false;
    return words.length <= need.length + 3;
  }
  function fuzzyCol(norms, aliases, used, field) {
    for (var a = 0; a < aliases.length; a++) {
      for (var i = 0; i < norms.length; i++) {
        if (used[i] || !norms[i]) continue;
        if (fuzzyMatch(norms[i], aliases[a], field)) return i;
      }
    }
    return -1;
  }

  /* Map fields to columns. Returns { mapping, fuzzy, missing, saved }.
     saved (optional) is { field: normalized header } from a mapping the user
     kept for this file type. It wins when that header is in the file. */
  function mapColumns(typeId, norms, saved) {
    var type = typeById(typeId);
    var used = {};
    var mapping = {};
    var fuzzy = {};
    var savedUsed = {};
    var savedMissing = [];
    if (saved) {
      Object.keys(saved).forEach(function (field) {
        var want = saved[field];
        if (want == null || want === '') return;
        var idx = norms.indexOf(want);
        if (idx >= 0 && !used[idx]) { mapping[field] = idx; used[idx] = field; savedUsed[field] = true; }
        else savedMissing.push(field);
      });
    }
    var lists = [];
    if (type) type.fields.forEach(function (f) { lists.push(f); });
    if (!type || !type.ownFieldsOnly) OPTIONAL.forEach(function (f) { lists.push(f); });
    lists.forEach(function (f) {
      if (mapping[f[0]] != null) return;
      var idx = findCol(norms, f[1], used);
      if (idx >= 0) { mapping[f[0]] = idx; used[idx] = f[0]; }
    });
    lists.forEach(function (f) {
      if (mapping[f[0]] != null) return;
      var idx = fuzzyCol(norms, f[1], used, f[0]);
      if (idx >= 0) { mapping[f[0]] = idx; used[idx] = f[0]; fuzzy[f[0]] = true; }
    });
    var required = (type && type.required) || ['sku'];
    var missing = required.filter(function (f) { return mapping[f] == null; });
    return { mapping: mapping, fuzzy: fuzzy, missing: missing, savedUsed: savedUsed, savedMissing: savedMissing };
  }

  function suggestMapping(typeId, norms, saved) {
    return mapColumns(typeId, norms, saved).mapping;
  }

  function requiredFor(typeId) {
    var type = typeById(typeId);
    return (type && type.required) || ['sku'];
  }

  /* Which columns a mapping reads and which it leaves out, by header name. */
  function columnReport(analysis, mapping) {
    var byIdx = {};
    Object.keys(mapping || {}).forEach(function (f) { if (mapping[f] != null) byIdx[mapping[f]] = f; });
    var used = [];
    var ignored = [];
    analysis.headers.forEach(function (h, i) {
      if (!String(h || '').trim()) return;
      if (byIdx[i] != null) used.push({ header: h, field: byIdx[i], label: FIELD_LABELS[byIdx[i]] || byIdx[i] });
      else ignored.push(h);
    });
    return { used: used, ignored: ignored };
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
    if (known < 2 && nonempty >= 3) {
      /* Renamed columns: allow fuzzy hits on short text cells. */
      var fz = 0;
      for (var j = 0; j < cells.length; j++) {
        var c2 = cells[j];
        if (c2 == null || typeof c2 === 'number') continue;
        var nm = TM.normHeader(c2);
        if (!nm || nm.length > 40 || /\d{3,}/.test(nm)) continue;
        if (KNOWN.some(function (a) { return a.length >= 4 && fuzzyMatch(nm, a, ''); })) fz++;
      }
      if (fz >= 3) known = fz;
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
      /* No known column names at all. If the first filled row looks like a
         header (2+ text cells, nothing numeric) with rows under it, offer it
         for manual mapping instead of refusing the file. */
      for (var f = 0; f < limit; f++) {
        var cand = (rows[f] || []).filter(function (c) { return c != null && String(c).trim() !== ''; });
        if (!cand.length) continue;
        var allText = cand.every(function (c) { return typeof c !== 'number' && !/^[-+$€£]?\d[\d.,]*%?$/.test(String(c).trim()); });
        if (cand.length >= 2 && allText && rows.length > f + 1) best = f;
        break;
      }
    }
    if (best < 0) {
      return {
        ok: false,
        error: 'No header row found in the first 40 rows. SkuClinic looks for names like Variant SKU, Item ID, Unit cost, or estimated fee total. A title above the header is fine — this file does not seem to have a header at all.'
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
    var typeId = scores[ranked[0]] >= 5 ? ranked[0] : 'unknown';
    var preamble = [];
    for (var p = 0; p < best; p++) {
      var line = (rows[p] || []).filter(function (cell) { return String(cell || '').trim() !== ''; }).join(' ');
      if (line) preamble.push(line);
    }
    var period = periodFromText(preamble.join(' | '));
    var cols = mapColumns(typeId === 'unknown' ? 'cost_sheet' : typeId, norms);
    var mapping = cols.mapping;
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
      fuzzy: cols.fuzzy,
      missing: typeId === 'unknown' ? ['sku'].filter(function (f) { return mapping[f] == null; }) : cols.missing,
      rowCount: data.length,
      recognized: bestScore
    };
  }

  /* Columns the mapping screen offers for a file type, as [field, label]. */
  function fieldsForType(typeId) {
    var type = typeById(typeId);
    var keys = [];
    if (type) type.fields.forEach(function (f) { keys.push(f[0]); });
    if (!type || !type.ownFieldsOnly) GENERIC_FIELDS.forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    return keys.map(function (k) { return [k, FIELD_LABELS[k] || k]; });
  }

  function junkId(s) {
    var t = String(s == null ? '' : s).trim().toLowerCase();
    return t === '--' || t === '—' || t === '-' || t === '#';
  }

  /* Total, Totals, and Google Ads rows such as "Total: Account" or
     "Total: Shopping campaigns". A product named "Total gym" is kept. */
  var TOTAL_RE = /^totals?\s*(?::.*)?$/i;
  function isTotal(rec, raw) {
    if (TOTAL_RE.test(String(rec.sku || '').trim())) return true;
    if (String(rec.name || '').trim().toLowerCase() === 'total') return true;
    var first = String((raw && raw[0]) || '').trim();
    if (TOTAL_RE.test(first) || first === '--' || first === '—') return true;
    return false;
  }

  function assignText(rec, key, raw) {
    if (raw == null || String(raw).trim() === '') return;
    rec[key] = String(raw).trim();
  }

  function assignNum(rec, key, raw) {
    if (raw == null || String(raw).trim() === '') return;
    var n = PERCENT_FIELDS[key] ? TM.parsePercent(raw) : TM.parseNumber(raw);
    if (n === undefined) return;
    rec[key] = n;
  }

  function readMapped(row, mapping) {
    var rec = {};
    Object.keys(mapping).forEach(function (field) {
      var idx = mapping[field];
      if (idx == null || idx < 0) return;
      var raw = row[idx];
      if (TEXT_FIELDS[field]) assignText(rec, field, raw);
      else assignNum(rec, field, raw);
    });
    return rec;
  }

  var SUM_FIELDS = ['spend', 'clicks', 'sales', 'convValue'];
  var AMAZON_RENAME = { price: 'amzPrice', fees: 'amzFees', units: 'amzUnits', avgPrice: 'amzAvgPrice' };

  function toAmazonChannel(result) {
    result.records = result.records.map(function (rec) {
      var out = {};
      Object.keys(rec).forEach(function (k) { out[AMAZON_RENAME[k] || k] = rec[k]; });
      return out;
    });
    result.notes = (result.notes || []).concat(['Amazon numbers are kept as their own channel. They do not replace your store price, fees, or units.']);
    return result;
  }

  function variantName(title, rec) {
    var opts = [rec.opt1, rec.opt2, rec.opt3].filter(function (o) {
      return o && String(o).toLowerCase() !== 'default title';
    });
    if (!title) return opts.length ? opts.join(' / ') : undefined;
    return opts.length ? title + ' - ' + opts.join(' / ') : title;
  }

  function materialize(analysis, mapping) {
    if (!analysis || !analysis.ok) return { records: [], error: analysis && analysis.error };
    mapping = mapping || analysis.mapping || {};
    if (mapping.sku == null) {
      return { records: [], skippedBlank: 0, skippedTotal: 0, skippedNoSku: 0, error: 'Choose the SKU column before importing. Nothing was imported.' };
    }
    var type = typeById(analysis.type);
    var aggregate = type ? type.aggregate : null;
    var result;
    if (aggregate === 'settlement') result = materializeSettlement(analysis, mapping);
    else if (aggregate === 'orders' || aggregate === 'sales') result = materializeRollup(analysis, mapping, aggregate);
    else result = materializeRows(analysis, mapping, type);
    if (type && type.channel === 'amazon' && !result.error) result = toAmazonChannel(result);
    return result;
  }

  function materializeRows(analysis, mapping, type) {
    var skippedBlank = 0;
    var skippedTotal = 0;
    var skippedNoSku = 0;
    var merged = 0;
    var dupKeys = {};
    var byKey = {};
    var order = [];
    var sumDup = !!(type && type.sumDuplicates);
    var isShopify = type && type.id === 'shopify_products';
    var isMerchant = type && type.id === 'google_merchant';
    var titleByHandle = {};

    analysis.data.forEach(function (row) {
      var rec = readMapped(row, mapping);
      if (isTotal(rec, row)) { skippedTotal++; return; }
      if (isShopify) {
        if (rec.handle && rec.name) titleByHandle[rec.handle] = rec.name;
        var parent = rec.name || (rec.handle ? titleByHandle[rec.handle] : undefined);
        var full = variantName(parent, rec);
        if (full) rec.name = full;
      }
      ['handle', 'opt1', 'opt2', 'opt3'].forEach(function (k) { delete rec[k]; });
      if (isMerchant && rec.salePrice != null) { rec.listPrice = rec.price; rec.price = rec.salePrice; }
      delete rec.salePrice;
      if (!TM.hasValue(rec.sku) || junkId(rec.sku)) {
        var hasData = Object.keys(rec).some(function (k) { return k !== 'name' && rec[k] != null; });
        if (TM.hasValue(rec.name) || hasData) skippedNoSku++;
        else skippedBlank++;
        return;
      }
      var key = TM.skuKey(rec.sku);
      var prev = byKey[key];
      if (!prev) {
        byKey[key] = rec;
        order.push(key);
        return;
      }
      dupKeys[key] = (dupKeys[key] || 1) + 1;
      merged++;
      Object.keys(rec).forEach(function (k) {
        if (k === 'sku') return;
        if (sumDup && SUM_FIELDS.indexOf(k) !== -1) prev[k] = (prev[k] || 0) + rec[k];
        else if (k !== 'name' || !prev.name) prev[k] = rec[k];
      });
    });

    var records = order.map(function (k) { return byKey[k]; });
    var notes = [];
    var warnings = [];
    if (analysis.period) notes.push('Date range in the file: ' + analysis.period.label + '.');
    var dupList = Object.keys(dupKeys);
    if (dupList.length) {
      var sample = dupList.slice(0, 3).map(function (k) { return byKey[k].sku + ' ×' + dupKeys[k]; }).join(', ');
      if (sumDup) notes.push(dupList.length + ' SKU' + (dupList.length === 1 ? ' appears' : 's appear') + ' in more than one row (' + sample + '). Spend, clicks, and conversions were added together.');
      else warnings.push(dupList.length + ' SKU' + (dupList.length === 1 ? ' appears' : 's appear') + ' more than once (' + sample + '). The later row’s values were used. Check the file if that was not intended.');
    }
    if (isMerchant && records.some(function (r) { return r.listPrice != null; })) notes.push('Where a sale price is set, it is used as the price.');
    records.forEach(function (r) { delete r.listPrice; });
    return {
      records: records,
      skippedBlank: skippedBlank,
      skippedTotal: skippedTotal,
      skippedNoSku: skippedNoSku,
      mergedRows: merged,
      duplicates: dupList.length,
      aggregated: false,
      period: analysis.period || null,
      notes: notes,
      warnings: warnings,
      error: records.length ? null : 'Header recognized, but no row under it has a SKU. Nothing was imported.'
    };
  }

  var DEAD_STATUS = { refunded: 1, voided: 1 };

  function materializeRollup(analysis, mapping, kind) {
    var skippedBlank = 0;
    var skippedTotal = 0;
    var skippedNoSku = 0;
    var lines = [];
    var orders = {};
    analysis.data.forEach(function (row) {
      var rec = readMapped(row, mapping);
      if (isTotal(rec, row)) { skippedTotal++; return; }
      var ord = null;
      if (rec.orderId) {
        ord = orders[rec.orderId] || (orders[rec.orderId] = { status: '', cancelled: false, refunded: 0, lines: [] });
        if (rec.finStatus) ord.status = String(rec.finStatus).trim().toLowerCase();
        if (rec.cancelledAt) ord.cancelled = true;
        if (rec.refunded != null && rec.refunded > 0) ord.refunded = Math.max(ord.refunded, rec.refunded);
      }
      if (!TM.hasValue(rec.sku) || junkId(rec.sku)) {
        if (TM.hasValue(rec.name) || rec.units != null) skippedNoSku++;
        else skippedBlank++;
        return;
      }
      var line = { rec: rec, ord: ord, units: rec.units != null ? rec.units : null, revenue: null };
      if (kind === 'orders') {
        if (rec.units != null && rec.price != null) line.revenue = rec.units * rec.price - (rec.discount || 0);
      } else if (rec.revenue != null) {
        line.revenue = rec.revenue;
      }
      lines.push(line);
      if (ord) ord.lines.push(line);
    });

    var droppedOrders = 0;
    var refundAdjusted = 0;
    Object.keys(orders).forEach(function (id) {
      var ord = orders[id];
      if (ord.cancelled || DEAD_STATUS[ord.status]) {
        droppedOrders++;
        ord.lines.forEach(function (l) { l.dead = true; });
        return;
      }
      if (ord.refunded > 0) {
        var total = ord.lines.reduce(function (s, l) { return s + (l.revenue || 0); }, 0);
        if (total > 0) {
          refundAdjusted++;
          ord.lines.forEach(function (l) {
            if (!l.revenue || !l.units) return;
            var share = Math.min(l.revenue, ord.refunded * (l.revenue / total));
            var unitPrice = l.revenue / l.units;
            l.units = Math.max(0, l.units - share / unitPrice);
            l.revenue -= share;
          });
        }
      }
    });

    var groups = {};
    var order = [];
    lines.forEach(function (l) {
      if (l.dead) return;
      var rec = l.rec;
      var key = TM.skuKey(rec.sku);
      if (!groups[key]) {
        groups[key] = { sku: rec.sku, name: undefined, units: 0, revenue: 0, revUnits: 0, hasUnits: false, hasRevenue: false };
        order.push(key);
      }
      var g = groups[key];
      if (!g.name && rec.name) {
        g.name = kind === 'sales' && rec.variantTitle && rec.variantTitle.toLowerCase() !== 'default title'
          ? rec.name + ' - ' + rec.variantTitle : rec.name;
      }
      if (l.units != null) { g.units += l.units; g.hasUnits = true; }
      if (l.revenue != null) { g.revenue += l.revenue; g.hasRevenue = true; if (l.units != null) g.revUnits += l.units; }
    });
    var records = order.map(function (key) {
      var g = groups[key];
      var rec = { sku: g.sku };
      if (g.name) rec.name = g.name;
      if (g.hasUnits) rec.units = Math.round(g.units * 100) / 100;
      if (g.hasRevenue && g.revUnits > 0) rec.avgPrice = g.revenue / g.revUnits;
      return rec;
    });
    var notes = [kind === 'orders'
      ? 'Orders are totaled by SKU. Units sold add up; price becomes the average selling price after line discounts and does not replace a list price you already imported.'
      : 'Sales rows are totaled by SKU.'];
    if (droppedOrders) notes.push('Left out ' + droppedOrders + ' refunded, voided, or cancelled order' + (droppedOrders === 1 ? '' : 's') + '.');
    if (refundAdjusted) notes.push(refundAdjusted + ' partly refunded order' + (refundAdjusted === 1 ? ' was' : 's were') + ' reduced by the refunded amount.');
    return {
      records: records,
      skippedBlank: skippedBlank,
      skippedTotal: skippedTotal,
      skippedNoSku: skippedNoSku,
      droppedOrders: droppedOrders,
      aggregated: true,
      period: analysis.period || null,
      notes: notes,
      warnings: [],
      error: records.length ? null : 'No SKUs found under that header. Nothing was imported.'
    };
  }

  function materializeSettlement(analysis, mapping) {
    if (mapping.sku == null || mapping.amount == null) {
      return {
        records: [],
        skippedBlank: 0,
        skippedTotal: 0,
        skippedNoSku: 0,
        error: 'A settlement file needs a SKU column and an amount column. Nothing was imported.'
      };
    }
    var groups = {};
    var order = [];
    var skippedNoSku = 0;
    var start = null;
    var end = null;
    analysis.data.forEach(function (row) {
      var rec = readMapped(row, mapping);
      /* In V2 flat files the dates sit only on the summary row, which has no SKU. */
      if (!start && rec.periodStart) start = parseDateToken(rec.periodStart);
      if (!end && rec.periodEnd) end = parseDateToken(rec.periodEnd);
      if (!TM.hasValue(rec.sku) || junkId(rec.sku)) { skippedNoSku++; return; }
      var key = TM.skuKey(rec.sku);
      if (!groups[key]) {
        groups[key] = { sku: rec.sku, asin: rec.asin, orderRev: 0, orderUnits: 0, refundRev: 0, refundUnits: 0, refundNoQty: 0, promo: 0, fees: 0 };
        order.push(key);
      }
      var g = groups[key];
      if (!g.asin && rec.asin) g.asin = rec.asin;
      var type = TM.normHeader(rec.amountType || '');
      var desc = TM.normHeader(rec.amountDesc || '');
      var txn = TM.normHeader(rec.txnType || '');
      var amount = rec.amount || 0;
      var isRefund = txn.indexOf('refund') !== -1;
      if (type.indexOf('tax') !== -1 || desc.indexOf('tax') !== -1) return;
      if (type.indexOf('fee') !== -1) {
        /* Fees are negative; a refunded fee is positive and lowers the total. */
        g.fees += -amount;
      } else if (desc.indexOf('principal') !== -1) {
        if (isRefund || amount < 0) {
          g.refundRev += amount;
          if (rec.units != null) g.refundUnits += Math.abs(rec.units);
          else g.refundNoQty += amount;
        } else {
          g.orderRev += amount;
          if (rec.units != null) g.orderUnits += rec.units;
        }
      } else if (type.indexOf('promotion') !== -1) {
        g.promo += amount;
      }
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
    var refunds = 0;
    var records = [];
    order.forEach(function (key) {
      var g = groups[key];
      if (!g.orderUnits && !g.orderRev && !g.fees && !g.refundRev) return;
      var unitPrice = g.orderUnits > 0 ? g.orderRev / g.orderUnits : NaN;
      var refundedUnits = g.refundUnits + (isFinite(unitPrice) && unitPrice > 0 ? Math.abs(g.refundNoQty) / unitPrice : 0);
      if (g.refundRev) refunds++;
      var netUnits = Math.max(0, g.orderUnits - refundedUnits);
      netUnits = Math.round(netUnits * 100) / 100;
      var rec = { sku: g.sku };
      if (g.asin) rec.asin = g.asin;
      rec.units = netUnits;
      if (g.orderUnits > 0) rec.avgPrice = (g.orderRev + g.promo) / g.orderUnits;
      if (netUnits > 0 && g.fees) rec.fees = g.fees / netUnits;
      records.push(rec);
    });
    var notes = ['Settlement lines are totaled by SKU. Principal becomes revenue, fee lines become fees per unit, tax lines are ignored.'];
    if (refunds) notes.push('Refunds on ' + refunds + ' SKU' + (refunds === 1 ? '' : 's') + ' were taken out of units sold; refunded fees lower the fee total.');
    return {
      records: records,
      skippedBlank: 0,
      skippedTotal: 0,
      skippedNoSku: skippedNoSku,
      aggregated: true,
      period: period || null,
      notes: notes,
      warnings: [],
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

  TM.fieldsForType = fieldsForType;
  TM.analyze = analyze;
  TM.suggestMapping = suggestMapping;
  TM.mapColumns = mapColumns;
  TM.requiredFor = requiredFor;
  TM.columnReport = columnReport;
  TM.fuzzyHeaderMatch = fuzzyMatch;
  TM.materialize = materialize;
  TM.gridFromWorkbook = gridFromWorkbook;
  TM.periodFromText = periodFromText;
  TM.isKnownHeader = isKnownHeader;
  TM.isTotalRow = isTotal;
})(typeof window !== 'undefined' ? window : globalThis);
