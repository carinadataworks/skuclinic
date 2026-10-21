/* Pricing consistency. Run: node tests/pricing.test.js
   Fails if an old price or plan name is left anywhere a visitor or the signup form can see it. */
var fs = require('fs'); var path = require('path'); var vm = require('vm'); var assert = require('assert');
var root = path.join(__dirname, '..');
var ctx = { console: console }; ctx.window = ctx; vm.createContext(ctx);
['js/plans.js', 'js/forms.js'].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }); });
var TM = ctx.TM; var failed = 0;
function check(name, fn) { try { fn(); console.log('ok  ' + name); } catch (e) { failed++; console.error('FAIL ' + name + '\n' + e.message); } }
var FILES = ['index.html', 'app/index.html', 'guide.html', 'terms.html', 'privacy.html', 'README.md', 'config.js', 'js/app.js', 'js/landing.js', 'js/forms.js', 'js/plans.js'];
var text = {}; FILES.forEach(function (f) { text[f] = fs.readFileSync(path.join(root, f), 'utf8'); });
var LEGACY = /legacy value from before the Multichannel rename/;
function hits(re) { var out = []; FILES.forEach(function (f) { text[f].split('\n').forEach(function (line, i) { if (re.test(line) && !LEGACY.test(line)) out.push(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 120)); }); }); return out; }

check('plan table matches the approved pricing', function () {
  var got = JSON.parse(JSON.stringify(TM.PLAN_OPTIONS.map(function (o) { return o.key + '=' + o.price + ' ' + o.label; })));
  assert.deepStrictEqual(got, ['audit=$29 Audit Pass', 'pro-monthly=$15 Pro monthly', 'pro-yearly=$120 Pro yearly', 'multichannel-monthly=$29 Multichannel monthly', 'multichannel-yearly=$240 Multichannel yearly']);
  assert.strictEqual(TM.FREE_SKU_CAP, 25); assert.strictEqual(TM.MULTI_STORE_CAP, 5);
  assert.strictEqual(TM.FOUNDING.percentOff, 40); assert.strictEqual(TM.FOUNDING.seats, 200);
});
check('button labels name plan and price', function () {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(TM.PLAN_OPTIONS.map(TM.foundingButtonText))), ['Join founding list: Audit $29 one-time', 'Join founding list: Pro $15/mo', 'Join founding list: Pro $120/yr', 'Join founding list: Multichannel $29/mo', 'Join founding list: Multichannel $240/yr']);
});
check('every plan label is accepted by the signup form', function () {
  TM.PLAN_OPTIONS.forEach(function (o) { assert.strictEqual(TM.signupPayload({ email: 'a@b.co', plan: o.label }).Plan, o.label, o.label); });
  assert.strictEqual(TM.signupPayload({ email: 'a@b.co', plan: 'Agency' }).Plan, undefined);
});
check('no Agency anywhere', function () { assert.deepStrictEqual(hits(/agency/i), []); });
check('no old prices ($290, $79, Pro at $29)', function () { assert.deepStrictEqual(hits(/\$290\b|\$79\b|Pro[^.$]{0,40}\$29\b(?! one-time| Audit)/), []); });
check('no old founding wording', function () { assert.deepStrictEqual(hits(/Founding price, coming soon|locked-in discount|Join the founding list<\/button/), []); });
check('every price shown on a page is a current price', function () {
  var allowed = { '$0': 1, '$15': 1, '$120': 1, '$29': 1, '$240': 1, '$10': 1, '$20': 1 };
  ['index.html', 'app/index.html', 'terms.html', 'privacy.html', 'guide.html'].forEach(function (f) {
    var plain = text[f].replace(/<option>[^<]*<\/option>/g, '').replace(/\$\d+K/g, '');
    var bad = (plain.match(/\$\d+(?:\.\d+)?(?=\s*(?:\/|a |per|one-time|once|<\/p>|\)))/g) || []).filter(function (p) { return !allowed[p]; });
    assert.deepStrictEqual(bad, [], f);
  });
});
if (failed) { console.error(failed + ' pricing checks failed'); process.exit(1); } else console.log('pricing checks passed');
