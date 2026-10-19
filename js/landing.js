(function () {
  var monthly = document.getElementById('billMonthly');
  var annual = document.getElementById('billAnnual');
  var price = document.getElementById('proPrice');
  var note = document.getElementById('proNote');
  var cta = document.getElementById('proCta');
  var agency = document.getElementById('agencyCta');
  var mode = 'month';
  var PLAN_LABEL = { 'pro-monthly': 'Pro monthly', 'pro-yearly': 'Pro yearly', agency: 'Agency' };

  function paintLink(el, url, checkoutLabel, plan) {
    var href = String(url || '').trim();
    el.textContent = href ? checkoutLabel : 'Join the founding list';
    el.classList.remove('is-disabled');
    el.removeAttribute('aria-disabled');
    el.dataset.href = href;
    el.dataset.plan = plan;
  }

  function paint() {
    if (mode === 'year') {
      price.textContent = '$290';
      note.textContent = 'per year';
      paintLink(cta, window.STRIPE_PRO_YEARLY_LINK, 'Start Pro yearly', 'pro-yearly');
    } else {
      price.textContent = '$29';
      note.textContent = 'per month';
      paintLink(cta, window.STRIPE_PRO_MONTHLY_LINK, 'Start Pro', 'pro-monthly');
    }
    document.getElementById('proSoon').hidden = String(cta.dataset.href || '').length > 0;
    monthly.classList.toggle('on', mode === 'month');
    annual.classList.toggle('on', mode === 'year');
    monthly.setAttribute('aria-pressed', mode === 'month' ? 'true' : 'false');
    annual.setAttribute('aria-pressed', mode === 'year' ? 'true' : 'false');
  }

  function prefillPlan(plan) {
    var label = PLAN_LABEL[plan];
    if (!label) return;
    document.getElementById('planChoice').value = label;
    var line = document.getElementById('planLine');
    line.hidden = false;
    line.textContent = 'Joining for ' + label + '.';
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
  cta.addEventListener('click', onPlanClick);
  agency.addEventListener('click', onPlanClick);
  paintLink(agency, window.STRIPE_AGENCY_LINK, 'Start Agency', 'agency');
  document.getElementById('agencySoon').hidden = String(agency.dataset.href || '').length > 0;
  var billingReady = [window.STRIPE_PRO_MONTHLY_LINK, window.STRIPE_PRO_YEARLY_LINK, window.STRIPE_AGENCY_LINK].every(function (url) {
    return String(url || '').trim();
  });
  document.getElementById('plannedLabel').hidden = billingReady;
  paint();

  var endpoint = String(window.SIGNUP_FORM_ENDPOINT || '').trim();
  document.getElementById('signupIdle').hidden = endpoint.length > 0;

  var initial = new URLSearchParams(window.location.search).get('plan');
  if (PLAN_LABEL[initial]) prefillPlan(initial);

  document.getElementById('signupForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var email = document.getElementById('email');
    var address = email.value.trim();
    if (!address || address.indexOf('@') < 1) {
      setMsg('Enter an email address. Nothing is stored.', true);
      return;
    }
    if (!TM.hasSignupEndpoint(window.SIGNUP_FORM_ENDPOINT)) {
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
    TM.submitSignup(window.SIGNUP_FORM_ENDPOINT, {
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
