/* SkuClinic plans and prices: the one place the landing page and the app read them from.
   Planned pricing, not billed yet. Keep the HTML copy (pricing cards, FAQ, terms, help) in step;
   tests/pricing.test.js fails if any page shows a price that is not listed here. */
(function (root) {
  var TM = root.TM = root.TM || {};
  TM.FREE_SKU_CAP = 25;
  TM.MULTI_STORE_CAP = 5;
  TM.FOUNDING = { percentOff: 40, seats: 200, text: 'Founding members: 40% off for life on Pro and Multichannel while the subscription stays active. First 200 paid accounts.' };
  // key: value in ?plan= links. label: value sent as "Plan" with the signup form. short: button text after "Join founding list: ".
  TM.PLAN_OPTIONS = [
    { key: 'audit', plan: 'audit', label: 'Audit Pass', short: 'Audit $29 one-time', checkout: 'Buy Audit Pass · $29', price: '$29', per: 'one-time, 30 days of Pro', link: 'STRIPE_AUDIT_LINK' },
    { key: 'pro-monthly', plan: 'pro', label: 'Pro monthly', short: 'Pro $15/mo', checkout: 'Start Pro · $15/mo', price: '$15', per: 'per month', link: 'STRIPE_PRO_MONTHLY_LINK' },
    { key: 'pro-yearly', plan: 'pro', label: 'Pro yearly', short: 'Pro $120/yr', checkout: 'Start Pro · $120/yr', price: '$120', per: 'per year ($10/mo)', link: 'STRIPE_PRO_YEARLY_LINK' },
    { key: 'multichannel-monthly', plan: 'multichannel', label: 'Multichannel monthly', short: 'Multichannel $29/mo', checkout: 'Start Multichannel · $29/mo', price: '$29', per: 'per month', link: 'STRIPE_MULTI_MONTHLY_LINK' },
    { key: 'multichannel-yearly', plan: 'multichannel', label: 'Multichannel yearly', short: 'Multichannel $240/yr', checkout: 'Start Multichannel · $240/yr', price: '$240', per: 'per year ($20/mo)', link: 'STRIPE_MULTI_YEARLY_LINK' }
  ];
  TM.planOption = function (key) {
    for (var i = 0; i < TM.PLAN_OPTIONS.length; i++) if (TM.PLAN_OPTIONS[i].key === key) return TM.PLAN_OPTIONS[i];
    return null;
  };
  TM.planLink = function (option) { return String((option && root[option.link]) || '').trim(); };
  TM.foundingButtonText = function (option) { return 'Join founding list: ' + option.short; };
})(typeof window !== 'undefined' ? window : this);
