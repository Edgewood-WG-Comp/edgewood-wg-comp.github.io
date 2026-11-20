/* SOS Crew – family page: sign in with the family code, see what's owed, pick spots by day.
 * Copyright (c) 2026 NE Prints & Design, LLC. All rights reserved.
 * Talks to the Apps Script web app at window.SOS.API. Holds no data; the family code is remembered only in this browser. */
(function () {
  'use strict';
  var C = window.SOS || {}, API = C.API, app = document.getElementById('app');
  var KEY = (C.ENV === 'LIVE' ? '' : 'sbx_') + 'sosCode';
  var S = { code: '', fam: null, day: null, date: '', msg: null, picking: '', busy: false };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }
  function label(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mi = m % 60, ap = h >= 12 ? 'PM' : 'AM'; return (h % 12 || 12) + (mi ? ':' + ('0' + mi).slice(-2) : '') + ' ' + ap; }
  function hhmm(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
  function dayParts(iso) { var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); return { dow: d.toLocaleDateString('en-US', { weekday: 'short' }), md: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), long: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }; }
  function nameOf(pid) { var p = (S.fam.people || []).filter(function (x) { return x.id === pid; })[0]; return p ? p.first : pid; }

  function call(d) {
    if (!API) return Promise.resolve({ error: 'This site is not connected yet.' });
    return fetch(API, { method: 'POST', body: JSON.stringify(d) }).then(function (r) { return r.json(); })
      .catch(function () { return { error: 'Could not reach the server. Check your connection and try again.' }; });
  }

  // ---------- screens
  function header(sub) {
    var name = (S.fam && S.fam.app) || C.NAME || 'SOS Crew', ev = (S.fam && S.fam.event) || C.EVENT || '';
    return (C.ENV !== 'LIVE' ? '<div class="sandbox">TEST SITE</div>' : '') +
      '<header><div class="eyebrow">' + esc(ev) + '</div><h1>' + esc(name) + '</h1><div class="hsub">' + esc(sub || 'Volunteer signup') + '</div></header>';
  }
  function footer() {
    var c = (S.fam && S.fam.contact) || C.CONTACT;
    return '<footer>Questions? <a href="mailto:' + esc(c) + '">' + esc(c) + '</a>' + (S.code ? ' · <button class="link" data-act="signout">Sign out</button>' : '') + '</footer>';
  }
  function banner() { return S.msg ? '<div class="banner ' + S.msg.kind + '">' + esc(S.msg.text) + '</div>' : ''; }

  function renderSignIn() {
    app.innerHTML = header('Sign in with your family code') + banner() +
      '<div class="card"><h2>Family code</h2>' +
      '<p class="muted">Every band, winter guard and winter percussion family has a code. Anyone in the family can use it.</p>' +
      '<label for="code">Code</label><input id="code" autocomplete="one-time-code" autocapitalize="characters" placeholder="e.g. K7QM2P">' +
      '<div style="margin-top:12px"><button data-act="signin" style="width:100%">Open my family page</button></div></div>' +
      '<div class="card"><h2>Don\'t have it?</h2><label for="em">Email on file with the band</label><input id="em" type="email" autocomplete="email">' +
      '<div style="margin-top:12px"><button class="ghost" data-act="sendcode" style="width:100%">Email me my code</button></div></div>' + footer();
  }

  function statusCard() {
    var st = S.fam.status;
    if (!st.decided) return '<div class="card"><h2>Your family</h2><p class="muted">How many shifts each family and student owes will be posted soon. You can sign up now.</p></div>';
    return '<div class="card"><h2>What your family owes</h2>' + st.lines.map(function (l) {
      var pill = l.needSignup <= 0 ? '<span class="pill done">Signed up ✓</span>' : '<span class="pill need">' + l.needSignup + ' more</span>';
      return '<div class="status-line"><div><div class="who">' + esc(l.who) + '</div><div class="whosub">' + (l.group ? esc(l.group) + ' · ' : '') + 'owes ' + l.owed + ' · signed up ' + l.signed + (l.worked ? ' · worked ' + l.worked : '') + '</div></div>' + pill + '</div>';
    }).join('') + '</div>';
  }
  function mineCard() {
    var m = S.fam.mine || [];
    if (!m.length) return '';
    return '<div class="card mine"><h2>Your shifts</h2><ul>' + m.map(function (x) {
      var dp = dayParts(x.date), act = x.status === 'Signed up' ? '<button class="sm ghost" data-act="' + (x.extraId ? 'xcancel' : 'cancel') + '" data-id="' + esc(x.extraId || x.signupId) + '">Cancel</button>' : '<span class="pill done">' + esc(x.status) + '</span>';
      return '<li><div><div class="who">' + esc(x.person) + ' · ' + esc(x.station) + '</div><div class="whosub">' + esc(dp.dow + ' ' + dp.md + ', ' + x.label) + '</div></div>' + act + '</li>';
    }).join('') + '</ul></div>';
  }
  function tabs() {
    return '<div class="tabs" role="tablist">' + S.day.days.map(function (d) {
      var dp = dayParts(d.date);
      return '<button class="tab' + (d.date === S.day.date ? ' on' : '') + '" role="tab" data-act="day" data-date="' + d.date + '"><div class="d1">' + esc(dp.dow) + '</div><div class="d2">' + esc(dp.md) + '</div></button>';
    }).join('') + '</div>';
  }
  function station(s) {
    var full = s.open <= 0, yours = s.yours.map(function (y) { return nameOf(y.person); }).join(', ');
    var btn = '';
    if (S.fam.open && !full && s.can.length) btn = '<button class="sm" data-act="pick" data-id="' + esc(s.id) + '">Sign up</button>';
    else if ((!full || s.who === 'Assigned') && s.reason && !s.can.length) btn = '<span class="pill tbd">' + esc(s.reason) + '</span>';
    var picker = S.picking === s.id ? '<div class="picker"><div class="muted" style="margin-bottom:6px">Who is working this?</div><div class="row">' +
      s.can.map(function (pid) { return '<button class="sm" data-act="claim" data-id="' + esc(s.id) + '" data-pid="' + esc(pid) + '">' + esc(nameOf(pid)) + '</button>'; }).join('') +
      '<button class="sm ghost" data-act="pick" data-id="">Never mind</button></div></div>' : '';
    if (s.who === 'Assigned') full = true;
    return '<div class="st' + (full ? ' full' : '') + '"><div><div class="nm">' + esc(s.station) + '</div><div class="meta">' +
      (s.who === 'Assigned' ? 'Filled by the coordinators' : full ? '<span class="open zero">Full</span>' : '<span class="open">' + s.open + ' of ' + s.spots + ' open</span>') +
      (s.counts !== 1 ? ' · counts as ' + s.counts : '') + (s.notes ? ' · ' + esc(s.notes) : '') + '</div>' +
      (yours ? '<div class="yours">You: ' + esc(yours) + '</div>' : '') + '</div>' + btn + '</div>' + picker;
  }
  function extraCard() {
    var who = S.day.extraHelpFor || [];
    if (!S.fam.open || !who.length || !S.day.blocks.length) return '';
    var lo = Math.min.apply(null, S.day.blocks.map(function (b) { return b.start; })), hi = Math.max.apply(null, S.day.blocks.map(function (b) { return b.end; }));
    var opts = function (sel) { var o = ''; for (var m = lo; m <= hi; m += 30) o += '<option value="' + hhmm(m) + '"' + (m === sel ? ' selected' : '') + '>' + label(m) + '</option>'; return o; };
    return '<div class="card"><h2>Extra Help</h2><p class="muted">The spots open to ' + esc(who.map(nameOf).join(', ')) + ' this day are taken. Sign up for Extra Help and pick your hours; the coordinators will put you where you\'re needed.</p>' +
      '<label for="xp">Who</label><select id="xp">' + who.map(function (p) { return '<option value="' + esc(p) + '">' + esc(nameOf(p)) + '</option>'; }).join('') + '</select>' +
      '<div class="row"><div><label for="xs">From</label><select id="xs">' + opts(lo) + '</select></div><div><label for="xe">To</label><select id="xe">' + opts(Math.min(hi, lo + 180)) + '</select></div></div>' +
      '<div style="margin-top:12px"><button data-act="extra" style="width:100%">Sign up for Extra Help</button></div></div>';
  }
  function addCard() {
    var g = (S.fam.groups || []).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
    return '<div class="card"><details><summary>Someone missing from your family?</summary>' +
      '<div class="row"><div><label for="af">First name</label><input id="af"></div><div><label for="al">Last name</label><input id="al"></div></div>' +
      '<label for="at">They are a</label><select id="at"><option>Parent</option><option>Student</option><option value="Adult">Other adult (grandparent, friend)</option></select>' +
      '<label for="ag">Student group</label><select id="ag"><option value="">(students only)</option>' + g + '</select>' +
      '<div style="margin-top:12px"><button class="ghost" data-act="add" style="width:100%">Add to my family</button></div></details></div>';
  }
  function renderFamily() {
    var dp = S.day && S.day.date ? dayParts(S.day.date) : null;
    var html = header(S.fam.family.name) + banner();
    if (!S.fam.open) html += '<div class="banner info">Signups aren\'t open yet. You can look around; we\'ll email when they open.</div>';
    html += statusCard() + mineCard();
    if (S.day && S.day.days.length) {
      html += tabs();
      if (S.day.draft) html += '<div class="banner warn">Times are a draft until the contest schedule is final. If your shift moves, we\'ll email you.</div>';
      html += '<div class="muted" style="margin:10px 16px 0">' + esc(dp.long) + '</div>';
      html += S.day.blocks.map(function (b) { return '<div class="card block"><h3>' + esc(b.label) + '</h3>' + b.stations.map(station).join('') + '</div>'; }).join('');
      html += extraCard();
    } else html += '<div class="card"><p class="muted">No shifts posted yet.</p></div>';
    app.innerHTML = html + addCard() + footer();
  }

  // ---------- data
  function flash(kind, text) { S.msg = { kind: kind, text: text }; }
  function loadFamily(code) {
    S.busy = true;
    return call({ action: 'family', code: code }).then(function (r) {
      if (r.error) { if (r.badCode) { put(KEY, ''); S.code = ''; } flash('err', r.error); S.fam = null; return; }
      S.code = code; put(KEY, code); S.fam = r;
      return loadDay(S.date);
    }).then(function () { S.busy = false; render(); });
  }
  function loadDay(date) {
    return call({ action: 'day', code: S.code, date: date || '' }).then(function (r) {
      if (r.error) { flash('err', r.error); return; }
      S.day = r; S.date = r.date;
    });
  }
  function refresh(okText) {
    return call({ action: 'family', code: S.code }).then(function (r) { if (!r.error) S.fam = r; return loadDay(S.date); })
      .then(function () { if (okText) flash('ok', okText); render(); });
  }
  function render() { S.code && S.fam ? renderFamily() : renderSignIn(); }

  // ---------- actions
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    var lock = function () { b.disabled = true; };
    S.msg = null;
    if (act === 'signin') { var c = document.getElementById('code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!c) return; lock(); loadFamily(c); }
    else if (act === 'sendcode') { lock(); call({ action: 'sendCode', email: document.getElementById('em').value }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || r.msg); render(); }); }
    else if (act === 'signout') { put(KEY, ''); S.code = ''; S.fam = null; S.day = null; render(); }
    else if (act === 'day') { S.picking = ''; loadDay(b.getAttribute('data-date')).then(render); }
    else if (act === 'pick') { S.picking = id || ''; render(); }
    else if (act === 'claim') { lock(); var pid = b.getAttribute('data-pid'); call({ action: 'claim', code: S.code, shiftId: id, personId: pid }).then(function (r) { S.picking = ''; if (r.error) { flash('err', r.error); return refresh(); } return refresh(nameOf(pid) + ' is signed up. Thank you!'); }); }
    else if (act === 'cancel' || act === 'xcancel') {
      if (!confirm('Cancel this shift?')) return; lock();
      call(act === 'cancel' ? { action: 'cancel', code: S.code, signupId: id } : { action: 'extraCancel', code: S.code, extraId: id }).then(function (r) { if (r.error) flash('err', r.error); return refresh(r.error ? '' : 'Cancelled.'); });
    }
    else if (act === 'extra') {
      lock(); var p = document.getElementById('xp').value;
      call({ action: 'extra', code: S.code, personId: p, date: S.date, start: document.getElementById('xs').value, end: document.getElementById('xe').value })
        .then(function (r) { if (r.error) flash('err', r.error); return refresh(r.error ? '' : nameOf(p) + ' is down for Extra Help. Thank you!'); });
    }
    else if (act === 'add') {
      lock();
      call({ action: 'addMember', code: S.code, first: document.getElementById('af').value, last: document.getElementById('al').value, type: document.getElementById('at').value, group: document.getElementById('ag').value })
        .then(function (r) { if (r.error) flash('err', r.error); return refresh(r.error ? '' : 'Added. The coordinators will double-check it.'); });
    }
  });

  // ---------- start: ?code= link from email, else the remembered code
  var q = (location.search.match(/[?&]code=([A-Za-z0-9]+)/) || [])[1];
  if (q) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  var start = (q || get(KEY)).toUpperCase();
  if (start) loadFamily(start); else render();
})();
