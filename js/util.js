/* SkuClinic shared parsers. No network. No DOM. */
(function (root) {
  var TM = root.TM || (root.TM = {});

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function hasValue(v) {
    return v != null && String(v).trim() !== '';
  }

  function parseNumber(v) {
    if (v == null) return undefined;
    if (typeof v === 'number') return isFinite(v) ? v : undefined;
    var s = String(v).trim();
    if (!s || s === '--' || s === '—' || s === '-' || s.toLowerCase() === 'n/a') return undefined;
    var neg = false;
    if (/^\(.*\)$/.test(s)) {
      neg = true;
      s = s.slice(1, -1);
    }
    s = s.replace(/^(?:usd|eur|gbp|cad|aud|nzd|chf|jpy|sek|nok|dkk|mxn|brl|inr)\s*/i, '')
      .replace(/\s*(?:usd|eur|gbp|cad|aud|nzd|chf|jpy|sek|nok|dkk|mxn|brl|inr)$/i, '')
      .replace(/^(?:us|ca|a|nz|r|mx|hk|s)\$/i, '$');
    s = s.replace(/[$€£¥\s\u00a0]/g, '').replace(/%/g, '');
    if (!s) return undefined;
    var lastComma = s.lastIndexOf(',');
    var lastDot = s.lastIndexOf('.');
    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma !== -1) {
      var parts = s.split(',');
      if (parts.length === 2 && parts[1].length <= 2) s = parts[0].replace(/\./g, '') + '.' + parts[1];
      else s = s.replace(/,/g, '');
    }
    var n = parseFloat(s);
    if (!isFinite(n)) return undefined;
    return neg ? -n : n;
  }

  /* Percent columns: 20 and 20% are 20. 1 and 1% are 1, not 100.
     A value strictly between 0 and 1 (such as 0.2) is a fraction, so 0.2 is 20.
     0 stays 0. */
  function parsePercent(v) {
    if (v == null) return undefined;
    if (typeof v === 'number') {
      if (!isFinite(v)) return undefined;
      if (v > 0 && v < 1) return v * 100;
      return v;
    }
    var raw = String(v).trim();
    if (!raw) return undefined;
    var hasPct = raw.indexOf('%') !== -1;
    var n = parseNumber(raw);
    if (n === undefined) return undefined;
    if (hasPct) return n;
    if (n > 0 && n < 1) return n * 100;
    return n;
  }

  function normHeader(h) {
    return String(h == null ? '' : h)
      .toLowerCase()
      .replace(/[$€£¥]/g, '')
      .replace(/[_/\\\-]+/g, ' ')
      .replace(/[()%.,:#*]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var HEADER_SUFFIX = { usd: 1, eur: 1, gbp: 1, cad: 1, aud: 1, 'per unit': 1, 'per order': 1 };

  function headerEq(norm, alias) {
    if (!norm || !alias) return false;
    if (norm === alias) return true;
    if (norm.indexOf(alias) === 0) {
      var rest = norm.slice(alias.length).replace(/^\s+/, '');
      if (HEADER_SUFFIX[rest]) return true;
    }
    return false;
  }

  function fmtMoney(v) {
    if (!isFinite(v)) return '–';
    var sign = v < 0 && Math.abs(v) >= 0.005 ? '−' : '';
    var parts = Math.abs(v).toFixed(2).split('.');
    return sign + '$' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + parts[1];
  }

  function fmtPct(fraction) {
    if (!isFinite(fraction)) return '–';
    return (fraction * 100).toFixed(1) + '%';
  }

  function fmtX(v) {
    if (!isFinite(v)) return '–';
    return v.toFixed(2) + 'x';
  }

  function skuKey(s) {
    return String(s == null ? '' : s).trim().toLowerCase();
  }

  /* Cells that start with = + - @ (or a tab / carriage return) run as formulas in
     Excel and Sheets. Prefix them with an apostrophe unless they are plain numbers. */
  function escapeFormula(s) {
    if (!/^[=+\-@\t\r]/.test(s)) return s;
    if (/^[-+]?\d+(?:\.\d+)?$/.test(s)) return s;
    return "'" + s;
  }

  function csvCell(v) {
    var s = v == null ? '' : escapeFormula(String(v));
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(rows) {
    return rows.map(function (row) {
      return row.map(csvCell).join(',');
    }).join('\r\n');
  }

  /* Copy truemargin* localStorage keys to skuclinic* when the new key is absent. */
  function migrateStorageKeys(entries) {
    var copy = {};
    var oldPrefix = 'truemargin';
    Object.keys(entries || {}).forEach(function (key) { copy[key] = entries[key]; });
    Object.keys(entries || {}).forEach(function (oldKey) {
      if (oldKey.indexOf(oldPrefix) !== 0) return;
      var next = 'skuclinic' + oldKey.slice(oldPrefix.length);
      if (!Object.prototype.hasOwnProperty.call(copy, next)) copy[next] = entries[oldKey];
    });
    return copy;
  }

  /* Read a dropped file. CSV and text exports are decoded as UTF-8 (codepage 65001)
     so names like Café and values like €12,50 survive files that have no BOM. */
  function looksLegacyText(buf) {
    var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (b.length >= 2 && ((b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf) || (b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) return false;
    if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return false;
    if (typeof TextDecoder === 'undefined') return false;
    try { new TextDecoder('utf-8', { fatal: true }).decode(b); return false; } catch (e) { return true; }
  }

  function readWorkbook(X, buf) {
    if (!X) throw new Error('Spreadsheet library is not loaded.');
    // Text files are read as UTF-8 unless they are not valid UTF-8 (Excel on Windows saves "CSV" as
    // Windows-1252), in which case they are read as Windows-1252 so accented names do not swallow the
    // next column. Workbooks (zip / OLE) and files with a byte-order mark are left to the library.
    return X.read(buf, { type: 'array', codepage: looksLegacyText(buf) ? 1252 : 65001 });
  }

  TM.esc = esc;
  TM.escapeFormula = escapeFormula;
  TM.readWorkbook = readWorkbook;
  TM.hasValue = hasValue;
  TM.parseNumber = parseNumber;
  TM.parsePercent = parsePercent;
  TM.normHeader = normHeader;
  TM.headerEq = headerEq;
  TM.fmtMoney = fmtMoney;
  TM.fmtPct = fmtPct;
  TM.fmtX = fmtX;
  TM.skuKey = skuKey;
  TM.toCsv = toCsv;
  TM.migrateStorageKeys = migrateStorageKeys;
})(typeof window !== 'undefined' ? window : globalThis);
