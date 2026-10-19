/* Cloudflare Web Analytics. Injects nothing unless CF_ANALYTICS_TOKEN is set. */
(function () {
  var token = String(window.CF_ANALYTICS_TOKEN || '').trim();
  if (!token) return;
  var script = document.createElement('script');
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.setAttribute('data-cf-beacon', JSON.stringify({ token: token }));
  document.head.appendChild(script);
})();
