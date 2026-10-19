/* TrueMargin app. All calculation stays in the browser. */
(function () {
  var FREE_CAP = 25;
  var plan = 'free';
  var stores = [];
  var active = 0;
  var products = [];
  var nextId = 1;
  var currentPage = 1;
  var pageSize = 50;
  var expandedId = null;
  var searchQuery = '';
  var sortField = null;
  var sortDir = 1;
  var impactMode = 'plan';
  var detectedPeriod = null;
  var compareSnap = null;
  var saveTimer = null;
  var queue = [];
  var mapOpen = false;
  var mapAnalysis = null;
  var mapFileName = '';
  var activeMapping = {};

  var MAP_FIELDS = [
    ['sku', 'SKU'], ['asin', 'ASIN'], ['name', 'Product name'], ['price', 'Price'],
    ['cogs', 'Unit cost'], ['shipping', 'Shipping'], ['other', 'Other cost'],
    ['fees', 'Fees per unit'], ['spend', 'Ad spend'], ['clicks', 'Clicks'],
    ['sales', 'Conversions'], ['units', 'Units sold'], ['stock', 'Stock'],
    ['buffer', 'Buffer %'], ['revenue', 'Revenue']
  ];
  var SETTLEMENT_FIELDS = [
    ['sku', 'SKU'], ['asin', 'ASIN'], ['amountType', 'Amount type'],
    ['amountDesc', 'Amount description'], ['amount', 'Amount'],
    ['units', 'Quantity'], ['periodStart', 'Period start'], ['periodEnd', 'Period end']
  ];
  var NUM_FIELDS = ['price', 'cogs', 'shipping', 'other', 'fees', 'spend', 'clicks', 'sales', 'units', 'stock', 'buffer', 'avgPrice', 'convValue'];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function findId(id) {
    for (var i = 0; i < products.length; i++) if (products[i].id === id) return products[i];
    return null;
  }
  function readBuffer() {
    var n = TM.parsePercent($('defaultBuffer').value);
    return n === undefined ? 20 : n;
  }
  function inputValue(id) { return $(id).value; }
  function setInput(id, value, fallback) {
    $(id).value = value != null && value !== '' ? value : (fallback != null ? fallback : '');
  }

  function blankStore(name) {
    return {
      id: 's' + Date.now() + Math.floor(Math.random() * 1000),
      name: name || 'Main',
      products: [],
      nextId: 1,
      defaultBuffer: '20',
      periodMode: 'auto',
      customDays: '30',
      detected: null,
      impact: {},
      snapshot: null
    };
  }

  function capture() {
    var store = stores[active];
    if (!store) return;
    store.products = products;
    store.nextId = nextId;
    store.defaultBuffer = $('defaultBuffer').value;
    store.periodMode = $('periodMode').value;
    store.customDays = $('customDays').value;
    store.detected = detectedPeriod;
    store.impact = {
      mode: impactMode,
      price: inputValue('imPrice'),
      margin: inputValue('imMargin'),
      baseline: inputValue('imBaseline'),
      budget: inputValue('imBudget'),
      cpc: inputValue('imCpc'),
      conv: inputValue('imConv'),
      actualSpend: inputValue('imActualSpend'),
      actualSales: inputValue('imActualSales')
    };
  }

  function bindStore() {
    var store = stores[active];
    products = store.products || (store.products = []);
    nextId = store.nextId || 1;
    products.forEach(function (p) {
      if (!p.id) p.id = nextId++;
      if (!p.tests) p.tests = [];
    });
    $('defaultBuffer').value = store.defaultBuffer != null && store.defaultBuffer !== '' ? store.defaultBuffer : 20;
    $('periodMode').value = store.periodMode || 'auto';
    $('customDays').value = store.customDays || 30;
    detectedPeriod = store.detected || null;
    var impact = store.impact || {};
    impactMode = impact.mode || 'plan';
    setInput('imPrice', impact.price, 100);
    setInput('imMargin', impact.margin, 30);
    setInput('imBaseline', impact.baseline, 1);
    setInput('imBudget', impact.budget, 100);
    setInput('imCpc', impact.cpc, 2.5);
    setInput('imConv', impact.conv, 5);
    setInput('imActualSpend', impact.actualSpend, 100);
    setInput('imActualSales', impact.actualSales, 2);
    if (store.snapshot) {
      $('snapStamp').textContent = 'Snapshot saved ' + new Date(store.snapshot.savedAt).toLocaleString();
    } else {
      $('snapStamp').textContent = plan === 'free' ? 'Free plan: this tab is not saved' : 'No snapshot saved yet';
    }
    currentPage = 1;
    expandedId = null;
    compareSnap = null;
    syncImpactMode();
    syncCustomDays();
  }

  function persist() {
    if (plan === 'free') return;
    capture();
    var payload = { version: 1, active: active, stores: plan === 'agency' ? stores : [stores[active]] };
    try { localStorage.setItem('truemargin:workspace', JSON.stringify(payload)); }
    catch (err) { /* private mode or full storage */ }
  }

  function scheduleSave() {
    if (plan === 'free') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
  }

  function loadWorkspace() {
    stores = [blankStore('Main')];
    active = 0;
    if (plan === 'free') { bindStore(); return; }
    try {
      var raw = localStorage.getItem('truemargin:workspace');
      if (raw) {
        var data = JSON.parse(raw);
        if (data && data.stores && data.stores.length) {
          stores = data.stores;
          if (plan !== 'agency') stores = stores.slice(0, 1);
          active = Math.min(data.active || 0, stores.length - 1);
        }
      }
    } catch (err) { stores = [blankStore('Main')]; active = 0; }
    bindStore();
  }

  function showToast(message) {
    var node = el('div', 'toast');
    node.textContent = message;
    $('toastStack').appendChild(node);
    setTimeout(function () { node.remove(); }, 2800);
  }

  function clearStatus() { $('importStatus').textContent = ''; }
  function setStatus(message, kind) {
    var p = el('p', kind || '');
    p.textContent = message;
    $('importStatus').appendChild(p);
  }

  function paid() { return plan === 'pro' || plan === 'agency'; }

  function paintPaidButton(node, url, label) {
    var href = String(url || '').trim();
    node.textContent = href ? label : 'Coming soon';
    node.classList.toggle('is-disabled', !href);
    node.dataset.href = href;
    if (href) node.removeAttribute('aria-disabled');
    else node.setAttribute('aria-disabled', 'true');
  }

  function openPaidLink(event) {
    var href = event.currentTarget.dataset.href;
    if (!href) { event.preventDefault(); return; }
    window.open(href, '_blank', 'noopener');
  }

  function openUpgrade(reason) {
    var text = 'Pro is unlimited SKUs, settings saved in this browser, and a CSV of the fixes. Agency adds a store per client.';
    if (reason === 'cap') text = 'The free plan analyzes 25 SKUs. Pro is $29/mo or $290/yr for the whole catalog, saved settings, and a CSV of the fixes.';
    if (reason === 'export') text = 'CSV export of the fixes is part of Pro. The free plan still shows every fix on screen, up to 25 SKUs.';
    if (reason === 'save') text = 'Saving this workspace in the browser is part of Pro. On the free plan it lasts until you close the tab.';
    if (reason === 'agency') text = 'Separate client stores are the Agency plan, $79/mo, for freelance ad managers. Pro keeps one saved store.';
    $('upgradeText').textContent = text;
    paintPaidButton($('proMonthBtn'), window.STRIPE_PRO_MONTHLY_LINK, 'Pro · $29/mo');
    paintPaidButton($('proYearBtn'), window.STRIPE_PRO_YEARLY_LINK, 'Pro · $290/yr');
    paintPaidButton($('agencyBtn'), window.STRIPE_AGENCY_LINK, 'Agency · $79/mo');
    $('unlockMsg').textContent = '';
    $('upgradeModal').hidden = false;
  }

  function renderPlan() {
    $('planBadge').textContent = plan === 'agency' ? 'Agency' : plan === 'pro' ? 'Pro' : 'Free · ' + products.length + '/25';
  }

  function renderStores() {
    var select = $('storeSelect');
    if (plan === 'agency') {
      select.hidden = false;
      $('storeLabel').hidden = true;
      select.textContent = '';
      stores.forEach(function (store, i) {
        var opt = el('option');
        opt.value = String(i);
        opt.textContent = store.name;
        if (i === active) opt.selected = true;
        select.appendChild(opt);
      });
    } else {
      select.hidden = true;
      $('storeLabel').hidden = false;
      $('storeLabel').textContent = (stores[active] && stores[active].name) || 'Main';
    }
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function numOrBlank(v) {
    if (v == null || v === '') return '';
    return v;
  }

  function exportRows() {
    var info = TM.periodInfo($('periodMode').value, detectedPeriod, $('customDays').value);
    var header = ['SKU', 'Product', 'Price', 'Unit cost', 'Shipping', 'Other cost', 'Fees per unit', 'Buffer %', 'Ad spend', 'Clicks', 'Conversions', 'Units sold', 'CPC', 'Max CPC', 'Target ROAS', 'Net profit', 'Bid recommendation', 'Profit per unit', 'Period profit', 'Estimated annual leak', 'Action', 'Why'];
    var rows = [header];
    products.forEach(function (p) {
      var c = TM.computeProduct(p, readBuffer());
      var leak = TM.leakFor(p, info.factor);
      rows.push([
        p.upc || '', p.name || '', numOrBlank(p.price), numOrBlank(p.cogs), numOrBlank(p.shipping), numOrBlank(p.other),
        numOrBlank(p.fees), c.bufferPct, numOrBlank(p.spend), numOrBlank(p.clicks), numOrBlank(p.sales), numOrBlank(p.units),
        isFinite(c.cpc) ? c.cpc.toFixed(2) : '', isFinite(c.maxcpc) ? c.maxcpc.toFixed(2) : '', isFinite(c.troas) ? c.troas.toFixed(2) : '',
        isFinite(c.netProfit) ? c.netProfit.toFixed(2) : '', c.recText,
        isFinite(leak.profitPerUnit) ? leak.profitPerUnit.toFixed(2) : '',
        isFinite(leak.periodProfit) ? leak.periodProfit.toFixed(2) : '',
        leak.annualLeak ? leak.annualLeak.toFixed(2) : 0,
        TM.ACTION_LABEL[leak.action] || leak.action,
        leak.reason
      ]);
    });
    return '\uFEFF' + TM.toCsv(rows);
  }

  function exportFixes() {
    if (!paid()) { openUpgrade('export'); return; }
    if (!products.length) { showToast('Nothing to export yet'); return; }
    download('truemargin-fixes.csv', exportRows());
    showToast('Exported ' + products.length + ' SKUs');
  }

  function filtered() {
    if (!searchQuery) return products;
    return products.filter(function (p) {
      return String(p.upc || '').toLowerCase().indexOf(searchQuery) !== -1 ||
        String(p.name || '').toLowerCase().indexOf(searchQuery) !== -1;
    });
  }

  function sortValue(p, field) {
    var c = TM.computeProduct(p, readBuffer());
    if (field === 'cpcGap') {
      return isFinite(c.cpc) && isFinite(c.maxcpc) && c.maxcpc > 0 ? c.cpc / c.maxcpc : null;
    }
    var v = c[field];
    if (v == null || (typeof v === 'number' && !isFinite(v))) return null;
    return v;
  }

  function inputEl(field, value, label, step) {
    var input = el('input');
    input.dataset.field = field;
    input.type = step ? 'number' : 'text';
    if (step) input.step = step;
    input.setAttribute('aria-label', label);
    if (value != null && value !== '') input.value = value;
    return input;
  }

  function setOut(root, name, text, cls) {
    var node = root.querySelector('[data-out="' + name + '"]');
    if (!node) return;
    node.textContent = text;
    if (cls != null) node.className = cls;
  }

  function fillOutputs(main, p) {
    var c = TM.computeProduct(p, readBuffer());
    main.className = 'main-row stripe-' + c.statusKey;
    setOut(main, 'cpc', TM.fmtMoney(c.cpc), 'calc');
    setOut(main, 'conv', TM.fmtPct(c.convrate), 'calc');
    setOut(main, 'margin', TM.fmtPct(c.effMarginFrac) + (c.hasAdvCost ? ' *' : ''), 'calc');
    setOut(main, 'maxcpc', TM.fmtMoney(c.maxcpc), 'calc');
    setOut(main, 'troas', TM.fmtX(c.troas), 'calc');
    setOut(main, 'net', isFinite(c.netProfit) ? TM.fmtMoney(c.netProfit) : '–', 'calc ' + (isFinite(c.netProfit) ? (c.netProfit >= 0 ? 'pos' : 'neg') : ''));

    var conf = main.querySelector('[data-out="conf"]');
    conf.textContent = '';
    if (!c.confTier) conf.textContent = '–';
    else {
      var pill = el('span', 'conf ' + c.confTier);
      pill.textContent = c.confLabel;
      var bound = isFinite(c.confLower) ? (c.confLower * 100).toFixed(1) : '?';
      pill.title = 'True conversion rate is at least ' + bound + '% with 95% confidence';
      conf.appendChild(pill);
    }

    var gauge = main.querySelector('[data-out="gauge"]');
    gauge.textContent = '';
    if (c.gaugePct == null) gauge.textContent = '–';
    else {
      var wrap = el('span', 'gauge');
      var bar = el('i', 'tone-' + (c.gaugeTone || 'good'));
      bar.style.width = Math.max(0, Math.min(100, c.gaugePct)) + '%';
      wrap.appendChild(bar);
      gauge.appendChild(wrap);
    }

    var rec = main.querySelector('[data-out="rec"]');
    rec.textContent = '';
    var badge = el('span', 'badge ' + c.recClass);
    badge.textContent = c.recText;
    rec.appendChild(badge);
    if (c.lowConfidence) {
      var low = el('span', 'badge mute');
      low.textContent = 'Low confidence';
      rec.appendChild(low);
    }

    var adv = document.querySelector('#rows tr.advanced-row[data-id="' + p.id + '"]');
    if (!adv) return;
    var box = adv.querySelector('[data-out="adv"]');
    box.textContent = '';
    if (!c.advLines.length) box.textContent = 'Fill in true cost, stock, or baseline to see adjusted numbers.';
    c.advLines.forEach(function (line) {
      var lineEl = el('div');
      lineEl.textContent = line;
      box.appendChild(lineEl);
    });
    var note = adv.querySelector('[data-out="marginal"]');
    if (note) note.textContent = c.marginalNote || '';
    c.tests.forEach(function (t, i) {
      var row = adv.querySelector('tr[data-test="' + i + '"]');
      if (!row) return;
      setOut(row, 'test-cpc', TM.fmtMoney(t.cpc));
      setOut(row, 'test-conv', TM.fmtPct(t.conv));
      setOut(row, 'test-profit', isFinite(t.profit) ? TM.fmtMoney(t.profit) : '–', isFinite(t.profit) ? (t.profit >= 0 ? 'pos' : 'neg') : '');
      row.classList.toggle('best', i === c.bestTestIdx);
      row.classList.toggle('worst', i === c.worstTestIdx && i !== c.bestTestIdx);
    });
  }

  function buildMainRow(p) {
    var tr = el('tr', 'main-row');
    tr.dataset.id = String(p.id);
    function td() { var cell = el('td'); tr.appendChild(cell); return cell; }
    var del = el('button', 'icon-btn');
    del.type = 'button';
    del.dataset.action = 'delete';
    del.setAttribute('aria-label', 'Remove product');
    del.textContent = '×';
    td().appendChild(del);
    td().appendChild(inputEl('upc', p.upc, 'SKU'));
    td().appendChild(inputEl('name', p.name, 'Product name'));
    td().appendChild(inputEl('price', p.price, 'Price', '0.01'));
    td().appendChild(inputEl('cogs', p.cogs, 'COGS', '0.01'));
    td().appendChild(inputEl('buffer', p.buffer, 'Buffer percent', '1'));
    td().appendChild(inputEl('spend', p.spend, 'Ad spend', '0.01'));
    td().appendChild(inputEl('clicks', p.clicks, 'Clicks', '1'));
    td().appendChild(inputEl('sales', p.sales, 'Sales', '1'));
    ['cpc', 'conv', 'conf', 'margin', 'maxcpc', 'troas', 'net', 'gauge', 'rec'].forEach(function (name) {
      var cell = td();
      cell.dataset.out = name;
    });
    var adv = el('button', 'btn small');
    adv.type = 'button';
    adv.dataset.action = 'advanced';
    adv.textContent = expandedId === p.id ? 'Advanced ▴' : 'Advanced ▾';
    td().appendChild(adv);
    fillOutputs(tr, p);
    return tr;
  }

  function buildAdvanced(p) {
    var tr = el('tr', 'advanced-row');
    tr.dataset.id = String(p.id);
    var cell = el('td');
    cell.colSpan = 19;
    var grid = el('div', 'adv-grid');

    function numField(label, field, step) {
      var wrap = el('label', 'field');
      wrap.appendChild(document.createTextNode(label));
      wrap.appendChild(inputEl(field, p[field], label, step));
      return wrap;
    }
    var cost = el('div', 'adv-col');
    cost.appendChild(Object.assign(el('h3'), { textContent: 'True cost per unit' }));
    cost.appendChild(numField('Shipping $', 'shipping', '0.01'));
    cost.appendChild(numField('Other cost $', 'other', '0.01'));
    cost.appendChild(numField('Fees per unit $', 'fees', '0.01'));
    cost.appendChild(numField('Returns %', 'returns', '0.1'));
    cost.appendChild(numField('Payment fee %', 'payfee', '0.1'));
    cost.appendChild(numField('Marketplace fee %', 'reffee', '0.1'));

    var stock = el('div', 'adv-col');
    stock.appendChild(Object.assign(el('h3'), { textContent: 'Stock and baseline' }));
    stock.appendChild(numField('Stock units', 'stock', '1'));
    stock.appendChild(numField('Baseline sales, no ads', 'baseline', '0.1'));

    var out = el('div', 'adv-col');
    out.appendChild(Object.assign(el('h3'), { textContent: 'Computed' }));
    var box = el('div');
    box.dataset.out = 'adv';
    out.appendChild(box);

    var tests = el('div', 'adv-col');
    tests.appendChild(Object.assign(el('h3'), { textContent: 'Spend-level tests' }));
    var table = el('table', 'mini');
    var head = el('thead');
    var hr = el('tr');
    ['Spend $', 'Clicks', 'Sales', 'CPC', 'Conv', 'Net', ''].forEach(function (label) {
      var th = el('th');
      th.textContent = label;
      hr.appendChild(th);
    });
    head.appendChild(hr);
    table.appendChild(head);
    var body = el('tbody');
    (p.tests || []).forEach(function (t, idx) {
      var row = el('tr');
      row.dataset.test = String(idx);
      ['spend', 'clicks', 'sales'].forEach(function (field) {
        var td = el('td');
        var input = inputEl(field, t[field], field, field === 'spend' ? '0.01' : '1');
        input.dataset.testIndex = String(idx);
        td.appendChild(input);
        row.appendChild(td);
      });
      ['test-cpc', 'test-conv', 'test-profit'].forEach(function (name) {
        var td = el('td');
        td.dataset.out = name;
        row.appendChild(td);
      });
      var kill = el('button', 'icon-btn');
      kill.type = 'button';
      kill.dataset.action = 'del-test';
      kill.dataset.testIndex = String(idx);
      kill.textContent = '×';
      kill.setAttribute('aria-label', 'Remove test');
      var tdKill = el('td');
      tdKill.appendChild(kill);
      row.appendChild(tdKill);
      body.appendChild(row);
    });
    table.appendChild(body);
    tests.appendChild(table);
    var add = el('button', 'btn small');
    add.type = 'button';
    add.dataset.action = 'add-test';
    add.textContent = '+ Add tested spend';
    tests.appendChild(add);
    var marginal = el('p', 'note');
    marginal.dataset.out = 'marginal';
    tests.appendChild(marginal);

    [cost, stock, out, tests].forEach(function (col) { grid.appendChild(col); });
    cell.appendChild(grid);
    tr.appendChild(cell);
    return tr;
  }

  function renderTable() {
    var body = $('rows');
    body.textContent = '';
    var list = filtered();
    var pages = Math.max(1, Math.ceil(list.length / pageSize));
    if (currentPage > pages) currentPage = pages;
    var start = (currentPage - 1) * pageSize;
    var slice = list.slice(start, start + pageSize);
    $('tableCount').textContent = searchQuery
      ? list.length + ' of ' + products.length + ' match “' + searchQuery + '”'
      : (products.length === 0 ? '0 products' : products.length + ' product' + (products.length === 1 ? '' : 's'));
    if (!slice.length) {
      var tr = el('tr');
      var td = el('td');
      td.colSpan = 19;
      td.textContent = searchQuery ? 'No products match your search.' : 'No products yet. Add one, or drop a file.';
      tr.appendChild(td);
      body.appendChild(tr);
    } else {
      slice.forEach(function (p) {
        body.appendChild(buildMainRow(p));
        if (expandedId === p.id) body.appendChild(buildAdvanced(p));
      });
      slice.forEach(function (p) {
        if (expandedId === p.id) {
          var main = body.querySelector('tr.main-row[data-id="' + p.id + '"]');
          if (main) fillOutputs(main, p);
        }
      });
    }
    renderPager(list.length, pages);
    document.querySelectorAll('.sort-arrow').forEach(function (node) {
      node.textContent = node.dataset.field === sortField ? (sortDir === 1 ? '▲' : '▼') : '';
    });
  }

  function renderPager(count, pages) {
    var start = count === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    var end = Math.min(currentPage * pageSize, count);
    document.querySelectorAll('[data-page-label]').forEach(function (node) {
      node.textContent = 'Showing ' + start + '–' + end + ' of ' + count;
    });
    document.querySelectorAll('[data-page-num]').forEach(function (node) {
      node.textContent = 'Page ' + currentPage + ' of ' + pages;
    });
    document.querySelectorAll('[data-page="first"], [data-page="prev"]').forEach(function (node) {
      node.disabled = currentPage <= 1;
    });
    document.querySelectorAll('[data-page="next"], [data-page="last"]').forEach(function (node) {
      node.disabled = currentPage >= pages;
    });
  }

  function renderSummary() {
    var spend = 0, revenue = 0, net = 0;
    products.forEach(function (p) {
      var c = TM.computeProduct(p, readBuffer());
      if (TM.hasValue(p.spend)) spend += TM.parseNumber(p.spend) || 0;
      if (TM.hasValue(p.price) && TM.hasValue(p.sales)) revenue += (TM.parseNumber(p.price) || 0) * (TM.parseNumber(p.sales) || 0);
      if (isFinite(c.netProfit)) net += c.netProfit;
    });
    var roas = spend > 0 ? revenue / spend : NaN;
    var host = $('summaryRow');
    host.textContent = '';
    function stat(label, value, cls) {
      var card = el('div', 'stat');
      var l = el('div', 'label');
      l.textContent = label;
      var v = el('div', 'value' + (cls ? ' ' + cls : ''));
      v.textContent = value;
      card.appendChild(l);
      card.appendChild(v);
      return card;
    }
    host.appendChild(stat('Products', String(products.length)));
    host.appendChild(stat('Ad spend', TM.fmtMoney(spend)));
    host.appendChild(stat('Blended ROAS', TM.fmtX(roas)));
    var netCard = stat('Net after ads', TM.fmtMoney(net), net >= 0 ? 'pos' : 'neg');
    if (compareSnap && isFinite(compareSnap.totalNet)) {
      var d = net - compareSnap.totalNet;
      var delta = el('div', 'note');
      delta.textContent = (d >= 0 ? '▲ ' : '▼ ') + TM.fmtMoney(Math.abs(d)) + ' vs last snapshot (total only)';
      netCard.appendChild(delta);
    }
    host.appendChild(netCard);
  }

  function syncCustomDays() {
    $('customDaysWrap').hidden = $('periodMode').value !== 'custom';
  }

  function renderLeak() {
    var info = TM.periodInfo($('periodMode').value, detectedPeriod, $('customDays').value);
    var problemsOnly = $('leakProblems').checked;
    var rows = products.map(function (p) {
      return { p: p, leak: TM.leakFor(p, info.factor) };
    });
    rows.sort(function (a, b) { return b.leak.annualLeak - a.leak.annualLeak; });
    var shown = problemsOnly ? rows.filter(function (r) { return r.leak.action !== 'healthy'; }) : rows;
    var bad = rows.filter(function (r) { return r.leak.action !== 'healthy' && r.leak.action !== 'need_data'; }).length;
    var annual = rows.reduce(function (sum, r) { return sum + r.leak.annualLeak; }, 0);
    $('leakCount').textContent = String(products.length);
    $('leakBad').textContent = String(bad);
    $('leakAnnual').textContent = TM.fmtMoney(annual);
    var convFallback = rows.some(function (r) { return r.leak.unitsSource === 'conversions'; });
    var feesKnown = rows.some(function (r) { return r.leak.feesKnown; });
    $('leakNote').textContent = 'Annual leak treats this file as ' + info.label + ' and counts only SKUs that lose money. ' +
      (feesKnown ? 'Amazon fees are included where a fee file matched the SKU. ' : 'No fee file is loaded, so profit is before marketplace fees. ') +
      (convFallback ? 'Some rows use ad conversions as units because no orders file set units sold.' : 'Units sold come from an orders or settlement file when one was imported.');

    var body = $('leakRows');
    body.textContent = '';
    if (!shown.length) {
      var empty = el('tr');
      var td = el('td');
      td.colSpan = 12;
      td.textContent = products.length ? 'Nothing in this filter.' : 'Drop a Shopify export and a Google Ads report to see leaks.';
      empty.appendChild(td);
      body.appendChild(empty);
      return;
    }
    shown.forEach(function (row) {
      var p = row.p;
      var leak = row.leak;
      var tr = el('tr');
      tr.dataset.sku = p.upc || '';
      tr.dataset.action = leak.action;
      function cell(text, cls) {
        var td = el('td');
        if (cls) td.className = cls;
        td.textContent = text;
        tr.appendChild(td);
        return td;
      }
      cell(p.upc || '');
      cell(p.name || '');
      cell(leak.price == null ? '–' : TM.fmtMoney(leak.price));
      cell(isFinite(leak.productCost) ? TM.fmtMoney(leak.productCost) : '–');
      cell(leak.feesKnown ? TM.fmtMoney(leak.fees) : '–');
      cell(isFinite(leak.spend) ? TM.fmtMoney(leak.spend) : '–');
      cell(isFinite(leak.units) ? String(leak.units) : '–');
      cell(isFinite(leak.profitPerUnit) ? TM.fmtMoney(leak.profitPerUnit) : '–', isFinite(leak.profitPerUnit) ? (leak.profitPerUnit >= 0 ? 'pos' : 'neg') : '');
      cell(isFinite(leak.periodProfit) ? TM.fmtMoney(leak.periodProfit) : '–', isFinite(leak.periodProfit) ? (leak.periodProfit >= 0 ? 'pos' : 'neg') : '');
      cell(leak.annualLeak ? TM.fmtMoney(leak.annualLeak) : '–', leak.annualLeak ? 'neg' : '');
      var action = el('td');
      var badge = el('span', 'badge ' + (leak.action === 'healthy' ? 'good' : leak.action === 'need_data' ? 'mute' : leak.action === 'raise_price' || leak.action === 'review_fees' ? 'warn' : 'bad'));
      badge.textContent = TM.ACTION_LABEL[leak.action] || leak.action;
      action.appendChild(badge);
      tr.appendChild(action);
      var why = el('td', 'reason');
      why.textContent = leak.reason;
      tr.appendChild(why);
      body.appendChild(tr);
    });
  }

  function renderAll() {
    renderTable();
    renderSummary();
    renderLeak();
    renderPlan();
    recalcImpact();
  }

  function refreshVisible() {
    document.querySelectorAll('#rows tr.main-row').forEach(function (tr) {
      var p = findId(+tr.dataset.id);
      if (p) fillOutputs(tr, p);
    });
  }

  function addProduct() {
    if (plan === 'free' && products.length >= FREE_CAP) { openUpgrade('cap'); return; }
    products.push({ id: nextId++, tests: [] });
    currentPage = Math.max(1, Math.ceil(filtered().length / pageSize));
    renderAll();
    scheduleSave();
  }

  function onRowInput(event) {
    var input = event.target;
    if (!input.dataset || !input.dataset.field) return;
    var tr = input.closest('tr');
    var p = findId(+tr.dataset.id);
    if (!p) return;
    if (input.dataset.testIndex != null) {
      var idx = +input.dataset.testIndex;
      p.tests[idx] = p.tests[idx] || {};
      p.tests[idx][input.dataset.field] = input.value;
    } else {
      p[input.dataset.field] = input.value;
    }
    var main = document.querySelector('#rows tr.main-row[data-id="' + p.id + '"]');
    if (main) fillOutputs(main, p);
    renderSummary();
    renderLeak();
    renderPlan();
    scheduleSave();
  }

  function onRowClick(event) {
    var btn = event.target.closest('button');
    if (!btn) return;
    var tr = btn.closest('tr');
    var id = +tr.dataset.id;
    var p = findId(id);
    if (btn.dataset.action === 'delete') {
      products = products.filter(function (item) { return item.id !== id; });
      stores[active].products = products;
      if (expandedId === id) expandedId = null;
      renderAll();
      scheduleSave();
    } else if (btn.dataset.action === 'advanced') {
      expandedId = expandedId === id ? null : id;
      renderTable();
    } else if (btn.dataset.action === 'add-test' && p) {
      p.tests = p.tests || [];
      p.tests.push({});
      expandedId = id;
      renderTable();
      scheduleSave();
    } else if (btn.dataset.action === 'del-test' && p) {
      p.tests.splice(+btn.dataset.testIndex, 1);
      renderTable();
      scheduleSave();
    }
  }

  function findProduct(rec) {
    var key = TM.skuKey(rec.sku);
    var asin = TM.skuKey(rec.asin);
    var i;
    if (key) {
      for (i = 0; i < products.length; i++) if (TM.skuKey(products[i].upc) === key) return products[i];
    }
    if (asin) {
      for (i = 0; i < products.length; i++) if (TM.skuKey(products[i].asin) === asin) return products[i];
    }
    return null;
  }

  function applyRecords(result) {
    var added = 0, updated = 0, held = 0;
    var limit = plan === 'free' ? FREE_CAP : Infinity;
    result.records.forEach(function (rec) {
      if (!rec.sku) return;
      var existing = findProduct(rec);
      if (!existing) {
        if (products.length >= limit) { held++; return; }
        existing = { id: nextId++, tests: [] };
        products.push(existing);
        added++;
      } else updated++;
      existing.upc = rec.sku;
      if (rec.asin) existing.asin = rec.asin;
      if (rec.name) existing.name = rec.name;
      NUM_FIELDS.forEach(function (field) {
        if (Object.prototype.hasOwnProperty.call(rec, field)) existing[field] = rec[field];
      });
      if (!TM.hasValue(existing.price) && rec.avgPrice != null) existing.price = rec.avgPrice;
    });
    var text = added + ' new, ' + updated + ' updated';
    if (result.skippedTotal) text += ', skipped ' + result.skippedTotal + ' totals row' + (result.skippedTotal === 1 ? '' : 's');
    if (result.skippedBlank) text += ', skipped ' + result.skippedBlank + ' blank';
    if (held) {
      text += '. Free plan kept ' + products.length + ' SKUs and left out ' + held;
      openUpgrade('cap');
    }
    return { added: added, updated: updated, held: held, text: text };
  }

  function fieldsFor(type) {
    return type === 'amazon_settlement' ? SETTLEMENT_FIELDS : MAP_FIELDS;
  }

  function renderMapFields() {
    var host = $('mapFields');
    host.textContent = '';
    var headers = mapAnalysis.headers;
    fieldsFor(mapAnalysis.type).forEach(function (pair) {
      var field = pair[0];
      var label = el('label', 'field');
      label.appendChild(document.createTextNode(pair[1]));
      var select = el('select', 'select');
      select.dataset.mapField = field;
      var none = el('option');
      none.value = '';
      none.textContent = 'Don’t import';
      select.appendChild(none);
      headers.forEach(function (header, idx) {
        if (!String(header || '').trim()) return;
        var opt = el('option');
        opt.value = String(idx);
        opt.textContent = header;
        select.appendChild(opt);
      });
      if (activeMapping[field] != null) select.value = String(activeMapping[field]);
      select.addEventListener('change', function () {
        if (select.value === '') delete activeMapping[field];
        else activeMapping[field] = +select.value;
        renderMapPreview();
      });
      label.appendChild(select);
      host.appendChild(label);
    });
  }

  function renderMapPreview() {
    var result = TM.materialize(mapAnalysis, activeMapping);
    var head = $('mapHead');
    var body = $('mapPreview');
    head.textContent = '';
    body.textContent = '';
    var cols = fieldsFor(mapAnalysis.type).filter(function (pair) { return activeMapping[pair[0]] != null; });
    var hr = el('tr');
    cols.forEach(function (pair) {
      var th = el('th');
      th.textContent = pair[1];
      hr.appendChild(th);
    });
    head.appendChild(hr);
    (result.records || []).slice(0, 6).forEach(function (rec) {
      var tr = el('tr');
      cols.forEach(function (pair) {
        var td = el('td');
        var value = rec[pair[0]];
        td.textContent = value == null ? '' : String(value);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    var info = [];
    if (result.records) info.push(result.records.length + ' SKUs ready');
    if (result.skippedTotal) info.push(result.skippedTotal + ' totals row skipped');
    if (result.skippedBlank) info.push(result.skippedBlank + ' blank rows skipped');
    if (result.notes) info.push(result.notes.join(' '));
    $('mapInfo').textContent = info.join('. ');
    $('mapWarn').textContent = result.error || '';
    var seen = {};
    var dup = false;
    Object.keys(activeMapping).forEach(function (field) {
      var idx = activeMapping[field];
      if (seen[idx]) dup = true;
      seen[idx] = true;
    });
    if (dup && !result.error) $('mapWarn').textContent = 'Two fields use the same column. Change one of them if that was an accident.';
  }

  function openMap(name, analysis) {
    mapOpen = true;
    mapAnalysis = analysis;
    mapFileName = name;
    activeMapping = Object.assign({}, analysis.mapping);
    $('mapMeta').textContent = name + ' · header on row ' + (analysis.headerIndex + 1) +
      (analysis.headerIndex ? ' · ' + analysis.headerIndex + ' title row' + (analysis.headerIndex === 1 ? '' : 's') + ' skipped' : '') +
      (analysis.period ? ' · ' + analysis.period.label : '');
    var select = $('mapType');
    select.textContent = '';
    if (analysis.type === 'unknown') {
      var unknown = el('option');
      unknown.value = 'unknown';
      unknown.textContent = 'Unrecognized — map the columns';
      select.appendChild(unknown);
    }
    TM.FILE_TYPES.forEach(function (type) {
      var opt = el('option');
      opt.value = type.id;
      opt.textContent = type.label;
      select.appendChild(opt);
    });
    select.value = analysis.type === 'unknown' ? 'unknown' : analysis.type;
    var type = null;
    TM.FILE_TYPES.forEach(function (item) { if (item.id === analysis.type) type = item; });
    $('mapBlurb').textContent = type ? type.blurb : 'These column names were not recognized. Pick the SKU column, or change the file type.';
    renderMapFields();
    renderMapPreview();
    $('mapModal').hidden = false;
  }

  function closeMap(andNext) {
    $('mapModal').hidden = true;
    mapOpen = false;
    mapAnalysis = null;
    if (andNext) nextFile();
  }

  function confirmMap() {
    var result = TM.materialize(mapAnalysis, activeMapping);
    if (result.error || !result.records.length) {
      $('mapWarn').textContent = result.error || 'Nothing to import.';
      return;
    }
    var stats = applyRecords(result);
    if (result.period) detectedPeriod = result.period;
    setStatus(mapFileName + ' — ' + (mapAnalysis.typeLabel || 'Import') + '. ' + stats.text);
    showToast('Imported ' + result.records.length + ' rows');
    renderAll();
    scheduleSave();
    closeMap(true);
  }

  function nextFile() {
    if (!queue.length || mapOpen) return;
    var file = queue.shift();
    var reader = new FileReader();
    reader.onload = function () {
      try {
        if (typeof XLSX === 'undefined') throw new Error('library');
        var wb = XLSX.read(reader.result, { type: 'array' });
        var analysis = TM.analyze(TM.gridFromWorkbook(wb));
        if (!analysis.ok) {
          setStatus(file.name + ': ' + analysis.error, 'bad');
          nextFile();
          return;
        }
        openMap(file.name, analysis);
      } catch (err) {
        setStatus(file.name + ': could not read this file. Use CSV or Excel.', 'bad');
        nextFile();
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFiles(list) {
    var idle = !queue.length && !mapOpen;
    for (var i = 0; i < list.length; i++) queue.push(list[i]);
    if (idle) {
      clearStatus();
      nextFile();
    }
  }

  function importBuffer(buf, name) {
    try {
      var wb = XLSX.read(buf, { type: 'array' });
      var analysis = TM.analyze(TM.gridFromWorkbook(wb));
      if (!analysis.ok) { setStatus(name + ': ' + analysis.error, 'bad'); return; }
      var result = TM.materialize(analysis, analysis.mapping);
      if (result.error) { setStatus(name + ': ' + result.error, 'bad'); return; }
      var stats = applyRecords(result);
      if (result.period) detectedPeriod = result.period;
      setStatus(name + ' — ' + analysis.typeLabel + '. ' + stats.text);
    } catch (err) {
      setStatus(name + ': could not read this sample.', 'bad');
    }
  }

  function loadSamples() {
    clearStatus();
    var files = [
      ['../samples/shopify-products.csv', 'shopify-products.csv'],
      ['../samples/shopify-orders.csv', 'shopify-orders.csv'],
      ['../samples/cost-sheet.csv', 'cost-sheet.csv'],
      ['../samples/google-ads-product-report.csv', 'google-ads-product-report.csv'],
      ['../samples/amazon-fee-preview.csv', 'amazon-fee-preview.csv']
    ];
    var index = 0;
    function step() {
      if (index >= files.length) {
        renderAll();
        scheduleSave();
        showToast('Sample files loaded');
        return;
      }
      var item = files[index++];
      fetch(item[0]).then(function (res) {
        if (!res.ok) throw new Error('missing');
        return res.arrayBuffer();
      }).then(function (buf) {
        importBuffer(buf, item[1]);
        step();
      }).catch(function () {
        setStatus('Could not load ' + item[1] + '. Serve the site from its folder so the samples can be fetched.', 'bad');
      });
    }
    step();
  }

  function totalNet() {
    var net = 0;
    products.forEach(function (p) {
      var c = TM.computeProduct(p, readBuffer());
      if (isFinite(c.netProfit)) net += c.netProfit;
    });
    return net;
  }

  function saveSnapshot() {
    if (!paid()) { openUpgrade('save'); return; }
    capture();
    stores[active].snapshot = {
      savedAt: new Date().toISOString(),
      totalNet: totalNet(),
      products: JSON.parse(JSON.stringify(products)),
      defaultBuffer: $('defaultBuffer').value
    };
    $('snapStamp').textContent = 'Snapshot saved ' + new Date().toLocaleString();
    persist();
    showToast('Snapshot saved');
  }

  function loadSnapshot() {
    if (!paid()) { openUpgrade('save'); return; }
    var snap = stores[active].snapshot;
    if (!snap) { $('snapStamp').textContent = 'No snapshot saved yet'; return; }
    products = JSON.parse(JSON.stringify(snap.products || []));
    stores[active].products = products;
    nextId = Math.max(1, products.reduce(function (max, p) { return Math.max(max, p.id || 0); }, 0) + 1);
    if (snap.defaultBuffer != null) $('defaultBuffer').value = snap.defaultBuffer;
    currentPage = 1;
    expandedId = null;
    renderAll();
    persist();
    $('snapStamp').textContent = 'Loaded snapshot from ' + new Date(snap.savedAt).toLocaleString();
  }

  function compareSnapshot() {
    if (!paid()) { openUpgrade('save'); return; }
    var snap = stores[active].snapshot;
    if (!snap) { $('snapStamp').textContent = 'No snapshot to compare'; return; }
    compareSnap = snap;
    $('snapStamp').textContent = 'Comparing total net profit to ' + new Date(snap.savedAt).toLocaleString();
    renderSummary();
  }

  function syncImpactMode() {
    var planMode = impactMode === 'plan';
    $('modePlan').classList.toggle('on', planMode);
    $('modeReview').classList.toggle('on', !planMode);
    $('imPlanFields').hidden = !planMode;
    $('imReviewFields').hidden = planMode;
    recalcImpact();
  }

  function recalcImpact() {
    var price = TM.parseNumber(inputValue('imPrice'));
    var marginPct = TM.parseNumber(inputValue('imMargin'));
    var baseline = TM.parseNumber(inputValue('imBaseline'));
    var banner = $('imGain');
    if (price == null || marginPct == null || baseline == null) {
      banner.className = 'banner';
      banner.textContent = 'Fill in price, margin, and baseline sales.';
      return;
    }
    var gp = price * (marginPct / 100);
    var spend, after, projected;
    if (impactMode === 'plan') {
      var budget = TM.parseNumber(inputValue('imBudget'));
      var cpc = TM.parseNumber(inputValue('imCpc'));
      var conv = TM.parseNumber(inputValue('imConv'));
      if (budget == null || cpc == null || conv == null || !(cpc > 0)) {
        banner.className = 'banner';
        banner.textContent = 'Fill in budget, CPC, and conversion rate.';
        return;
      }
      spend = budget;
      after = baseline + (budget / cpc) * (conv / 100);
      projected = true;
    } else {
      spend = TM.parseNumber(inputValue('imActualSpend'));
      after = TM.parseNumber(inputValue('imActualSales'));
      if (spend == null || after == null) {
        banner.className = 'banner';
        banner.textContent = 'Fill in actual spend and actual sales.';
        return;
      }
      projected = false;
    }
    var beforeProfit = baseline * gp;
    var afterProfit = after * gp - spend;
    var gain = afterProfit - beforeProfit;
    $('imBeforeSales').textContent = baseline.toFixed(2);
    $('imBeforeProfit').textContent = TM.fmtMoney(beforeProfit);
    $('imAfterSales').textContent = after.toFixed(2);
    $('imAfterProfit').textContent = TM.fmtMoney(afterProfit);
    $('imAfterLabel').textContent = projected ? 'With ads (projected)' : 'With ads (actual)';
    banner.className = 'banner ' + (gain >= 0 ? 'pos' : 'neg');
    banner.textContent = gain >= 0
      ? 'Ads added ' + TM.fmtMoney(gain) + ' in profit vs not running them'
      : 'Ads cost you ' + TM.fmtMoney(Math.abs(gain)) + ' vs not running them';
  }

  function goToPage(which) {
    var pages = Math.max(1, Math.ceil(filtered().length / pageSize));
    if (which === 'first') currentPage = 1;
    else if (which === 'prev') currentPage = Math.max(1, currentPage - 1);
    else if (which === 'next') currentPage = Math.min(pages, currentPage + 1);
    else if (which === 'last') currentPage = pages;
    expandedId = null;
    renderTable();
  }

  function closeWelcome() {
    $('welcomeModal').hidden = true;
    if ($('dontShowAgain').checked) {
      try { localStorage.setItem('truemargin:hideWelcome', '1'); } catch (err) {}
    }
  }

  function wire() {
    $('rows').addEventListener('input', onRowInput);
    $('rows').addEventListener('click', onRowClick);
    $('addProduct').addEventListener('click', addProduct);
    $('clearProducts').addEventListener('click', function () {
      products = [];
      stores[active].products = products;
      nextId = 1;
      expandedId = null;
      detectedPeriod = null;
      renderAll();
      scheduleSave();
    });
    $('exportBtn').addEventListener('click', exportFixes);
    $('exportLeak').addEventListener('click', exportFixes);
    $('templateBtn').addEventListener('click', function () {
      download('truemargin-cost-sheet.csv', 'SKU,Product,Unit cost,Shipping,Other costs,ASIN\nEXAMPLE-1,Example product,8.00,1.50,0.40,\n');
    });
    $('sampleBtn').addEventListener('click', loadSamples);
    $('welcomeSample').addEventListener('click', function () { closeWelcome(); loadSamples(); });
    $('welcomeBlank').addEventListener('click', closeWelcome);
    $('browseBtn').addEventListener('click', function () { $('fileInput').click(); });
    $('fileInput').addEventListener('change', function () {
      if (this.files && this.files.length) handleFiles(this.files);
      this.value = '';
    });
    $('defaultBuffer').addEventListener('input', function () {
      refreshVisible();
      renderSummary();
      scheduleSave();
    });
    $('searchBox').addEventListener('input', function () {
      searchQuery = this.value.trim().toLowerCase();
      currentPage = 1;
      renderTable();
    });
    $('pageSize').addEventListener('change', function () {
      pageSize = parseInt(this.value, 10) || 50;
      currentPage = 1;
      renderTable();
    });
    document.querySelectorAll('[data-page]').forEach(function (btn) {
      btn.addEventListener('click', function () { goToPage(btn.dataset.page); });
    });
    document.querySelectorAll('.sort').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var field = btn.dataset.sort;
        if (sortField === field) sortDir = -sortDir;
        else { sortField = field; sortDir = 1; }
        products.sort(function (a, b) {
          var va = sortValue(a, field);
          var vb = sortValue(b, field);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (va < vb) return -1 * sortDir;
          if (va > vb) return 1 * sortDir;
          return 0;
        });
        currentPage = 1;
        renderTable();
        scheduleSave();
      });
    });
    $('tabBid').addEventListener('click', function () {
      $('viewBid').hidden = false;
      $('viewLeak').hidden = true;
      $('tabBid').classList.add('on');
      $('tabLeak').classList.remove('on');
      $('tabBid').setAttribute('aria-selected', 'true');
      $('tabLeak').setAttribute('aria-selected', 'false');
    });
    $('tabLeak').addEventListener('click', function () {
      $('viewBid').hidden = true;
      $('viewLeak').hidden = false;
      $('tabLeak').classList.add('on');
      $('tabBid').classList.remove('on');
      $('tabLeak').setAttribute('aria-selected', 'true');
      $('tabBid').setAttribute('aria-selected', 'false');
      renderLeak();
    });
    $('periodMode').addEventListener('change', function () { syncCustomDays(); renderLeak(); scheduleSave(); });
    $('customDays').addEventListener('input', function () { renderLeak(); scheduleSave(); });
    $('leakProblems').addEventListener('change', renderLeak);
    $('impactPanel').addEventListener('input', function () { recalcImpact(); scheduleSave(); });
    $('modePlan').addEventListener('click', function () { impactMode = 'plan'; syncImpactMode(); scheduleSave(); });
    $('modeReview').addEventListener('click', function () { impactMode = 'review'; syncImpactMode(); scheduleSave(); });
    $('saveSnap').addEventListener('click', saveSnapshot);
    $('loadSnap').addEventListener('click', loadSnapshot);
    $('compareSnap').addEventListener('click', compareSnapshot);
    $('helpOpen').addEventListener('click', function () { $('helpModal').hidden = false; });
    $('helpClose').addEventListener('click', function () { $('helpModal').hidden = true; });
    $('planBadge').addEventListener('click', function () { openUpgrade('general'); });
    $('upgradeClose').addEventListener('click', function () { $('upgradeModal').hidden = true; });
    $('proMonthBtn').addEventListener('click', openPaidLink);
    $('proYearBtn').addEventListener('click', openPaidLink);
    $('agencyBtn').addEventListener('click', openPaidLink);
    $('unlockBtn').addEventListener('click', function () {
      var code = $('unlockCode').value.trim();
      var agencyCode = String(window.AGENCY_UNLOCK_CODE || '').trim();
      var proCode = String(window.PRO_UNLOCK_CODE || '').trim();
      var next = null;
      if (agencyCode && code === agencyCode) next = 'agency';
      else if (proCode && code === proCode) next = 'pro';
      if (!next) {
        $('unlockMsg').textContent = 'That code does not match. TODO: this check is a placeholder in the browser, not a subscription.';
        return;
      }
      plan = next;
      try { localStorage.setItem('truemargin:plan', plan); } catch (err) {}
      $('unlockMsg').textContent = (next === 'agency' ? 'Agency' : 'Pro') + ' is unlocked in this browser only.';
      showToast(plan === 'agency' ? 'Agency unlocked' : 'Pro unlocked');
      persist();
      renderStores();
      renderAll();
    });
    $('newStoreBtn').addEventListener('click', function () {
      if (plan !== 'agency') { openUpgrade('agency'); return; }
      $('newStoreForm').hidden = false;
      $('newStoreName').focus();
    });
    $('newStoreCreate').addEventListener('click', function () {
      var name = $('newStoreName').value.trim() || ('Client ' + (stores.length + 1));
      capture();
      stores.push(blankStore(name));
      active = stores.length - 1;
      bindStore();
      $('newStoreName').value = '';
      $('newStoreForm').hidden = true;
      renderStores();
      renderAll();
      persist();
    });
    $('storeSelect').addEventListener('change', function () {
      capture();
      active = parseInt(this.value, 10) || 0;
      bindStore();
      renderAll();
      persist();
    });
    $('mapCancel').addEventListener('click', function () {
      setStatus(mapFileName + ': import cancelled. Nothing was added.', 'bad');
      closeMap(true);
    });
    $('mapConfirm').addEventListener('click', confirmMap);
    $('mapType').addEventListener('change', function () {
      mapAnalysis.type = this.value;
      var found = null;
      TM.FILE_TYPES.forEach(function (item) { if (item.id === this.value) found = item; }, this);
      mapAnalysis.typeLabel = found ? found.label : 'Unrecognized file';
      $('mapBlurb').textContent = found ? found.blurb : 'Map the columns yourself.';
      activeMapping = TM.suggestMapping(this.value === 'unknown' ? 'cost_sheet' : this.value, mapAnalysis.headerNorms);
      renderMapFields();
      renderMapPreview();
    });
    ['mapModal', 'upgradeModal', 'helpModal', 'welcomeModal'].forEach(function (id) {
      $(id).addEventListener('click', function (event) {
        if (event.target === this) this.hidden = true;
        if (id === 'mapModal' && event.target === this) closeMap(true);
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!$('mapModal').hidden) closeMap(true);
      $('upgradeModal').hidden = true;
      $('helpModal').hidden = true;
      if (!$('welcomeModal').hidden) closeWelcome();
    });
    document.addEventListener('dragover', function (event) {
      if (!event.dataTransfer) return;
      event.preventDefault();
      $('dropZone').classList.add('hot');
    });
    document.addEventListener('dragleave', function (event) {
      if (event.target === document.documentElement) $('dropZone').classList.remove('hot');
    });
    document.addEventListener('drop', function (event) {
      if (!event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
      event.preventDefault();
      $('dropZone').classList.remove('hot');
      handleFiles(event.dataTransfer.files);
    });
  }

  function init() {
    try { plan = localStorage.getItem('truemargin:plan') || 'free'; } catch (err) { plan = 'free'; }
    if (plan !== 'pro' && plan !== 'agency') plan = 'free';
    wire();
    loadWorkspace();
    renderStores();
    renderAll();
    var hide = false;
    try { hide = localStorage.getItem('truemargin:hideWelcome') === '1'; } catch (err) {}
    if (!hide) $('welcomeModal').hidden = false;
  }

  init();
})();
