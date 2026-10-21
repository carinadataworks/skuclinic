/* Signup and feedback payloads. Only typed answers leave the browser. */
(function (root) {
  var TM = root.TM || (root.TM = {});

  var PAY = { Yes: true, Maybe: true, No: true };
  var SIZES = {
    'under $10K/mo': true,
    '$10K-$50K': true,
    '$50K-$200K': true,
    '$200K+': true
  };
  var PLANS = { 'Audit Pass': true, 'Pro monthly': true, 'Pro yearly': true, 'Multichannel monthly': true, 'Multichannel yearly': true };

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  /* A target is a FormSubmit URL string (as before) or the result of formTarget(). */
  function endpoint(value) {
    return text(value && typeof value === 'object' ? value.url : value);
  }

  /* SIGNUP_SCRIPT_URL (Google Apps Script web app) wins when set; otherwise FormSubmit as before. */
  function formTarget(scriptUrl, formSubmitUrl) {
    if (text(scriptUrl)) return { url: text(scriptUrl), mode: 'script' };
    return { url: text(formSubmitUrl), mode: 'formsubmit' };
  }

  /* Apps Script gets plain fields: FormSubmit's _options dropped, plus form, app and an empty honeypot. */
  function scriptFields(payload, form) {
    var fields = { form: form, app: 'SkuClinic' };
    Object.keys(payload).forEach(function (key) {
      if (key.charAt(0) !== '_') fields[key] = payload[key];
    });
    fields._gotcha = '';
    return fields;
  }

  /* no-cors gives an opaque response: a resolved fetch counts as sent, a network error as failed. */
  function postScript(url, fields, fetchImpl) {
    var fetchFn = fetchImpl || root.fetch;
    return Promise.resolve().then(function () {
      return fetchFn(url, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(fields) });
    }).then(function () {
      return { ok: true, skipped: false };
    }, function () {
      return { ok: false, skipped: false };
    });
  }

  function hasSignupEndpoint(value) {
    return endpoint(value).length > 0;
  }

  function blockedByHoneypot(value) {
    return text(value).length > 0;
  }

  function signupPayload(input) {
    input = input || {};
    var email = text(input.email);
    var body = {
      email: email,
      _subject: 'SkuClinic signup',
      _honey: '',
      _captcha: 'false',
      _template: 'table'
    };
    if (email) body._replyto = email;
    if (PAY[input.wouldPay]) body['Would you pay $15/mo for this?'] = input.wouldPay;
    if (SIZES[input.storeSize]) body['Store size'] = input.storeSize;
    var worth = text(input.worth);
    if (worth) body['What would make this worth paying for?'] = worth;
    if (PLANS[input.plan]) body.Plan = input.plan;
    return body;
  }

  function feedbackPayload(input) {
    input = input || {};
    var body = {
      _subject: 'SkuClinic feedback',
      _honey: '',
      _captcha: 'false',
      _template: 'table'
    };
    var message = text(input.message);
    if (message) body["What's missing or confusing?"] = message;
    if (PAY[input.wouldPay]) body['Would you pay $15/mo?'] = input.wouldPay;
    var email = text(input.email);
    if (email) {
      body.email = email;
      body._replyto = email;
    }
    return body;
  }

  function preparePost(target, payload) {
    var url = endpoint(target);
    if (!url) return { skip: true };
    return {
      skip: false,
      url: url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    };
  }

  function postForm(target, payload, fetchImpl, form) {
    if (target && target.mode === 'script') {
      if (!hasSignupEndpoint(target)) return Promise.resolve({ ok: false, skipped: true });
      return postScript(endpoint(target), scriptFields(payload, form || 'signup'), fetchImpl);
    }
    var prepared = preparePost(target, payload);
    if (prepared.skip) return Promise.resolve({ ok: false, skipped: true });
    var fetchFn = fetchImpl || root.fetch;
    return Promise.resolve().then(function () {
      return fetchFn(prepared.url, {
        method: prepared.method,
        headers: prepared.headers,
        body: prepared.body
      });
    }).then(function (res) {
      if (!res || !res.ok) return { ok: false, skipped: false, status: res && res.status };
      var read = res.json ? res.json() : Promise.resolve({});
      return Promise.resolve(read).catch(function () { return {}; }).then(function (data) {
        if (data && String(data.success) === 'false') return { ok: false, skipped: false, status: res.status };
        return { ok: true, skipped: false, status: res.status };
      });
    }).catch(function () {
      return { ok: false, skipped: false };
    });
  }

  function submitSignup(target, input, fetchImpl) {
    input = input || {};
    if (!hasSignupEndpoint(target)) return Promise.resolve({ ok: false, skipped: true, reason: 'empty' });
    if (blockedByHoneypot(input.honey)) return Promise.resolve({ ok: false, skipped: true, reason: 'honey' });
    return postForm(target, signupPayload(input), fetchImpl, 'signup');
  }

  function submitFeedback(target, input, fetchImpl) {
    input = input || {};
    if (!hasSignupEndpoint(target)) return Promise.resolve({ ok: false, skipped: true, reason: 'empty' });
    if (blockedByHoneypot(input.honey)) return Promise.resolve({ ok: false, skipped: true, reason: 'honey' });
    return postForm(target, feedbackPayload(input), fetchImpl, 'feedback');
  }

  TM.formTarget = formTarget;
  TM.scriptFields = scriptFields;
  TM.postScript = postScript;
  TM.hasSignupEndpoint = hasSignupEndpoint;
  TM.blockedByHoneypot = blockedByHoneypot;
  TM.signupPayload = signupPayload;
  TM.feedbackPayload = feedbackPayload;
  TM.preparePost = preparePost;
  TM.postForm = postForm;
  TM.submitSignup = submitSignup;
  TM.submitFeedback = submitFeedback;
})(typeof window !== 'undefined' ? window : globalThis);
