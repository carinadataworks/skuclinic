/* Profit after cost, fees, and ad spend. Pure. */
(function (root) {
  var TM = root.TM || (root.TM = {});

  function n0(v) {
    if (!TM.hasValue(v)) return 0;
    var n = TM.parseNumber(v);
    return n == null ? 0 : n;
  }

  function periodInfo(mode, detected, customDays) {
    if (mode === 'month') return { factor: 12, label: 'one month' };
    if (mode === 'quarter') return { factor: 4, label: 'one quarter' };
    if (mode === 'year') return { factor: 1, label: 'one year' };
    if (mode === 'custom') {
      var d = TM.parseNumber(customDays);
      if (!(d > 0)) d = 30;
      return { factor: 365 / d, label: d + ' days' };
    }
    if (detected && detected.days > 0) {
      return {
        factor: 365 / detected.days,
        label: detected.label || (detected.days + ' days from the file')
      };
    }
    return { factor: 12, label: 'one month (assumed — no date range in the files)' };
  }

  function pctOf(p, key) {
    if (!TM.hasValue(p[key])) return 0;
    var n = TM.parseNumber(p[key]);
    return n == null ? 0 : n / 100;
  }

  /* One channel: price − product cost − fees per unit, times units, minus spend. */
  function channelFigures(price, productCost, fixedFees, pctShare, units, spend) {
    var fees = fixedFees + (price != null ? price * pctShare : 0);
    var unitBeforeAds = price != null ? price - productCost - fees : NaN;
    var periodProfit = NaN;
    if (isFinite(unitBeforeAds) && units != null) periodProfit = unitBeforeAds * units - spend;
    return { fees: fees, unitBeforeAds: unitBeforeAds, periodProfit: periodProfit };
  }

  function leakFor(p, factor) {
    var listPrice = TM.hasValue(p.price) ? TM.parseNumber(p.price) : undefined;
    var avgPrice = TM.hasValue(p.avgPrice) ? TM.parseNumber(p.avgPrice) : undefined;
    var price = avgPrice != null ? avgPrice : listPrice;
    var priceSource = avgPrice != null ? 'average selling price' : 'list price';

    var cogsKnown = TM.hasValue(p.cogs);
    var shipKnown = TM.hasValue(p.shipping);
    var otherKnown = TM.hasValue(p.other);
    var fixedKnown = TM.hasValue(p.fees);
    var pctShare = pctOf(p, 'returns') + pctOf(p, 'payfee') + pctOf(p, 'reffee');
    var pctKnown = TM.hasValue(p.returns) || TM.hasValue(p.payfee) || TM.hasValue(p.reffee);
    var feesKnown = fixedKnown || pctKnown;
    var costKnown = cogsKnown || shipKnown || otherKnown;
    var cogs = cogsKnown ? n0(p.cogs) : 0;
    var shipping = shipKnown ? n0(p.shipping) : 0;
    var other = otherKnown ? n0(p.other) : 0;
    var fixedFees = fixedKnown ? n0(p.fees) : 0;
    var productCost = cogs + shipping + other;

    /* Amazon is its own channel. Its price, fees, and units never replace the store's. */
    var amzPrice = TM.hasValue(p.amzAvgPrice) ? TM.parseNumber(p.amzAvgPrice) : (TM.hasValue(p.amzPrice) ? TM.parseNumber(p.amzPrice) : undefined);
    var amzFees = TM.hasValue(p.amzFees) ? TM.parseNumber(p.amzFees) : undefined;
    var amzUnits = TM.hasValue(p.amzUnits) ? TM.parseNumber(p.amzUnits) : undefined;
    var hasAmazon = amzPrice != null || amzFees != null || amzUnits != null;
    var amazonOnly = price == null && amzPrice != null;
    if (amazonOnly) {
      price = amzPrice;
      priceSource = 'Amazon price';
      fixedFees = amzFees || 0;
      fixedKnown = amzFees != null;
      feesKnown = fixedKnown || pctKnown;
    }

    var units;
    var unitsSource = 'none';
    if (amazonOnly && amzUnits != null) {
      units = amzUnits;
      unitsSource = 'Amazon';
    } else if (TM.hasValue(p.units)) {
      units = TM.parseNumber(p.units);
      unitsSource = 'sold';
    } else if (TM.hasValue(p.sales)) {
      units = TM.parseNumber(p.sales);
      unitsSource = 'conversions';
    }

    var spendKnown = TM.hasValue(p.spend);
    var spend = spendKnown ? n0(p.spend) : 0;

    var fig = channelFigures(price, productCost, fixedFees, pctShare, units, spend);
    var fees = fig.fees;
    var unitBeforeAds = price != null && (costKnown || feesKnown) ? fig.unitBeforeAds : NaN;

    var periodProfit = NaN;
    var profitPerUnit = NaN;
    if (isFinite(unitBeforeAds) && units != null) {
      periodProfit = unitBeforeAds * units - spend;
      profitPerUnit = units > 0 ? periodProfit / units : NaN;
    } else if (units === 0 && spend > 0) {
      periodProfit = -spend;
      profitPerUnit = NaN;
    } else if (isFinite(unitBeforeAds) && !spendKnown) {
      profitPerUnit = unitBeforeAds;
    }

    var amazon = null;
    if (hasAmazon && !amazonOnly && amzPrice != null && costKnown) {
      var aFees = amzFees || 0;
      var aUnit = amzPrice - productCost - aFees;
      amazon = {
        price: amzPrice,
        fees: aFees,
        units: amzUnits,
        unitProfit: aUnit,
        periodProfit: amzUnits != null ? aUnit * amzUnits : NaN,
        feeShare: amzPrice > 0 ? aFees / amzPrice : 0
      };
    }

    var feeShare = price > 0 && feesKnown ? fees / price : 0;
    var action = 'healthy';
    var reason = 'Covers product cost' + (feesKnown ? ', fees,' : '') + ' and ad spend for this period.';
    var suggest = '';

    var losingPeriod = isFinite(periodProfit) && periodProfit < -0.005;
    var losingUnit = isFinite(unitBeforeAds) && unitBeforeAds < -0.005;
    var incomplete = price == null || (!costKnown && !feesKnown && !(units === 0 && spend > 0));
    var issues = TM.dataIssues ? TM.dataIssues(p) : [];

    if (issues.length) {
      action = 'check_data';
      reason = 'Check data: ' + issues.join('; ') + '. Fix the value before acting on this row.';
    } else if (incomplete && !(units === 0 && spend > 0)) {
      action = 'need_data';
      if (price == null) reason = 'No price yet. Import a Shopify product export or type a price.';
      else reason = 'No unit cost yet. Add Cost per item in Shopify, or drop a cost sheet.';
    } else if (units === 0 && spend > 0 && !losingUnit) {
      action = 'cut_ads';
      reason = 'Ad spend is ' + TM.fmtMoney(spend) + ' and units sold are 0. Exclude it or cut the bid. The spend is the leak' +
        (costKnown ? '' : ' (unit cost is not on file, so this only counts ads)') + '.';
    } else if (!incomplete && losingUnit && feeShare >= 0.35) {
      action = 'review_fees';
      reason = 'Fees are ' + Math.round(feeShare * 100) + '% of price and the SKU loses money before ads. Check the size tier, the referral category, or discounts.';
    } else if (!incomplete && losingUnit) {
      var scale = fixedKnown && amazonOnly;
      var raised = priceToFix(price, productCost, fixedFees, pctShare, scale);
      var up25 = price * 1.25;
      var profitAt25 = up25 - productCost - feesAt(price, fixedFees, pctShare, up25, scale);
      if (profitAt25 <= 0.005) {
        action = 'stop_selling';
        reason = 'A 25% price increase still would not clear product cost' + (feesKnown ? ' and fees' : '') + '. Consider dropping the SKU.';
      } else {
        action = 'raise_price';
        var pct = price > 0 ? Math.max(0, (raised.price - price) / price * 100) : 0;
        suggest = TM.fmtMoney(raised.price);
        reason = (feesKnown ? 'Product cost and fees (' + TM.fmtMoney(productCost + fees) + ')' : 'Product cost (' + TM.fmtMoney(productCost) + ')') +
          ' is over the ' + TM.fmtMoney(price) + ' price. About ' +
          TM.fmtMoney(raised.price) + ' (' + pct.toFixed(0) + '% higher) would leave roughly a 15% margin before ads.';
      }
    } else if (losingPeriod && isFinite(unitBeforeAds) && unitBeforeAds > 0) {
      action = 'cut_ads';
      reason = 'Profit before ads is ' + TM.fmtMoney(unitBeforeAds) + ' per unit, but ad spend of ' +
        TM.fmtMoney(spend) + ' makes the period negative. Lower the bid or pull it out of Shopping / Performance Max.';
    } else if (losingPeriod) {
      action = 'cut_ads';
      reason = 'This SKU loses ' + TM.fmtMoney(Math.abs(periodProfit)) + ' over the period after cost and ads.';
    } else if (!isFinite(periodProfit) && isFinite(unitBeforeAds) && unitBeforeAds >= 0) {
      action = 'healthy';
      reason = 'Unit margin is positive. Add units sold (a Shopify orders export) to include ad spend in the total.';
    }

    var combinedPeriod = periodProfit;
    if (amazon && action !== 'check_data') {
      if (isFinite(amazon.periodProfit)) combinedPeriod = (isFinite(periodProfit) ? periodProfit : 0) + amazon.periodProfit;
      if (amazon.unitProfit < -0.005) {
        var amzLine = 'On Amazon, fees are ' + Math.round(amazon.feeShare * 100) + '% of the ' + TM.fmtMoney(amazon.price) +
          ' price and each unit loses ' + TM.fmtMoney(Math.abs(amazon.unitProfit)) + '.';
        if (action === 'healthy' || action === 'need_data') {
          action = 'review_fees';
          reason = amzLine + ' Your own store covers its costs. Check the Amazon size tier and referral category, or raise the Amazon price.';
        } else {
          reason += ' ' + amzLine;
        }
      }
    }

    var annual = action !== 'check_data' && isFinite(combinedPeriod) && combinedPeriod < 0 ? (-combinedPeriod) * factor : 0;

    return {
      price: price,
      priceSource: priceSource,
      productCost: costKnown ? productCost : NaN,
      fees: feesKnown ? fees : NaN,
      feesKnown: feesKnown,
      costKnown: costKnown,
      unitBeforeAds: unitBeforeAds,
      units: units == null ? NaN : units,
      unitsSource: unitsSource,
      spend: spendKnown ? spend : NaN,
      periodProfit: combinedPeriod,
      storePeriodProfit: periodProfit,
      profitPerUnit: profitPerUnit,
      amazon: amazon,
      amazonOnly: amazonOnly,
      issues: issues,
      action: action,
      reason: reason,
      suggestPrice: suggest,
      annualLeak: annual
    };
  }

  /* Amazon-style fixed fees that are mostly a referral percentage scale with price. */
  function feesAt(price, fixedFees, pctShare, newPrice, scale) {
    var fixed = fixedFees;
    if (scale && price > 0) {
      var share = fixedFees / price;
      if (share >= 0.08 && share <= 0.3) fixed = fixedFees * (newPrice / price);
    }
    return fixed + newPrice * pctShare;
  }

  function priceToFix(price, productCost, fixedFees, pctShare, scale) {
    var share = pctShare;
    var fixed = fixedFees;
    if (scale && price > 0) {
      var s = fixedFees / price;
      if (s >= 0.08 && s <= 0.3) { share += s; fixed = 0; }
    }
    var denom = 0.85 - share;
    var target = denom > 0.05 ? (productCost + fixed) / denom : (productCost + fixed + price * share) / 0.85;
    if (!isFinite(target) || target < 0) target = price;
    return { price: target };
  }

  /* One-off math for a single product or service, from typed numbers. */
  function quickProfit(q) {
    function n(v) { return TM.hasValue(v) ? TM.parseNumber(v) : undefined; }
    var price = n(q.price);
    var cost = n(q.cost) || 0;
    var shipping = n(q.shipping) || 0;
    var feePct = n(q.feePct) || 0;
    var feeFixed = n(q.feeFixed) || 0;
    var adValue = n(q.adValue) || 0;
    var units = n(q.units);
    var target = n(q.targetMargin);
    var perSale = q.adMode !== 'monthly';
    if (price == null) return { ok: false, error: 'Enter a price.' };
    var p = { price: price, cogs: cost, shipping: shipping, fees: feeFixed, payfee: feePct };
    if (units != null) p.units = units;
    if (!perSale) p.spend = adValue;
    else if (units != null) p.spend = adValue * units;
    var issues = TM.dataIssues(p);
    if (issues.length) return { ok: false, error: 'Check data: ' + issues.join('; ') + '.' };
    var leak = leakFor(p, 12);
    var bid = TM.computeProduct({ price: price, cogs: cost, shipping: shipping, fees: feeFixed, payfee: feePct }, 0);
    var adPerUnit = perSale ? adValue : (units > 0 ? adValue / units : NaN);
    var profitPerUnit = perSale ? leak.unitBeforeAds - adValue : leak.profitPerUnit;
    var monthly = perSale ? (units != null ? profitPerUnit * units : NaN) : leak.periodProfit;
    var share = feePct / 100;
    var fixed = cost + shipping + feeFixed + (isFinite(adPerUnit) ? adPerUnit : 0);
    var breakEven = share < 1 ? fixed / (1 - share) : NaN;
    var targetPrice = NaN;
    if (target != null) {
      var denom = 1 - share - target / 100;
      targetPrice = denom > 0 ? fixed / denom : NaN;
    }
    return {
      ok: true,
      profitPerUnit: profitPerUnit,
      marginAfterAds: price > 0 ? profitPerUnit / price : NaN,
      marginBeforeAds: bid.effMarginFrac,
      breakEvenPrice: breakEven,
      targetPrice: targetPrice,
      targetReachable: target == null || isFinite(targetPrice),
      monthlyProfit: monthly,
      adPerUnit: adPerUnit,
      feesPerUnit: leak.fees
    };
  }

  var ACTION_LABEL = {
    healthy: 'Healthy',
    cut_ads: 'Cut ads',
    raise_price: 'Raise price',
    stop_selling: 'Stop selling',
    review_fees: 'Review fees',
    need_data: 'Need cost',
    check_data: 'Check data'
  };

  TM.periodInfo = periodInfo;
  TM.leakFor = leakFor;
  TM.quickProfit = quickProfit;
  TM.ACTION_LABEL = ACTION_LABEL;
})(typeof window !== 'undefined' ? window : globalThis);
