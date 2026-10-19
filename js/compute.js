/* Bid math for one SKU. Pure: pass the default buffer in, do not read the DOM. */
(function (root) {
  var TM = root.TM || (root.TM = {});

  function num(v) {
    if (!TM.hasValue(v)) return undefined;
    return TM.parseNumber(v);
  }

  function wilsonLower(successes, n) {
    if (!n || n <= 0) return NaN;
    var z = 1.96;
    var phat = Math.min(successes / n, 1);
    var denom = 1 + (z * z) / n;
    var center = phat + (z * z) / (2 * n);
    var margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);
    return Math.max((center - margin) / denom, 0);
  }

  var REC = {
    up: { cls: 'good', text: 'Increase bid', stripe: 'up' },
    hold: { cls: 'warn', text: 'Maintain', stripe: 'hold' },
    down: { cls: 'bad', text: 'Decrease — losing profit', stripe: 'down' },
    downZero: { cls: 'bad', text: 'Decrease — losing money', stripe: 'down' },
    unprofitable: { cls: 'bad', text: 'Unprofitable — cost exceeds price', stripe: 'down' },
    stock: { cls: 'info', text: 'Hold — low stock', stripe: 'stock' },
    wait: { cls: 'mute', text: 'Need data', stripe: 'wait' }
  };

  function computeProduct(p, defaultBufferPct) {
    var price = num(p.price);
    var cogs = num(p.cogs);
    var bufferPct;
    if (TM.hasValue(p.buffer)) bufferPct = TM.parsePercent(p.buffer);
    else bufferPct = TM.parsePercent(defaultBufferPct);
    if (bufferPct === undefined || !isFinite(bufferPct)) bufferPct = 20;
    var bufferFrac = bufferPct / 100;

    var spend = num(p.spend);
    var clicks = num(p.clicks);
    var sales = num(p.sales);

    var cpc = spend != null && clicks ? spend / clicks : NaN;
    var convrate = sales != null && clicks ? sales / clicks : NaN;
    var marginFrac = price != null && cogs != null && price > 0 ? (price - cogs) / price : NaN;
    var grossProfitPerUnit = price != null && cogs != null ? price - cogs : NaN;

    var shipping = TM.hasValue(p.shipping) ? TM.parseNumber(p.shipping) || 0 : 0;
    var other = TM.hasValue(p.other) ? TM.parseNumber(p.other) || 0 : 0;
    var fees = TM.hasValue(p.fees) ? TM.parseNumber(p.fees) || 0 : 0;
    var returnsPct = (TM.hasValue(p.returns) ? TM.parseNumber(p.returns) || 0 : 0) / 100;
    var payfeePct = (TM.hasValue(p.payfee) ? TM.parseNumber(p.payfee) || 0 : 0) / 100;
    var reffeePct = (TM.hasValue(p.reffee) ? TM.parseNumber(p.reffee) || 0 : 0) / 100;
    var hasAdvCost = TM.hasValue(p.shipping) || TM.hasValue(p.other) || TM.hasValue(p.fees) ||
      TM.hasValue(p.returns) || TM.hasValue(p.payfee) || TM.hasValue(p.reffee);

    var trueCost = NaN;
    var feeMarginFrac = NaN;
    var trueGross = NaN;
    if (price != null && cogs != null) {
      trueCost = cogs + shipping + other + fees + price * (returnsPct + payfeePct + reffeePct);
      trueGross = price - trueCost;
      feeMarginFrac = price > 0 ? trueGross / price : NaN;
    }

    var effGross = hasAdvCost ? trueGross : grossProfitPerUnit;
    var effMargin = hasAdvCost ? feeMarginFrac : marginFrac;
    var maxSpendPerConv = isFinite(effGross) ? effGross * (1 - bufferFrac) : NaN;
    var maxcpc = isFinite(maxSpendPerConv) && isFinite(convrate) ? maxSpendPerConv * convrate : NaN;
    var troas = price != null && isFinite(maxSpendPerConv) && maxSpendPerConv > 0 ? price / maxSpendPerConv : NaN;
    var grossProfit = isFinite(effGross) && sales != null ? effGross * sales : NaN;
    var netProfit = isFinite(grossProfit) && spend != null ? grossProfit - spend : NaN;
    if (sales === 0 && spend != null && spend > 0 && !isFinite(netProfit)) netProfit = -spend;

    var confTier = null;
    var confLabel = '–';
    var confLower = NaN;
    if (clicks != null && clicks > 0) {
      confLower = wilsonLower(sales || 0, clicks);
      confTier = 'low';
      confLabel = 'Low (n=' + clicks + ')';
      if (clicks >= 200) {
        confTier = 'high';
        confLabel = 'High (n=' + clicks + ')';
      } else if (clicks >= 50) {
        confTier = 'med';
        confLabel = 'Med (n=' + clicks + ')';
      }
    }

    var recKey = 'wait';
    var gaugePct = null;
    var gaugeTone = null;
    if (isFinite(effGross) && effGross < 0) {
      recKey = 'unprofitable';
    } else if (spend != null && spend > 0 && sales === 0) {
      recKey = 'downZero';
      gaugePct = 100;
      gaugeTone = 'bad';
    } else if (!isFinite(cpc) || !isFinite(maxcpc) || maxcpc <= 0) {
      recKey = 'wait';
    } else {
      gaugePct = Math.min((Math.min(cpc / maxcpc, 1.6) / 1.6) * 100, 100);
      gaugeTone = 'good';
      recKey = 'up';
      if (cpc > maxcpc * 1.05) {
        gaugeTone = 'bad';
        recKey = 'down';
      } else if (cpc >= maxcpc * 0.85) {
        gaugeTone = 'warn';
        recKey = 'hold';
      }
      var stock = num(p.stock);
      if (stock != null && sales != null && sales > 0 && stock < sales) {
        recKey = 'stock';
        gaugeTone = 'info';
      }
    }

    var lowConfidence = !!(clicks && clicks < 50 && recKey !== 'wait' && recKey !== 'unprofitable' && recKey !== 'stock');
    var rec = REC[recKey];

    var advLines = [];
    if (hasAdvCost && isFinite(trueCost)) {
      advLines.push('True unit cost: ' + TM.fmtMoney(trueCost) + ' (COGS + shipping + other + fees)');
      advLines.push('Margin after fees: ' + TM.fmtPct(feeMarginFrac) + ' vs raw margin ' + TM.fmtPct(marginFrac));
      advLines.push('True max CPC: ' + TM.fmtMoney(maxcpc) + ' · True target ROAS: ' + TM.fmtX(troas));
    }

    var baseline = num(p.baseline);
    if (baseline != null && sales != null && isFinite(effGross)) {
      var incSales = Math.max(sales - baseline, 0);
      var incProfit = incSales * effGross - (spend || 0);
      advLines.push('Incremental sales (ad-caused): ' + incSales.toFixed(2) + ' of ' + sales + ' total');
      advLines.push('Ad-driven net profit: ' + TM.fmtMoney(incProfit) + ' vs naive ' + TM.fmtMoney(netProfit));
    }
    var stockLeft = num(p.stock);
    if (stockLeft != null && sales != null) {
      var coverage = sales > 0 ? stockLeft / sales : Infinity;
      advLines.push('Stock covers about ' + (isFinite(coverage) ? coverage.toFixed(1) : '∞') + '× this period’s sales' +
        (coverage < 1 ? ' — you will stock out before spend catches up' : ''));
    }

    var tests = (p.tests || []).map(function (t) {
      var tSpend = num(t.spend);
      var tClicks = num(t.clicks);
      var tSales = num(t.sales);
      var tCpc = tSpend != null && tClicks ? tSpend / tClicks : NaN;
      var tConv = tSales != null && tClicks ? tSales / tClicks : NaN;
      var gp = isFinite(effMargin) && price != null ? price * effMargin : NaN;
      var tProfit = isFinite(gp) && tSales != null && tSpend != null ? tSales * gp - tSpend : NaN;
      return { spend: tSpend, cpc: tCpc, conv: tConv, profit: tProfit };
    });

    var bestTestIdx = -1;
    var worstTestIdx = -1;
    var marginalNote = '';
    var valid = [];
    tests.forEach(function (t, i) {
      if (t.spend != null && isFinite(t.profit)) valid.push({ i: i, spend: t.spend, profit: t.profit });
    });
    if (valid.length >= 2) {
      valid.sort(function (a, b) { return a.spend - b.spend; });
      var best = valid[0];
      var worst = valid[0];
      valid.forEach(function (t) {
        if (t.profit > best.profit) best = t;
        if (t.profit < worst.profit) worst = t;
      });
      bestTestIdx = best.i;
      worstTestIdx = worst.i;
      var parts = [];
      for (var k = 1; k < valid.length; k++) {
        var dP = valid[k].profit - valid[k - 1].profit;
        var dS = valid[k].spend - valid[k - 1].spend;
        var marg = dS !== 0 ? dP / dS : NaN;
        parts.push('$' + valid[k - 1].spend + '→$' + valid[k].spend + ': ' +
          (isFinite(marg) ? ((marg >= 0 ? '+' : '') + marg.toFixed(2) + '/$ marginal') : '–'));
      }
      marginalNote = 'Best tested spend: $' + best.spend + ' (' + TM.fmtMoney(best.profit) +
        ' profit). Marginal profit between tested points — ' + parts.join(' · ') +
        '. Only between points you actually tested.';
    } else if (valid.length === 1) {
      marginalNote = 'Add a second tested spend level to see where marginal returns turn negative.';
    }

    return {
      price: price,
      cogs: cogs,
      bufferPct: bufferPct,
      spend: spend,
      clicks: clicks,
      sales: sales,
      cpc: cpc,
      convrate: convrate,
      marginFrac: marginFrac,
      effMarginFrac: effMargin,
      maxcpc: maxcpc,
      troas: troas,
      netProfit: netProfit,
      confTier: confTier,
      confLabel: confLabel,
      confLower: confLower,
      recKey: recKey,
      recText: rec.text,
      recClass: rec.cls,
      statusKey: rec.stripe,
      lowConfidence: lowConfidence,
      gaugePct: gaugePct,
      gaugeTone: gaugeTone,
      hasAdvCost: hasAdvCost,
      advLines: advLines,
      tests: tests,
      bestTestIdx: bestTestIdx,
      worstTestIdx: worstTestIdx,
      marginalNote: marginalNote,
      effGross: effGross
    };
  }

  TM.computeProduct = computeProduct;
  TM.wilsonLower = wilsonLower;
})(typeof window !== 'undefined' ? window : globalThis);
