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
  var PLANS = { 'Pro monthly': true, 'Pro yearly': true, Agency: true };

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function endpoint(value) {
    return text(value);
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
    if (PAY[input.wouldPay]) body['Would you pay $29/mo for this?'] = input.wouldPay;
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
    if (PAY[input.wouldPay]) body['Would you pay $29/mo?'] = input.wouldPay;
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

  function postForm(target, payload, fetchImpl) {
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
    return postForm(target, signupPayload(input), fetchImpl);
  }

  function submitFeedback(target, input, fetchImpl) {
    input = input || {};
    if (!hasSignupEndpoint(target)) return Promise.resolve({ ok: false, skipped: true, reason: 'empty' });
    if (blockedByHoneypot(input.honey)) return Promise.resolve({ ok: false, skipped: true, reason: 'honey' });
    return postForm(target, feedbackPayload(input), fetchImpl);
  }

  TM.hasSignupEndpoint = hasSignupEndpoint;
  TM.blockedByHoneypot = blockedByHoneypot;
  TM.signupPayload = signupPayload;
  TM.feedbackPayload = feedbackPayload;
  TM.preparePost = preparePost;
  TM.postForm = postForm;
  TM.submitSignup = submitSignup;
  TM.submitFeedback = submitFeedback;
})(typeof window !== 'undefined' ? window : globalThis);
