(function () {
  var monthly = document.getElementById('billMonthly');
  var annual = document.getElementById('billAnnual');
  var mode = 'month';
  // Cards that follow the Monthly / Annual toggle: [price el, note el, button, monthly key, yearly key]
  var CARDS = [
    ['proPrice', 'proNote', 'proCta', 'pro-monthly', 'pro-yearly'],
    ['multiPrice', 'multiNote', 'multiCta', 'multichannel-monthly', 'multichannel-yearly']
  ];
  var audit = document.getElementById('auditCta');

  function paintLink(el, key) {
    var option = TM.planOption(key);
    var href = TM.planLink(option);
    el.textContent = href ? option.checkout : TM.foundingButtonText(option);
    el.classList.remove('is-disabled');
    el.removeAttribute('aria-disabled');
    el.dataset.href = href;
    el.dataset.plan = key;
  }

  function paint() {
    CARDS.forEach(function (c) {
      var option = TM.planOption(mode === 'year' ? c[4] : c[3]);
      document.getElementById(c[0]).textContent = option.price;
      document.getElementById(c[1]).textContent = option.per;
      paintLink(document.getElementById(c[2]), option.key);
    });
    monthly.classList.toggle('on', mode === 'month');
    annual.classList.toggle('on', mode === 'year');
    monthly.setAttribute('aria-pressed', mode === 'month' ? 'true' : 'false');
    annual.setAttribute('aria-pressed', mode === 'year' ? 'true' : 'false');
  }

  function prefillPlan(key) {
    var option = TM.planOption(key);
    if (!option) return;
    document.getElementById('planChoice').value = option.label;
    var line = document.getElementById('planLine');
    line.hidden = false;
    line.textContent = 'Joining for ' + option.label + '.';
    document.getElementById('signup').scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('email').focus();
  }

  function onPlanClick(event) {
    var href = event.currentTarget.dataset.href;
    if (href) {
      window.open(href, '_blank', 'noopener');
      return;
    }
    prefillPlan(event.currentTarget.dataset.plan);
  }

  function setMsg(text, bad) {
    var msg = document.getElementById('signupMsg');
    msg.hidden = false;
    msg.textContent = text;
    msg.className = bad ? 'msg-bad' : 'msg-ok';
  }

  function selectedPay() {
    var chosen = document.querySelector('input[name="wouldPay"]:checked');
    return chosen ? chosen.value : '';
  }

  monthly.addEventListener('click', function () { mode = 'month'; paint(); });
  annual.addEventListener('click', function () { mode = 'year'; paint(); });
  CARDS.forEach(function (c) { document.getElementById(c[2]).addEventListener('click', onPlanClick); });
  audit.addEventListener('click', onPlanClick);
  paintLink(audit, 'audit');
  var billingReady = TM.PLAN_OPTIONS.every(function (option) { return TM.planLink(option); });
  document.getElementById('plannedLabel').hidden = billingReady;
  document.getElementById('foundingLine').textContent = TM.FOUNDING.text;
  paint();

  var target = TM.formTarget(window.SIGNUP_SCRIPT_URL, window.SIGNUP_FORM_ENDPOINT);
  document.getElementById('signupIdle').hidden = TM.hasSignupEndpoint(target);

  var initial = new URLSearchParams(window.location.search).get('plan');
  if (TM.planOption(initial)) prefillPlan(initial);

  document.getElementById('signupForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var email = document.getElementById('email');
    var address = email.value.trim();
    if (!address || address.indexOf('@') < 1) {
      setMsg('Enter an email address. Nothing is stored.', true);
      return;
    }
    if (!TM.hasSignupEndpoint(target)) {
      setMsg('Thanks. Email signup opens soon. Nothing is stored yet.', false);
      email.value = '';
      return;
    }
    var wouldPay = selectedPay();
    if (!wouldPay) {
      setMsg('Choose Yes, Maybe, or No.', true);
      return;
    }
    var button = document.getElementById('signupSubmit');
    button.disabled = true;
    TM.submitSignup(target, {
      email: address,
      wouldPay: wouldPay,
      storeSize: document.getElementById('storeSize').value,
      worth: document.getElementById('worth').value,
      plan: document.getElementById('planChoice').value,
      honey: document.getElementById('honey').value
    }).then(function (result) {
      button.disabled = false;
      if (result.skipped && result.reason === 'honey') {
        setMsg('Thanks. You’re on the list.', false);
        return;
      }
      if (result.ok) {
        setMsg('Thanks. You’re on the list. We only received what you typed.', false);
        document.getElementById('signupForm').reset();
        document.getElementById('planLine').hidden = true;
        return;
      }
      setMsg('That didn’t send. Nothing was stored. Try again in a moment.', true);
    });
  });
})();
