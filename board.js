/* SOS Crew – unit board (board.html, TV/tablet) and unit tracker (track.html, phones).
 * Copyright (c) 2026 NE Prints & Design, LLC. All rights reserved.
 * Who: admins (Google) update anything; spotters see; trackers by link (?t=CODE) or Google, limited to their steps;
 * directors by their unit link (?unit=CODE) see their unit and the one before. Polls every 15 s (the server caches). */
(function () {
  'use strict';
  var C = window.SOS || {}, API = C.API, app = document.getElementById('app'), MODE = document.body.getAttribute('data-mode') || 'board';
  var P = C.ENV === 'LIVE' ? '' : 'sbx_';
  var S = { b: null, msg: null, unit: '', undo: null, skew: 0, cfg: null, track: '', ucode: '', token: '' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function get(k, ss) { try { return (ss ? sessionStorage : localStorage).getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v, ss) { try { var st = ss ? sessionStorage : localStorage; v ? st.setItem(k, v) : st.removeItem(k); } catch (e) {} }
  function tel(p) { var d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '+1' + d : d; }
  function call(d) {
    if (!API) return Promise.resolve({ error: 'This site is not connected yet.' });
    d.trackCode = S.track; d.unitCode = S.ucode; d.idToken = S.token;
    return fetch(API, { method: 'POST', body: JSON.stringify(d) }).then(function (r) { return r.json(); }).catch(function () { return { error: 'Could not reach the server. Retrying…', net: true }; });
  }
  function now() { return Date.now() + S.skew; }
  function at(hhmm) { if (!hhmm || !S.b || !S.b.date) return 0; var p = S.b.date.split('-'), t = hhmm.split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]).getTime(); }
  function clock(ms) { var d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + ('0' + m).slice(-2) + (h >= 12 ? ' PM' : ' AM'); }
  function hm(hhmm) { if (!hhmm) return ''; var t = hhmm.split(':'); return clock(new Date(2000, 0, 1, +t[0], +t[1]).getTime()); }
  function ago(ms) { var m = Math.max(0, Math.round((now() - ms) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm ago'; }

  // ---------- status of one unit
  function stepOf(id) { return (S.b.steps.filter(function (s) { return s.id === id; })[0]) || null; }
  function current(u, tracks) {
    var best = null; Object.keys(u.done).forEach(function (id) { var s = stepOf(id); if (s && tracks.indexOf(s.track) >= 0 && (!best || s.order > best.s.order)) best = { s: s, at: u.done[id].at, by: u.done[id].by }; });
    return best;
  }
  function stepById(id) { return S.b.steps.filter(function (s) { return s.id === id; })[0] || null; }
  function reachedId(u, id) {   // this step, or any later step on the same track or the together track
    var t = stepById(id); if (!t) return false;
    return Object.keys(u.done).some(function (k) { var s = stepOf(k); return s && (s.track === t.track || s.track === 'Together') && s.order >= t.order; });
  }
  /* Alerts go by step ID (names can be edited): G4 in warm-up, P3 props ready in holding, T1 to the gym, T3 performing, T4 performed. */
  function status(u) {
    var t = now(), g = current(u, ['Guard', 'Together']), p = current(u, ['Props', 'Together']), alerts = [], level = 0;
    var wu = at(u.warmup), pf = at(u.perform), finished = reachedId(u, 'T4');
    function flag(due, ok, what, early) { if (!due || ok || finished) return; if (t >= due) { alerts.push(what + ' late'); level = Math.max(level, 2); } else if (t >= due - early * 60000) { alerts.push(what + ' due ' + clock(due)); level = Math.max(level, 1); } }
    flag(wu, reachedId(u, 'G4'), 'Guard in warm-up', 10);
    flag(wu, reachedId(u, 'P3'), 'Props in holding', 15);
    flag(pf, reachedId(u, 'T1'), 'To the gym', 5);
    var performing = !!u.done.T3 && !finished;
    return { g: g, p: p, alerts: alerts, level: level, finished: finished, performing: performing };
  }
  function chip(cur, label) {
    if (!cur) return '<div class="chipst none"><div class="cs1">' + esc(label) + '</div><div class="cs2">Not yet</div></div>';
    return '<div class="chipst t-' + cur.s.track.toLowerCase() + '"><div class="cs1">' + esc(label) + '</div><div class="cs2">' + esc(cur.s.name) + '</div><div class="cs3">' + esc(clock(cur.at)) + ' · ' + esc(ago(cur.at)) + '</div></div>';
  }

  // ---------- frame
  function header(sub) {
    var b = S.b || S.cfg || {};
    return (C.ENV !== 'LIVE' ? '<div class="sandbox">TEST SITE</div>' : '') + '<header><img class="logo" src="img/logo-160.png" alt="" width="72" height="72"><div class="eyebrow">' + esc(b.event || C.EVENT) + ' · ' + (MODE === 'track' ? 'Unit tracker' : 'Unit board') +
      '</div><h1>' + esc(MODE === 'track' ? 'Tracker' : 'Live board') + ' <span class="bclock" id="clk">' + clock(now()) + '</span></h1><div class="hsub">' + esc(sub || '') + '</div></header>';
  }
  function footer() { return '<footer>' + (MODE === 'track' ? '<a href="board.html">Live board</a>' : '<a href="track.html">Tracker</a>') + ' · <a href="./">Volunteer signup</a>' + (S.track || S.token ? ' · <button class="link" data-act="out">Sign out</button>' : '') + ' · <button class="link" data-theme-toggle>Theme: ' + (window.sosTheme ? sosTheme.label() : 'Auto') + '</button><span class="legal">© 2026 NE Prints &amp; Design, LLC. All rights reserved.</span></footer>'; }
  function banner() { return S.msg ? '<div class="banner ' + S.msg.kind + '">' + esc(S.msg.text) + '</div>' : ''; }
  function renderSignIn() {
    var gid = (S.cfg && S.cfg.googleClientId) || C.GOOGLE_CLIENT_ID;
    app.innerHTML = header('Sign in') + banner() + '<div class="card"><h2>Unit ' + (MODE === 'track' ? 'tracker' : 'board') + '</h2><p class="muted">Open the link the coordinators sent you, or sign in with your Google account.</p>' + (gid ? '<div id="gbtn" style="display:flex;justify-content:center;min-height:44px"></div>' : '') + '</div>' + footer();
    if (!gid) return;
    var draw = function () { var el = document.getElementById('gbtn'); if (!el) return; google.accounts.id.initialize({ client_id: gid, callback: function (r) { S.token = r.credential; put(P + 'sosAdminTok', S.token, true); load(); } }); google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280 }); };
    if (window.google && google.accounts) draw(); else { var sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = draw; document.head.appendChild(sc); }
  }

  // ---------- board
  function renderBoard() {
    var b = S.b, rows = b.units.map(function (u) { return { u: u, st: status(u) }; });
    var perf = rows.filter(function (r) { return r.st.performing; })[0], queue = rows.filter(function (r) { return !r.st.finished && !r.st.performing; });
    var me = b.me, html = header(me.kind === 'director' ? 'Your unit and the one before you' : me.name + (me.role ? ' · ' + me.role : me.kind === 'tracker' ? ' · tracker' : '')) + banner();
    if (me.kind !== 'director') html += '<div class="stage"><div class="stg now"><div class="sl">Performing</div><div class="sv">' + esc(perf ? perf.u.name : '—') + '</div></div>' +
      '<div class="stg deck"><div class="sl">On deck</div><div class="sv">' + esc(queue[0] ? queue[0].u.name : '—') + '</div></div>' +
      '<div class="stg hole"><div class="sl">In the hole</div><div class="sv">' + esc(queue[1] ? queue[1].u.name : '—') + '</div></div></div>';
    if (!rows.length) html += '<div class="card"><p class="muted">No units yet. Admins add them on the admin page › Units.</p></div>';
    html += '<div class="units">' + rows.map(function (r) {
      var u = r.u, st = r.st, cls = st.finished ? 'fin' : st.performing ? 'perf' : st.level === 2 ? 'red' : st.level === 1 ? 'amber' : '';
      var tog = current(u, ['Together']);
      return '<div class="ucard ' + cls + (me.own === u.id ? ' own' : '') + '"><div class="uh"><div><span class="uo">' + esc(u.order) + '</span> <b class="un">' + esc(u.name) + '</b>' + (u.cls ? ' <span class="muted">' + esc(u.cls) + '</span>' : '') + (me.own === u.id ? ' <span class="pill done">You</span>' : '') + '</div>' +
        '<div class="ut">' + (u.warmup ? 'Warm-up ' + esc(hm(u.warmup)) : '') + (u.perform ? ' · Perform <b>' + esc(hm(u.perform)) + '</b>' : '') + '</div></div>' +
        (tog ? '<div class="chips2">' + chip(tog, 'Unit') + '</div>' : '<div class="chips2">' + chip(st.g, 'Guard') + chip(st.p, 'Props / tarp') + '</div>') +
        (st.alerts.length ? '<div class="ualert">' + esc(st.alerts.join(' · ')) + '</div>' : '') +
        (u.director && me.kind !== 'director' ? '<div class="whosub">Director: ' + esc(u.director) + (u.phone ? ' · <a href="tel:' + tel(u.phone) + '">Call</a> · <a href="sms:' + tel(u.phone) + '">Text</a>' : '') + '</div>' : '') +
        (me.steps.length && MODE === 'board' ? '<div style="margin-top:6px"><a class="cbtn alt" href="track.html#' + esc(u.id) + '">Update</a></div>' : '') + '</div>';
    }).join('') + '</div>';
    app.innerHTML = html + footer();
  }

  // ---------- tracker
  function renderTrack() {
    var b = S.b, me = b.me;
    if (!me.steps.length) { app.innerHTML = header(me.name) + '<div class="card"><p class="muted">Your account can see the board but can\'t update steps.</p><a class="cbtn alt" href="board.html">Open the live board</a></div>' + footer(); return; }
    var html = header(me.name + ' · can update ' + (me.steps.length === b.steps.length ? 'every step' : me.steps.length + ' step' + (me.steps.length > 1 ? 's' : ''))) + banner();
    if (S.undo) html += '<div class="banner ok">' + esc(S.undo.text) + ' <button class="link" data-act="undo" data-id="' + esc(S.undo.logId) + '">Undo</button></div>';
    html += '<div class="card"><label for="unitsel">Unit</label><select id="unitsel"><option value="">Pick a unit…</option>' + b.units.map(function (u) {
      var st = status(u), cur = current(u, ['Guard', 'Props', 'Together']);
      return '<option value="' + esc(u.id) + '"' + (u.id === S.unit ? ' selected' : '') + '>' + esc(u.order + '. ' + u.name + (cur ? ' – ' + cur.s.name : '') + (st.level === 2 ? ' ⚠' : '')) + '</option>';
    }).join('') + '</select></div>';
    var u = b.units.filter(function (x) { return x.id === S.unit; })[0];
    if (u) {
      var st = status(u);
      html += '<div class="card"><h2>' + esc(u.name) + (u.perform ? ' · perform ' + esc(hm(u.perform)) : '') + '</h2>' + (st.alerts.length ? '<div class="ualert">' + esc(st.alerts.join(' · ')) + '</div>' : '') +
        ['Guard', 'Props', 'Together'].map(function (tr) {
          var list = b.steps.filter(function (s) { return s.track === tr; }); if (!list.length) return '';
          return '<div class="trk"><div class="kicker">' + (tr === 'Together' ? 'Guard + props together' : tr === 'Props' ? 'Props / tarp' : 'Guard') + '</div>' + list.map(function (s) {
            var d = u.done[s.id], can = me.steps.indexOf(s.id) >= 0;
            return '<button class="stepbtn' + (d ? ' done' : '') + '" data-act="mark" data-step="' + esc(s.id) + '"' + (can && !d ? '' : ' disabled') + '><span>' + esc(s.name) + '</span><span class="sm2">' + (d ? '✓ ' + esc(clock(d.at)) + (d.by ? ' · ' + esc(d.by) : '') : can ? 'Tap when it happens' : '') + '</span></button>';
          }).join('') + '</div>';
        }).join('') + '</div>';
    }
    app.innerHTML = html + footer();
  }

  function render() { if (!S.b) return renderSignIn(); MODE === 'track' ? renderTrack() : renderBoard(); }
  var timer = null;
  function load() {
    return call({ action: 'board' }).then(function (r) {
      if (r.error) { if (r.net && S.b) { S.msg = { kind: 'warn', text: r.error }; render(); return; } if (r.signIn) { S.b = null; } S.msg = { kind: 'err', text: r.error }; render(); return; }
      S.skew = r.now - Date.now(); S.b = r; if (S.msg && S.msg.kind !== 'ok') S.msg = null;
      if (S.track) put(P + 'sosTrack', S.track); if (S.ucode) put(P + 'sosUnitCode', S.ucode);
      if (MODE === 'track' && !S.unit && location.hash) S.unit = location.hash.slice(1);
      render();
      if (!timer) timer = setInterval(function () { if (!document.hidden && !document.querySelector('select:focus')) load(); }, 15000);
    });
  }
  setInterval(function () { var c = document.getElementById('clk'); if (c) c.textContent = clock(now()); }, 1000);
  app.addEventListener('change', function (e) { if (e.target.id === 'unitsel') { S.unit = e.target.value; S.undo = null; try { history.replaceState(null, '', '#' + S.unit); } catch (x) {} render(); } });
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act');
    if (act === 'mark') {
      var step = b.getAttribute('data-step'); b.disabled = true;
      call({ action: 'unitMark', unitId: S.unit, stepId: step }).then(function (r) {
        if (r.error) S.msg = { kind: 'err', text: r.error }; else { S.msg = null; S.undo = { logId: r.logId, text: (stepOf(step) || {}).name + ' ✓' }; }
        load();
      });
    } else if (act === 'undo') { b.disabled = true; call({ action: 'unitUndo', logId: b.getAttribute('data-id') }).then(function (r) { S.undo = null; S.msg = r.error ? { kind: 'err', text: r.error } : { kind: 'ok', text: 'Undone.' }; load(); }); }
    else if (act === 'out') { put(P + 'sosTrack', ''); put(P + 'sosUnitCode', ''); put(P + 'sosAdminTok', '', true); S.track = S.ucode = S.token = ''; S.b = null; render(); }
  });

  var q = location.search;
  S.track = ((q.match(/[?&]t=([A-Za-z0-9]+)/) || [])[1] || get(P + 'sosTrack')).toUpperCase();
  S.ucode = ((q.match(/[?&]unit=([A-Za-z0-9]+)/) || [])[1] || (S.track ? '' : get(P + 'sosUnitCode'))).toUpperCase();
  S.token = get(P + 'sosAdminTok', true);
  if (/[?&](t|unit)=/.test(q)) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {} }
  call({ action: 'config' }).then(function (r) { if (!r.error) S.cfg = r; if (S.track || S.ucode || S.token) load(); else render(); });
})();
