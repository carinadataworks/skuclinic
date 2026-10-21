/* Payload checks for signup and feedback. Run: node tests/forms.test.js */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var root = path.join(__dirname, '..');
var context = { console: console, URLSearchParams: URLSearchParams };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/forms.js'), 'utf8'), context, { filename: 'js/forms.js' });
var TM = context.TM;

function same(actual, expected) {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);
}

var failed = 0;
var pending = [];
function check(name, fn) {
  pending.push(Promise.resolve().then(fn).then(function () {
    console.log('ok  ' + name);
  }, function (err) {
    failed++;
    console.error('FAIL ' + name);
    console.error(err.stack || err);
  }));
}

var catalog = {
  email: 'buyer@shop.example',
  wouldPay: 'Maybe',
  storeSize: '$10K-$50K',
  worth: 'A clearer Google export',
  plan: 'Pro monthly',
  honey: '',
  products: [{ sku: 'SECRET-SKU', price: 28, spend: 90, cogs: 8 }],
  sku: 'SECRET-SKU',
  results: [{ action: 'cut_ads', annual: 1200 }],
  rows: 'Camp mug',
  upc: 'SECRET-SKU',
  spend: 700,
  clicks: 400,
  _honey: 'filled by a bot field name'
};

check('signup payload is only typed answers', function () {
  var body = TM.signupPayload(catalog);
  same(body, {
    email: 'buyer@shop.example',
    _subject: 'SkuClinic signup',
    _honey: '',
    _captcha: 'false',
    _template: 'table',
    _replyto: 'buyer@shop.example',
    'Would you pay $15/mo for this?': 'Maybe',
    'Store size': '$10K-$50K',
    'What would make this worth paying for?': 'A clearer Google export',
    Plan: 'Pro monthly'
  });
  var raw = JSON.stringify(body);
  assert.strictEqual(raw.indexOf('SECRET'), -1);
  assert.strictEqual(raw.indexOf('cut_ads'), -1);
  assert.strictEqual(raw.indexOf('Camp mug'), -1);
  assert.strictEqual(body._honey, '');
});

check('signup drops blank optionals and unknown answers', function () {
  var body = TM.signupPayload({
    email: '  a@b.co ',
    wouldPay: 'Absolutely',
    storeSize: 'huge',
    worth: '   ',
    plan: '<script>',
    products: [{ sku: 'NOPE' }]
  });
  assert.deepStrictEqual(Object.keys(body).sort(), ['_captcha', '_honey', '_replyto', '_subject', '_template', 'email']);
  assert.strictEqual(body._captcha, 'false');
  assert.strictEqual(body._template, 'table');
  assert.strictEqual(body._replyto, 'a@b.co');
  assert.strictEqual(body.email, 'a@b.co');
  assert.strictEqual(JSON.stringify(body).indexOf('NOPE'), -1);
  assert.strictEqual(JSON.stringify(body).indexOf('script'), -1);
});

check('feedback payload excludes files and results', function () {
  var body = TM.feedbackPayload({
    message: ' The buffer note is easy to miss. ',
    wouldPay: 'No',
    email: 'me@shop.example',
    honey: '',
    products: [{ sku: 'LEAK-SKU', net: -40 }],
    results: 'annual leak $9,999',
    rows: [{ name: 'Desk lamp' }],
    spend: 180,
    price: 14
  });
  same(body, {
    _subject: 'SkuClinic feedback',
    _honey: '',
    _captcha: 'false',
    _template: 'table',
    _replyto: 'me@shop.example',
    "What's missing or confusing?": 'The buffer note is easy to miss.',
    'Would you pay $15/mo?': 'No',
    email: 'me@shop.example'
  });
  var raw = JSON.stringify(body);
  assert.strictEqual(raw.indexOf('LEAK-SKU'), -1);
  assert.strictEqual(raw.indexOf('9,999'), -1);
  assert.strictEqual(raw.indexOf('Desk lamp'), -1);
});

check('feedback omits a blank email', function () {
  var body = TM.feedbackPayload({ message: 'Confusing columns', wouldPay: 'Yes', email: '  ' });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'email'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(body, '_replyto'), false);
  assert.strictEqual(body['Would you pay $15/mo?'], 'Yes');
  assert.strictEqual(body._captcha, 'false');
  assert.strictEqual(body._template, 'table');
});

check('configured endpoint receives signup fields', function () {
  var config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
  var match = config.match(/var SIGNUP_FORM_ENDPOINT = '([^']*)'/);
  assert.ok(match);
  assert.strictEqual(match[1], 'https://formsubmit.co/ajax/skuclinicapp@gmail.com');
  var seen = null;
  return TM.submitSignup(match[1], {
    email: 'buyer@shop.example',
    wouldPay: 'Yes',
    storeSize: '$50K-$200K',
    worth: 'Clearer fixes',
    plan: 'Pro monthly',
    products: [{ sku: 'SECRET-SKU' }]
  }, function (url, options) {
    seen = { url: url, options: options };
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ success: 'true' }); } });
  }).then(function (result) {
    assert.strictEqual(result.ok, true);
    assert.strictEqual(seen.url, 'https://formsubmit.co/ajax/skuclinicapp@gmail.com');
    var sent = JSON.parse(seen.options.body);
    assert.strictEqual(sent._subject, 'SkuClinic signup');
    assert.strictEqual(sent._captcha, 'false');
    assert.strictEqual(sent._template, 'table');
    assert.strictEqual(sent.email, 'buyer@shop.example');
    assert.strictEqual(sent['Would you pay $15/mo for this?'], 'Yes');
    assert.strictEqual(sent['Store size'], '$50K-$200K');
    assert.strictEqual(sent['What would make this worth paying for?'], 'Clearer fixes');
    assert.strictEqual(sent.Plan, 'Pro monthly');
    assert.strictEqual(JSON.stringify(sent).indexOf('SECRET'), -1);
  });
});

check('empty endpoint does not post', function () {
  assert.strictEqual(TM.hasSignupEndpoint(''), false);
  assert.strictEqual(TM.hasSignupEndpoint('   '), false);
  assert.strictEqual(TM.hasSignupEndpoint(null), false);
  same(TM.preparePost('', { email: 'a@b.co', sku: 'NO' }), { skip: true });
  same(TM.preparePost('  ', TM.signupPayload(catalog)), { skip: true });
  var calls = 0;
  var signup = TM.submitSignup('', catalog, function () { calls++; });
  var feedback = TM.submitFeedback('   ', { message: 'Hi', products: [{ sku: 'NO' }] }, function () { calls++; });
  assert.strictEqual(calls, 0);
  return Promise.all([signup, feedback]).then(function (results) {
    assert.strictEqual(results[0].skipped, true);
    assert.strictEqual(results[0].reason, 'empty');
    assert.strictEqual(results[1].reason, 'empty');
    assert.strictEqual(calls, 0);
  });
});

check('a filled honeypot does not post', function () {
  var calls = 0;
  return TM.submitSignup('https://formsubmit.co/ajax/owner', {
    email: 'a@b.co',
    wouldPay: 'Yes',
    honey: 'bot',
    products: [{ sku: 'SECRET-SKU' }]
  }, function () { calls++; }).then(function (result) {
    assert.strictEqual(calls, 0);
    assert.strictEqual(result.reason, 'honey');
  });
});

check('a ready endpoint posts only the built payload', function () {
  var seen = null;
  return TM.submitFeedback('https://formsubmit.co/ajax/abc123', {
    message: 'Need a sample for Performance Max',
    wouldPay: 'Maybe',
    email: 'a@b.co',
    products: [{ sku: 'SECRET-SKU', spend: 10 }],
    results: 'do not send'
  }, function (url, options) {
    seen = { url: url, options: options };
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function () { return Promise.resolve({ success: 'true' }); }
    });
  }).then(function (result) {
    assert.strictEqual(result.ok, true);
    assert.strictEqual(seen.url, 'https://formsubmit.co/ajax/abc123');
    assert.strictEqual(seen.options.method, 'POST');
    assert.strictEqual(seen.options.headers['Content-Type'], 'application/json');
    var sent = JSON.parse(seen.options.body);
    assert.strictEqual(sent._subject, 'SkuClinic feedback');
    assert.strictEqual(sent._captcha, 'false');
    assert.strictEqual(sent._template, 'table');
    assert.strictEqual(sent._replyto, 'a@b.co');
    assert.strictEqual(sent._honey, '');
    assert.strictEqual(JSON.stringify(sent).indexOf('SECRET'), -1);
    assert.strictEqual(JSON.stringify(sent).indexOf('do not send'), -1);
    assert.deepStrictEqual(Object.keys(sent).sort(), [
      "What's missing or confusing?",
      'Would you pay $15/mo?',
      '_captcha',
      '_honey',
      '_replyto',
      '_subject',
      '_template',
      'email'
    ]);
  });
});

check('config: SIGNUP_SCRIPT_URL exists and is empty, so FormSubmit stays in use', function () {
  var config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
  var match = config.match(/var SIGNUP_SCRIPT_URL = '([^']*)'/);
  assert.ok(match);
  assert.strictEqual(match[1], '');
  same(TM.formTarget(match[1], 'https://formsubmit.co/ajax/skuclinicapp@gmail.com'), { url: 'https://formsubmit.co/ajax/skuclinicapp@gmail.com', mode: 'formsubmit' });
  same(TM.formTarget(' https://script.google.com/macros/s/X/exec ', 'https://formsubmit.co/ajax/x'), { url: 'https://script.google.com/macros/s/X/exec', mode: 'script' });
  assert.strictEqual(TM.hasSignupEndpoint(TM.formTarget('', '')), false);
});

check('script URL set: signup POSTs plain fields with no-cors, resolved fetch = success', function () {
  var seen = null;
  var target = TM.formTarget('https://script.google.com/macros/s/X/exec', 'https://formsubmit.co/ajax/x');
  return TM.submitSignup(target, {
    email: 'buyer@shop.example', wouldPay: 'Yes', storeSize: '$50K-$200K', worth: 'Clearer fixes', plan: 'Pro monthly',
    products: [{ sku: 'SECRET-SKU' }]
  }, function (url, options) {
    seen = { url: url, options: options };
    return Promise.resolve({ type: 'opaque', ok: false, status: 0 });
  }).then(function (result) {
    assert.strictEqual(result.ok, true);
    assert.strictEqual(seen.url, 'https://script.google.com/macros/s/X/exec');
    assert.strictEqual(seen.options.method, 'POST');
    assert.strictEqual(seen.options.mode, 'no-cors');
    assert.strictEqual(seen.options.headers, undefined);
    same(Object.fromEntries(seen.options.body), {
      form: 'signup', app: 'SkuClinic', email: 'buyer@shop.example',
      'Would you pay $15/mo for this?': 'Yes', 'Store size': '$50K-$200K',
      'What would make this worth paying for?': 'Clearer fixes', Plan: 'Pro monthly', _gotcha: ''
    });
  });
});

check('script URL set: feedback goes there too; a network error is a failure; honeypot still blocks', function () {
  var target = TM.formTarget('https://script.google.com/macros/s/X/exec', '');
  var body = null, calls = 0;
  return TM.submitFeedback(target, { message: 'Hi', wouldPay: 'No', email: 'a@b.co' }, function (url, options) {
    body = Object.fromEntries(options.body);
    return Promise.reject(new TypeError('Failed to fetch'));
  }).then(function (result) {
    assert.strictEqual(result.ok, false);
    assert.strictEqual(body.form, 'feedback');
    assert.strictEqual(body.email, 'a@b.co');
    return TM.submitSignup(target, { email: 'a@b.co', honey: 'bot' }, function () { calls++; });
  }).then(function (result) {
    assert.strictEqual(calls, 0);
    assert.strictEqual(result.reason, 'honey');
  });
});

Promise.all(pending).then(function () {
  if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log('form checks passed');
});
