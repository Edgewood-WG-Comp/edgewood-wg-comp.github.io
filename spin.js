/* SOS Crew loading spinner: a flag, rifle or sabre (picked at random) spinning while a page or a save is waiting.
 *   sosSpin(text)      → HTML for an inline spinner (used for "Loading…" spots)
 *   any API call that takes longer than a moment shows a small spinner pill at the bottom of the screen.
 * Copyright (c) 2026 NE Prints & Design, LLC. All rights reserved. */
(function () {
  // Each prop is drawn around its spin point (0,0) in a 100×100 box. Original drawings.
  var PROPS = {
    flag: '<g transform="scale(.8)"><rect x="-3" y="-44" width="6" height="88" rx="3" fill="#C9C3D9"/><circle cx="0" cy="44" r="4" fill="#9A93B0"/><circle cx="0" cy="-44" r="4" fill="#9A93B0"/>' +
      '<path d="M3 -42 C 22 -46, 30 -30, 44 -36 L 44 -6 C 30 0, 22 -16, 3 -12 Z" fill="#7C3AED"/><path d="M3 -27 C 22 -31, 30 -15, 44 -21 L 44 -6 C 30 0, 22 -16, 3 -12 Z" fill="#FBBF24"/></g>',
    rifle: '<g transform="rotate(-8)"><path d="M-44 -6 L 24 -6 L 46 -3 L 46 4 L 22 4 L 15 15 L 1 15 L 6 4 L -44 4 Z" fill="#FFFFFF" stroke="#4C1D95" stroke-width="3" stroke-linejoin="round"/>' +
      '<rect x="-32" y="-6" width="6" height="10" fill="#7C3AED"/><rect x="-8" y="-6" width="6" height="10" fill="#7C3AED"/><rect x="31" y="-5" width="5" height="9" fill="#FBBF24"/>' +
      '<path d="M8 -6 L 8 -11 L 14 -11" fill="none" stroke="#4C1D95" stroke-width="3" stroke-linecap="round"/><path d="M-40 4 Q -12 22 18 4" fill="none" stroke="#14B8A6" stroke-width="2.5"/></g>',
    sabre: '<g transform="rotate(10)"><path d="M-12 -2 C 6 -5, 26 -7, 46 -14 C 30 -3, 10 3, -12 3 Z" fill="#E5E7EB" stroke="#9CA3AF" stroke-width="1.5"/>' +
      '<rect x="-16" y="-9" width="4" height="18" rx="2" fill="#FBBF24"/><rect x="-36" y="-3" width="20" height="6" rx="3" fill="#7C3AED"/>' +
      '<path d="M-16 -8 C -28 -16, -38 -10, -38 -3" fill="none" stroke="#FBBF24" stroke-width="2.5"/><circle cx="-38" cy="0" r="3.5" fill="#FBBF24"/></g>'
  };
  var NAMES = Object.keys(PROPS), last = '';
  function pick() { var n; do { n = NAMES[Math.floor(Math.random() * NAMES.length)]; } while (n === last && NAMES.length > 1); last = n; return n; }
  function svg(size) {
    var n = pick();
    return '<svg class="sos-spin sos-' + n + '" width="' + size + '" height="' + size + '" viewBox="-50 -50 100 100" aria-hidden="true"><g class="sos-rot">' + PROPS[n] + '</g></svg>';
  }
  var css = '.sos-load{display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--sub,#5B5670);font-size:14px;padding:18px 0}' +
    '.sos-rot{transform-origin:0 0;animation:sosSpin 1.1s cubic-bezier(.45,.05,.55,.95) infinite}' +
    '.sos-flag .sos-rot{animation-duration:1.3s}.sos-sabre .sos-rot{animation-duration:.9s}' +
    '@keyframes sosSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
    '.sos-flag{animation:sosToss 2.6s ease-in-out infinite}@keyframes sosToss{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}' +
    '#sos-busy{position:fixed;left:50%;bottom:18px;transform:translate(-50%,20px);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:9999;' +
    'background:#2E1065;color:#fff;border-radius:999px;padding:6px 14px 6px 8px;display:flex;align-items:center;gap:8px;font:600 14px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)}' +
    '#sos-busy.on{opacity:1;transform:translate(-50%,0)}' +
    '@media (prefers-reduced-motion:reduce){.sos-rot,.sos-flag{animation:none}}';
  function inject() {
    if (document.getElementById('sos-spin-css')) return;
    var st = document.createElement('style'); st.id = 'sos-spin-css'; st.textContent = css; document.head.appendChild(st);
  }
  window.sosSpin = function (text) { return '<div class="sos-load">' + svg(64) + '<div>' + (text || 'Loading…') + '</div></div>'; };
  // the page's own "Loading…" placeholder
  function fillPlaceholders() {
    inject();
    Array.prototype.forEach.call(document.querySelectorAll('p.loading'), function (p) { p.outerHTML = window.sosSpin(p.textContent.trim()); });
  }
  fillPlaceholders();   // the placeholder sits above this script in the page
  // a small spinner pill whenever a call to the server takes more than a moment
  var pending = 0, timer = null, pill = null;
  function show() {
    inject();
    if (!pill) { pill = document.createElement('div'); pill.id = 'sos-busy'; pill.setAttribute('role', 'status'); document.body.appendChild(pill); }
    pill.innerHTML = svg(30) + '<span>Working…</span>'; pill.offsetWidth; pill.className = 'on';
  }
  function hide() { if (pill) pill.className = ''; }
  var api = (window.SOS && window.SOS.API) || '';
  if (window.fetch) {
    var f0 = window.fetch;
    window.fetch = function (url) {
      var u = String(url && url.url || url || '');
      var mine = (api && u.indexOf(api) === 0) || /\/api$/.test(u) || u.indexOf('script.google.com') >= 0;
      var body = arguments[1] && typeof arguments[1].body === 'string' ? arguments[1].body : '';
      if (/"action":"(board|ping)"/.test(body)) mine = false;   // the board's quiet 15-second refresh doesn't need a spinner
      if (!mine) return f0.apply(this, arguments);
      pending++; if (!timer) timer = setTimeout(function () { timer = null; if (pending) show(); }, 350);
      function done() { pending = Math.max(0, pending - 1); if (!pending) { clearTimeout(timer); timer = null; hide(); } }
      return f0.apply(this, arguments).then(function (r) { done(); return r; }, function (e) { done(); throw e; });
    };
  }
})();
