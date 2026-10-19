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

  function leakFor(p, factor) {
    var listPrice = TM.hasValue(p.price) ? TM.parseNumber(p.price) : undefined;
    var avgPrice = TM.hasValue(p.avgPrice) ? TM.parseNumber(p.avgPrice) : undefined;
    var price = avgPrice != null ? avgPrice : listPrice;
    var priceSource = avgPrice != null ? 'average selling price' : 'list price';

    var cogsKnown = TM.hasValue(p.cogs);
    var shipKnown = TM.hasValue(p.shipping);
    var otherKnown = TM.hasValue(p.other);
    var feesKnown = TM.hasValue(p.fees);
    var costKnown = cogsKnown || shipKnown || otherKnown;
    var cogs = cogsKnown ? n0(p.cogs) : 0;
    var shipping = shipKnown ? n0(p.shipping) : 0;
    var other = otherKnown ? n0(p.other) : 0;
    var fees = feesKnown ? n0(p.fees) : 0;
    var productCost = cogs + shipping + other;
    var unitBeforeAds = price != null && (costKnown || feesKnown) ? price - productCost - fees : NaN;

    var units;
    var unitsSource = 'none';
    if (TM.hasValue(p.units)) {
      units = TM.parseNumber(p.units);
      unitsSource = 'sold';
    } else if (TM.hasValue(p.sales)) {
      units = TM.parseNumber(p.sales);
      unitsSource = 'conversions';
    }

    var spendKnown = TM.hasValue(p.spend);
    var spend = spendKnown ? n0(p.spend) : 0;

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

    var feeShare = price > 0 && feesKnown ? fees / price : 0;
    var action = 'healthy';
    var reason = 'Covers product cost' + (feesKnown ? ', fees,' : '') + ' and ad spend for this period.';
    var suggest = '';

    var losingPeriod = isFinite(periodProfit) && periodProfit < -0.005;
    var losingUnit = isFinite(unitBeforeAds) && unitBeforeAds < -0.005;
    var incomplete = price == null || (!costKnown && !feesKnown && !(units === 0 && spend > 0));

    if (incomplete && !(units === 0 && spend > 0)) {
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
      var raised = priceToFix(price, productCost, fees, feesKnown);
      var up25 = price * 1.25;
      var feesAt25 = feesKnown ? scaledFees(price, fees, up25) : 0;
      var profitAt25 = up25 - productCost - feesAt25;
      if (profitAt25 <= 0.005) {
        action = 'stop_selling';
        reason = 'A 25% price increase still would not clear product cost' + (feesKnown ? ' and fees' : '') + '. Consider dropping the SKU.';
      } else {
        action = 'raise_price';
        var pct = price > 0 ? Math.max(0, (raised.price - price) / price * 100) : 0;
        suggest = TM.fmtMoney(raised.price);
        reason = 'Price does not cover cost' + (feesKnown ? ' and fees' : '') + '. About ' +
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

    var annual = isFinite(periodProfit) && periodProfit < 0 ? (-periodProfit) * factor : 0;

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
      periodProfit: periodProfit,
      profitPerUnit: profitPerUnit,
      action: action,
      reason: reason,
      suggestPrice: suggest,
      annualLeak: annual
    };
  }

  function scaledFees(price, fees, newPrice) {
    if (!(price > 0)) return fees;
    var share = fees / price;
    if (share >= 0.08 && share <= 0.3) return fees * (newPrice / price);
    return fees;
  }

  function priceToFix(price, productCost, fees, feesKnown) {
    var share = price > 0 && feesKnown ? fees / price : 0;
    var target;
    if (feesKnown && share >= 0.08 && share <= 0.3) {
      var denom = 0.85 - share;
      target = denom > 0.05 ? productCost / denom : (productCost + fees) / 0.85;
    } else {
      target = (productCost + (feesKnown ? fees : 0)) / 0.85;
    }
    if (!isFinite(target) || target < 0) target = price;
    return { price: target };
  }

  var ACTION_LABEL = {
    healthy: 'Healthy',
    cut_ads: 'Cut ads',
    raise_price: 'Raise price',
    stop_selling: 'Stop selling',
    review_fees: 'Review fees',
    need_data: 'Need cost'
  };

  TM.periodInfo = periodInfo;
  TM.leakFor = leakFor;
  TM.ACTION_LABEL = ACTION_LABEL;
})(typeof window !== 'undefined' ? window : globalThis);
