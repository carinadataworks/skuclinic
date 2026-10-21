/* Browser check of the Google Apps Script signup path (SIGNUP_SCRIPT_URL set) against a local mock.
   config.js is served with SIGNUP_SCRIPT_URL pointed at a fake /exec URL; that URL and its
   script.googleusercontent.com redirect are answered inside Playwright. Every other non-local
   request is aborted, so nothing leaves the box (FormSubmit included).
   Run: NODE_PATH=/path/to/node_modules node tests/script-signup.e2e.js   (needs the playwright package) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const pw = require('playwright');
const ROOT = path.join(__dirname, '..');
const EXEC = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const ECHO = 'https://script.googleusercontent.com/macros/echo?user_content_key=test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv' };

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await pw.chromium.launch();
  let fails = 0;
  const ok = (name, v) => { console.log((v ? 'ok  ' : 'FAIL ') + name); if (!v) fails++; };
  const config = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').replace(/var SIGNUP_SCRIPT_URL = '[^']*';/, "var SIGNUP_SCRIPT_URL = '" + EXEC + "';");
  ok('config.js has a SIGNUP_SCRIPT_URL to replace', config.includes(EXEC));

  async function context(mode) {
    const ctx = await browser.newContext();
    const posts = [], blocked = [], cspErrors = [];
    await ctx.addInitScript(() => { localStorage.setItem('skuclinic:termsAccepted', JSON.stringify({ at: new Date().toISOString(), version: '2026-10-21' })); localStorage.setItem('skuclinic:hideWelcome', '1'); localStorage.setItem('skuclinic:coachDone', '1'); });
    await ctx.route('**/*', route => {
      const req = route.request(), url = req.url();
      if (url.startsWith(BASE + '/config.js')) return route.fulfill({ contentType: 'text/javascript', body: config });
      if (url.startsWith(BASE) || /^(data|blob):/.test(url)) return route.continue();
      if (url === EXEC && req.method() === 'POST') {
        posts.push({ url, method: req.method(), type: req.headers()['content-type'], body: req.postData() });
        if (mode === 'down') return route.abort('connectionrefused');
        return route.fulfill({ status: 302, headers: { Location: ECHO } }); // what Apps Script really does
      }
      if (url === ECHO) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      blocked.push(req.method() + ' ' + url); return route.abort('blockedbyclient');
    });
    const page = await ctx.newPage();
    page.on('console', m => { if (/Content Security Policy/i.test(m.text())) cspErrors.push(m.text()); });
    return { ctx, page, posts, blocked, cspErrors };
  }

  // landing signup -> Apps Script
  let t = await context('up');
  await t.page.goto(BASE + '/index.html?plan=pro-yearly');
  ok('signup idle note hidden (an endpoint is configured)', await t.page.isHidden('#signupIdle'));
  await t.page.fill('#email', 'buyer@shop.example');
  await t.page.check('input[name="wouldPay"][value="Yes"]');
  await t.page.fill('#worth', 'Clearer fixes');
  await t.page.click('#signupSubmit');
  await t.page.waitForSelector('#signupMsg:not([hidden])');
  const msg = await t.page.textContent('#signupMsg');
  ok('success message shows: ' + msg, msg.includes('You’re on the list') && (await t.page.getAttribute('#signupMsg', 'class')) === 'msg-ok');
  ok('exactly one POST to the script URL', t.posts.length === 1 && t.posts[0].method === 'POST');
  ok('form-encoded body (URLSearchParams)', /application\/x-www-form-urlencoded/.test(t.posts[0] && t.posts[0].type));
  const fields = t.posts[0] ? Object.fromEntries(new URLSearchParams(t.posts[0].body)) : {};
  try {
    assert.deepStrictEqual(fields, { form: 'signup', app: 'SkuClinic', email: 'buyer@shop.example', 'Would you pay $15/mo for this?': 'Yes',
      'What would make this worth paying for?': 'Clearer fixes', Plan: 'Pro yearly', _gotcha: '' });
    ok('right fields posted', true);
  } catch (e) { ok('right fields posted: ' + JSON.stringify(fields), false); }
  ok('no FormSubmit or other outside request: ' + t.blocked.join(', '), t.blocked.length === 0);
  ok('CSP allows the script URL and its redirect: ' + t.cspErrors.join(' | '), t.cspErrors.length === 0);
  // honeypot filled: nothing sent
  await t.page.fill('#email', 'bot@spam.example'); await t.page.check('input[name="wouldPay"][value="No"]');
  await t.page.$eval('#honey', e => { e.value = 'x'; }); await t.page.click('#signupSubmit'); await t.page.waitForTimeout(300);
  ok('honeypot blocks the send', t.posts.length === 1);
  ok('honeypot hidden from users and screen readers, not focusable', await t.page.$eval('#honey', e => e.tabIndex === -1 && e.closest('[aria-hidden="true"]') !== null && e.getBoundingClientRect().right < 0));

  // app feedback -> Apps Script
  await t.page.goto(BASE + '/app/');
  await t.page.waitForSelector('#feedbackOpen:not([hidden])', { timeout: 5000 }).catch(() => {});
  ok('feedback button shown when only the script URL matters', await t.page.isVisible('#feedbackOpen'));
  await t.page.$eval('#feedbackModal', e => { e.hidden = false; });
  await t.page.fill('#feedbackMessage', 'Need a sample'); await t.page.check('input[name="feedbackPay"][value="Maybe"]');
  await t.page.click('#feedbackSend'); await t.page.waitForSelector('#feedbackMsg.msg-ok', { timeout: 5000 }).catch(() => {});
  ok('feedback success message', (await t.page.textContent('#feedbackMsg')).includes('Thanks'));
  const fb = t.posts[1] ? Object.fromEntries(new URLSearchParams(t.posts[1].body)) : {};
  ok('feedback posted with form=feedback: ' + JSON.stringify(fb), fb.form === 'feedback' && fb["What's missing or confusing?"] === 'Need a sample' && fb['Would you pay $15/mo?'] === 'Maybe');
  await t.ctx.close();

  // network error -> failure message
  t = await context('down');
  await t.page.goto(BASE + '/index.html');
  await t.page.fill('#email', 'buyer@shop.example'); await t.page.check('input[name="wouldPay"][value="Maybe"]');
  await t.page.click('#signupSubmit'); await t.page.waitForSelector('#signupMsg.msg-bad');
  ok('network error shows the failure message', (await t.page.textContent('#signupMsg')).includes('didn’t send') && t.posts.length === 1);
  ok('typed email kept after failure', (await t.page.inputValue('#email')) === 'buyer@shop.example');
  await t.ctx.close();

  await browser.close(); server.close();
  if (fails) { console.error(fails + ' failed'); process.exit(1); }
  console.log('script signup checks passed');
})().catch(e => { console.error(e); process.exit(1); });
