(function () {
  var monthly = document.getElementById('billMonthly');
  var annual = document.getElementById('billAnnual');
  var price = document.getElementById('proPrice');
  var note = document.getElementById('proNote');
  var cta = document.getElementById('proCta');
  var agency = document.getElementById('agencyCta');
  var mode = 'month';

  function paintLink(el, url, label) {
    var href = String(url || '').trim();
    el.textContent = href ? label : 'Coming soon';
    el.classList.toggle('is-disabled', !href);
    el.dataset.href = href;
    if (href) el.removeAttribute('aria-disabled');
    else el.setAttribute('aria-disabled', 'true');
  }

  function paint() {
    if (mode === 'year') {
      price.textContent = '$290';
      note.textContent = 'per year · 2 months free';
      paintLink(cta, window.STRIPE_PRO_YEARLY_LINK, 'Start Pro yearly');
    } else {
      price.textContent = '$29';
      note.textContent = 'per month';
      paintLink(cta, window.STRIPE_PRO_MONTHLY_LINK, 'Start Pro');
    }
    monthly.classList.toggle('on', mode === 'month');
    annual.classList.toggle('on', mode === 'year');
    monthly.setAttribute('aria-pressed', mode === 'month' ? 'true' : 'false');
    annual.setAttribute('aria-pressed', mode === 'year' ? 'true' : 'false');
  }

  function openLink(event) {
    var href = event.currentTarget.dataset.href;
    if (!href) {
      event.preventDefault();
      return;
    }
    window.open(href, '_blank', 'noopener');
  }

  monthly.addEventListener('click', function () { mode = 'month'; paint(); });
  annual.addEventListener('click', function () { mode = 'year'; paint(); });
  cta.addEventListener('click', openLink);
  agency.addEventListener('click', openLink);
  paintLink(agency, window.STRIPE_AGENCY_LINK, 'Start Agency');
  paint();

  /* TODO: wire this form to a real list. Do not store the address until then. */
  document.getElementById('signupForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var email = document.getElementById('email');
    var msg = document.getElementById('signupMsg');
    if (!email.value || email.value.indexOf('@') < 1) {
      msg.textContent = 'Enter an email address. Nothing is stored.';
    } else {
      msg.textContent = 'Thanks. Email signup opens soon. Nothing is stored yet.';
      email.value = '';
    }
    msg.hidden = false;
  });
})();
