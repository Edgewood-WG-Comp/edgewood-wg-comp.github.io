/* SOS Crew – HQ board (board.html), public board (live.html) and contest-day station screens (track.html, phones).
 * Copyright (c) 2026 NE Prints & Design, LLC. All rights reserved.
 * Who: admins and Contest HQ (Google) see and update everything; spotters see; station volunteers (signed in on their family
 * page) get their station's screen; trackers by link (?t=CODE); directors by their unit link (?unit=CODE) see their unit and
 * the one before; anyone sees live.html (school names and where they are). Nothing is ever blocked: out-of-order taps just
 * raise a flag. Taps are saved on the phone first and sent when there's signal (weak hallway Wi-Fi). Polls every 20 s. */
(function () {
  'use strict';
  var C = window.SOS || {}, API = C.API, app = document.getElementById('app'), MODE = document.body.getAttribute('data-mode') || 'board';
  var P = C.ENV === 'LIVE' ? '' : 'sbx_', PUB = MODE === 'live';
  var S = { b: null, msg: null, unit: '', undo: null, skew: 0, cfg: null, track: '', ucode: '', token: '', fam: '', lead: '', screen: '', ask: null, sending: false, offline: false };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function get(k, ss) { try { return (ss ? sessionStorage : localStorage).getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v, ss) { try { var st = ss ? sessionStorage : localStorage; v ? st.setItem(k, v) : st.removeItem(k); } catch (e) {} }
  function tel(p) { var d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '+1' + d : d; }
  function call(d) {
    if (!API) return Promise.resolve({ error: 'This site is not connected yet.' });
    if (PUB) d.public = true;
    else { d.trackCode = S.track; d.unitCode = S.ucode; d.idToken = S.token; d.famCode = S.fam; d.leadCode = S.lead; }   // family/lead codes: station volunteers and their leads
    return fetch(API, { method: 'POST', body: JSON.stringify(d) }).then(function (r) { return r.json(); }).catch(function () { return { error: 'No signal. Your taps are saved on this phone and will send when it reconnects.', net: true }; });
  }
  function now() { return Date.now() + S.skew; }
  function at(hhmm) { if (!hhmm || !S.b || !S.b.date) return 0; var p = S.b.date.split('-'), t = hhmm.split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]).getTime(); }
  function clock(ms) { var d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + ('0' + m).slice(-2) + (h >= 12 ? ' PM' : ' AM'); }
  function hm(hhmm) { if (!hhmm) return ''; var t = hhmm.split(':'); return clock(new Date(2000, 0, 1, +t[0], +t[1]).getTime()); }
  function ago(ms) { var m = Math.max(0, Math.round((now() - ms) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm ago'; }
  function uid() { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function unitById(id) { return S.b.units.filter(function (x) { return x.id === id; })[0] || null; }

  // ---------- steps and where a unit stands
  function stepOf(id) { return (S.b.steps.filter(function (s) { return s.id === id; })[0]) || null; }
  function stepName(id) { var s = stepOf(id); return s ? s.name : id; }
  function current(u, tracks) {
    var best = null; Object.keys(u.done).forEach(function (id) { var s = stepOf(id); if (s && tracks.indexOf(s.track) >= 0 && (!best || s.order > best.s.order)) best = { s: s, at: u.done[id].at, by: u.done[id].by }; });
    return best;
  }
  function reachedId(u, id) {   // this step, or any later step on the same track or the together track
    var t = stepOf(id); if (!t) return false;
    return Object.keys(u.done).some(function (k) { var s = stepOf(k); return s && (s.track === t.track || s.track === 'Together') && s.order >= t.order; });
  }
  function hasProps(u) { return !u.props || u.props === 'separate'; }
  var PROPS_NOTE = { none: 'No props or tarp', guard: 'Tarp travels with the guard', separate: 'Props / tarp coming in' };
  /* Scheduled time for a step, from the IHSCGA schedule. */
  var STEP_TIME = { G4: 'toInsp', G5: 'insp', G6: 'warmup', T1: 'toHold', T2: 'hold', T3: 'perform', P3: 'toHold' };
  function due(u, id) { var k = STEP_TIME[id]; return k && u[k] ? hm(u[k]) : ''; }
  /* Flags, never blocks. Step IDs: see the Steps tab (names can be edited). */
  function status(u) {
    var t = now(), g = current(u, ['Guard', 'Together']), p = current(u, ['Props', 'Together']), d = current(u, ['Director']), alerts = [], level = 0;
    var finished = reachedId(u, 'T5') || reachedId(u, 'T4'), performing = !!u.done.T3 && !finished;
    var ti = at(u.toInsp) || (at(u.warmup) && at(u.warmup) - 11 * 60000), wi = at(u.insp), wu = at(u.warmup), th = at(u.toHold), ho = at(u.hold), pf = at(u.perform);
    function flag(when, ok, what, early) { if (!when || ok || finished) return; if (t >= when) { alerts.push(what + ' late'); level = Math.max(level, 2); } else if (t >= when - early * 60000) { alerts.push(what + ' due ' + clock(when)); level = Math.max(level, 1); } }
    flag(ti, !!u.done.D1, 'Director check-in', 20);
    flag(ti && ti - 15 * 60000, reachedId(u, 'G1'), 'Guard check-in', 15);
    flag(ti, reachedId(u, 'G4'), 'To warm-up', 5);
    flag(wi, reachedId(u, 'G5'), 'Equipment to inspection', 5);
    flag(wu, reachedId(u, 'G6'), 'Warm-up', 5);
    if (u.done.G7 && !u.done.E1 && !finished) { alerts.push('Visual warm-up before inspection complete'); level = Math.max(level, 1); }
    if (hasProps(u)) { flag(wu, reachedId(u, 'P1'), 'Props arrival', 20); flag(th, reachedId(u, 'P3'), 'Props staged', 10); }
    flag(th, reachedId(u, 'T1'), 'To performance', 3);
    flag(ho, reachedId(u, 'T2'), 'At holding', 3);
    if (u.done.G9 && !u.done.G10 && t - u.done.G9.at > 45 * 60000) { alerts.push('Home room not cleared'); level = Math.max(level, 1); }
    var late = u.done.T3 && pf ? Math.round((u.done.T3.at - pf) / 60000) : null;
    return { g: g, p: p, d: d, alerts: alerts, level: level, finished: finished, performing: performing, late: late };
  }
  function chip(cur, label) {
    if (!cur) return '<div class="chipst none"><div class="cs1">' + esc(label) + '</div><div class="cs2">Not yet</div></div>';
    return '<div class="chipst t-' + cur.s.track.toLowerCase() + '"><div class="cs1">' + esc(label) + '</div><div class="cs2">' + esc(cur.s.name) + '</div><div class="cs3">' + esc(clock(cur.at)) + ' · ' + esc(ago(cur.at)) + '</div></div>';
  }
  function doneTxt(dn, verb) { return '✓ ' + (verb ? verb + ' ' : '') + clock(dn.at) + (dn.by ? ' · ' + dn.by.replace(/ \(caught up\)$/, '') : '') + (dn.pending ? ' · waiting to sync' : ''); }

  // ---------- taps saved on the phone first (weak signal), sent in order
  var QK = P + 'sosQueue';
  function getQ() { try { return JSON.parse(get(QK) || '[]').filter(function (x) { return now() - (x.at || 0) < 12 * 3600000; }); } catch (e) { return []; } }
  function setQ(q) { put(QK, q.length ? JSON.stringify(q) : ''); }
  /* What a queued write will do, shown right away. */
  function applyOpt(d) {
    var u = S.b && unitById(d.unitId), me = S.b && S.b.me;
    if (d.action === 'unitUndo') { S.b.units.forEach(function (x) { Object.keys(x.done).forEach(function (k) { if ((d.logIds || []).indexOf(x.done[k].log) >= 0) delete x.done[k]; }); }); return; }
    if (!u) return;
    if (d.action === 'unitHR') { u.hr = d.area; return; }
    if (d.action === 'unitProps') { u.props = d.props; u.propsSet = true; return; }
    if (d.action !== 'unitMark') return;
    if (d.props) { u.props = d.props; u.propsSet = true; }
    if (d.hr) u.hr = d.hr;
    var mk = function (id, by) { if (!u.done[id]) u.done[id] = { at: d.at, by: by, pending: true, tap: d.tapId }; }, nm = (me.stepBy && me.stepBy[d.stepId]) || me.name;
    (d.fill || []).forEach(function (id) { mk(id, nm); }); (d.also || []).forEach(function (id) { mk(id, nm); }); mk(d.stepId, nm);
    if (d.stepId === 'G8' && hasProps(u) && stepOf('P4')) mk('P4', 'Auto');
  }
  function send(d) { d.tapId = d.tapId || uid(); d.at = d.at || now(); var q = getQ(); q.push(d); setQ(q); applyOpt(d); S.ask = null; render(); flush(); }
  function flush() {
    if (S.sending) return; var q = getQ(); if (!q.length) return;
    S.sending = true;
    var d = q[0], copy = JSON.parse(JSON.stringify(d));
    call(copy).then(function (r) {
      S.sending = false;
      if (r.net) { S.offline = true; render(); return; }
      S.offline = false; setQ(getQ().filter(function (x) { return x.tapId !== d.tapId; }));
      if (r.error) S.msg = { kind: 'err', text: r.error };
      else if (d.action === 'unitMark') { var u = unitById(d.unitId); S.undo = { logIds: r.logIds || [r.logId], text: (u ? u.name + ': ' : '') + stepName(d.stepId) + ' ✓' + ((r.logIds || []).length > 1 ? ' (+' + (r.logIds.length - 1) + ')' : '') }; }
      else if (d.action === 'unitHR' && r.shared && r.shared.length) S.msg = { kind: 'warn', text: r.area + ' is also given to ' + r.shared.join(', ') + '.' };
      if (getQ().length) flush(); else load();
    });
  }
  function waiting() { var n = getQ().length; return n ? '<div class="banner warn">' + n + ' waiting to sync' + (S.offline ? ' · no signal right now' : '') + '. Keep going: they send on their own.</div>' : ''; }

  // ---------- frame
  function header(sub) {
    var b = S.b || S.cfg || {};
    var title = PUB ? 'Live board' : MODE === 'track' ? 'Contest day' : 'HQ board';
    return (C.ENV !== 'LIVE' ? '<div class="sandbox">TEST SITE</div>' : '') + '<header><img class="logo" src="img/logo-160.png" alt="" width="72" height="72"><div class="eyebrow">' + esc(b.event || C.EVENT) + '</div><h1>' + esc(title) + ' <span class="bclock" id="clk">' + clock(now()) + '</span></h1><div class="hsub">' + esc(sub || '') + '</div></header>';
  }
  function footer() {
    if (PUB) return '<footer><span class="legal">© 2026 NE Prints &amp; Design, LLC. All rights reserved.</span></footer>';
    return '<footer>' + (MODE === 'track' ? (S.b && !S.b.me.view ? '' : '<a href="board.html">HQ board</a> · ') : '<a href="track.html">Station screens</a> · ') + '<a href="live.html">Public board</a> · <a href="help/contest-day/' + (MODE === 'track' ? 'unit-tracker' : 'live-board') + '/">Help</a> · <a href="./">Volunteer signup</a>' + (S.track || S.token ? ' · <button class="link" data-act="out">Sign out</button>' : '') + ' · <button class="link" data-theme-toggle>Theme: ' + (window.sosTheme ? sosTheme.label() : 'Auto') + '</button><span class="legal">© 2026 NE Prints &amp; Design, LLC. All rights reserved.</span></footer>';
  }
  function banner() { return S.msg ? '<div class="banner ' + S.msg.kind + '">' + esc(S.msg.text) + '</div>' : ''; }
  function renderSignIn() {
    var gid = (S.cfg && S.cfg.googleClientId) || C.GOOGLE_CLIENT_ID;
    if (PUB) { app.innerHTML = header('') + banner() + footer(); return; }
    app.innerHTML = header('Sign in') + banner() + '<div class="card"><h2>' + (MODE === 'track' ? 'Station screens' : 'HQ board') + '</h2><p class="muted">Volunteers: sign in on the <a href="./">volunteer page</a> first, then come back. Coordinators: sign in with your Google account.</p>' + (gid ? '<div id="gbtn" style="display:flex;justify-content:center;min-height:44px"></div>' : '') + '</div>' + footer();
    if (!gid) return;
    var draw = function () { var el = document.getElementById('gbtn'); if (!el) return; google.accounts.id.initialize({ client_id: gid, callback: function (r) { S.token = r.credential; put(P + 'sosAdminTok', S.token, true); load(); } }); google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280 }); };
    if (window.google && google.accounts) draw(); else { var sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = draw; document.head.appendChild(sc); }
  }

  // ---------- HQ board, director view, public board
  function withMarkers(rows) {   // schedule markers (Break, Awards) placed by order
    var out = [], ms = (S.b.markers || []).slice();
    rows.forEach(function (r) { while (ms.length && ms[0].order < r.u.order) out.push({ m: ms.shift() }); out.push(r); });
    return out.concat(ms.map(function (m) { return { m: m }; }));
  }
  function marker(m) { return '<div class="umark">' + esc(m.name) + (m.at ? ' · ' + esc(hm(m.at)) : '') + '</div>'; }
  function times(u) {
    var t = [['Inspection', u.insp], ['Warm-up', u.warmup], ['Holding', u.hold]].filter(function (x) { return x[1]; });
    return t.length ? '<div class="whosub">' + t.map(function (x) { return x[0] + ' ' + esc(hm(x[1])); }).join(' · ') + (u.area ? ' · Area ' + esc(u.area) : '') + '</div>' : '';
  }
  function renderBoard() {
    var b = S.b, rows = b.units.map(function (u) { return { u: u, st: status(u) }; }), me = b.me;
    var perf = rows.filter(function (r) { return r.st.performing; })[0], queue = rows.filter(function (r) { return !r.st.finished && !r.st.performing; });
    var html = header(PUB ? 'Where each guard is right now' : me.kind === 'director' ? 'Your unit and the one before you' : me.name + (me.role ? ' · ' + me.role : '')) + banner();
    if (me.kind !== 'director') html += '<div class="stage"><div class="stg now"><div class="sl">Performing</div><div class="sv">' + esc(perf ? perf.u.name : '—') + '</div></div>' +
      '<div class="stg deck"><div class="sl">On deck</div><div class="sv">' + esc(queue[0] ? queue[0].u.name : '—') + '</div></div>' +
      '<div class="stg hole"><div class="sl">In the hole</div><div class="sv">' + esc(queue[1] ? queue[1].u.name : '—') + '</div></div></div>';
    if (!rows.length) html += '<div class="card"><p class="muted">No units yet.' + (PUB ? '' : ' Admins import the IHSCGA schedule on the admin page › Units.') + '</p></div>';
    if (!PUB && b.areas && b.areas.length && me.view) html += areasCard(false);
    html += '<div class="units">' + withMarkers(rows).map(function (r) { return r.m ? marker(r.m) : PUB ? pubCard(r) : unitCard(r, me); }).join('') + '</div>';
    if (!PUB && !me.contact && me.kind !== 'director' && b.escalate) html += '<div class="card"><p class="muted">' + esc(b.escalate) + '</p></div>';
    app.innerHTML = html + footer();
  }
  function pubCard(r) {
    var u = r.u, st = r.st, cur = current(u, ['Guard', 'Together', 'Equipment']);
    var where = st.performing ? 'Performing' : st.finished ? 'Performed' : cur ? cur.s.name : 'Not here yet';
    return '<div class="ucard' + (st.performing ? ' perf' : st.finished ? ' fin' : '') + '"><div class="uh"><div><span class="uo">' + esc(u.order) + '</span> <b class="un">' + esc(u.name) + '</b></div><div class="ut">' + (u.perform ? 'Perform <b>' + esc(hm(u.perform)) + '</b>' : '') + '</div></div><div class="whosub">' + esc(where) + '</div></div>';
  }
  function unitCard(r, me) {
    var u = r.u, st = r.st, cls = st.level === 2 ? 'red' : st.finished ? 'fin' : st.performing ? 'perf' : st.level === 1 ? 'amber' : '';
    var tog = st.g && st.p && st.g.s === st.p.s ? st.g : null;   // guard and props together right now
    return '<div class="ucard ' + cls + (me.own === u.id ? ' own' : '') + '"><div class="uh"><div><span class="uo">' + esc(u.order) + '</span> <b class="un">' + esc(u.name) + '</b>' + (u.cls ? ' <span class="muted">' + esc(u.cls) + '</span>' : '') + (me.own === u.id ? ' <span class="pill done">You</span>' : '') + '</div>' +
      '<div class="ut">' + (u.perform ? 'Perform <b>' + esc(hm(u.perform)) + '</b>' : '') + (st.late != null ? ' · on floor ' + (st.late > 0 ? '+' + st.late : st.late) + ' min' : '') + '</div></div>' + times(u) +
      (tog ? '<div class="chips2">' + chip(tog, 'Unit') + '</div>' : '<div class="chips2">' + chip(st.g, 'Guard') + (hasProps(u) ? chip(st.p, 'Props / tarp') : '<div class="chipst none"><div class="cs1">Props / tarp</div><div class="cs2">' + esc(PROPS_NOTE[u.props]) + '</div></div>') + '</div>') +
      (st.alerts.length ? '<div class="ualert">' + esc(st.alerts.join(' · ')) + '</div>' : '') + guides(u) +
      (me.kind !== 'director' ? '<div class="whosub">' + (u.hr != null ? 'Home room: ' + (u.hr ? esc(u.hr) : '<b>none yet</b>') + ' · ' : '') + 'Inspection ' + (u.done.E1 ? '✓ ' + esc(clock(u.done.E1.at)) : u.done.G5 ? 'in progress' : '—') + '</div>' +
        '<div class="whosub">Director' + (u.director ? ': ' + esc(u.director) : '') + ' · ' + (st.d ? '✓ checked in ' + esc(clock(st.d.at)) : '<b>not checked in</b>') + (u.phone ? ' · <a href="tel:' + tel(u.phone) + '">Call</a> · <a href="sms:' + tel(u.phone) + '">Text</a>' : '') + '</div>' : '') +
      (me.steps.length && MODE === 'board' ? '<div style="margin-top:6px"><a class="cbtn alt" href="track.html#guide:' + esc(u.id) + '">Update</a></div>' : '') + '</div>';
  }
  function guides(u) {
    return (u.guides || []).map(function (g) { return '<div class="whosub">Guide: ' + esc(g.name) + (g.when ? ' <span class="muted">' + esc(g.when) + '</span>' : '') + (g.phone ? ' · <a href="tel:' + tel(g.phone) + '">Call</a> · <a href="sms:' + tel(g.phone) + '">Text</a>' : '') + '</div>'; }).join('');
  }
  var AREA_NOTE = { available: 'Available', assigned: 'Assigned', occupied: 'In use', cleared: 'Cleared · available' };
  function areasCard(pick) {
    var a = S.b.areas || [], home = a.filter(function (x) { return x.home; }), ch = a.filter(function (x) { return !x.home; });
    return '<div class="card"><h2>Home rooms</h2><div class="areas">' + home.map(function (x) {
      return '<div class="area a-' + x.status + '"><b>' + esc(x.name) + '</b>' + (x.location ? ' <span class="muted">' + esc(x.location) + '</span>' : '') + '<div class="whosub">' + esc(AREA_NOTE[x.status] || '') +
        (x.units ? ': ' + esc(x.units.map(function (y) { return y.name; }).join(', ')) : '') + (x.status === 'cleared' && x.cleared ? ' (' + esc(x.cleared.unit) + ' left ' + esc(clock(x.cleared.at)) + ')' : '') + '</div></div>';
    }).join('') + '</div>' + (ch.length ? '<p class="whosub" style="margin:8px 0 0">Changing: ' + esc(ch.map(function (x) { return x.name + ' ' + x.type.replace(/^Changing\s*/i, '') + (x.location ? ', ' + x.location : ''); }).join(' · ')) + '</p>' : '') + '</div>';
  }

  // ---------- station screens
  function canTap(u, id) { var me = S.b.me; return me.steps.indexOf(id) >= 0 && (!me.scope || me.scope[id] === 'all' || (me.scope[id] || []).indexOf(u.id) >= 0); }
  function screensFor() {
    var me = S.b.me, admin = me.kind === 'admin';
    var list = (S.b.screens || []).filter(function (s) { return admin || s.steps.some(function (id) { return me.steps.indexOf(id) >= 0; }) || (s.key === 'guide' && (S.b.claim || (me.guiding || []).length)); });
    if (S.b.claim && !list.some(function (s) { return s.key === 'guide'; })) list.unshift({ key: 'guide', label: 'Guide', steps: [] });
    if (admin || me.steps.indexOf('G1') >= 0 || me.steps.indexOf('D1') >= 0) { var i = list.map(function (s) { return s.key; }).indexOf('checkin'); list.splice(i + 1, 0, { key: 'hr', label: 'Home rooms', steps: [] }); }
    return list;
  }
  function pickScreen(list) {
    var keys = list.map(function (s) { return s.key; }), want = S.screen || get(P + 'sosScreen') || S.b.me.screen || ((S.b.me.guiding || []).length ? 'guide' : '');
    return keys.indexOf(want) >= 0 ? want : keys[0] || '';
  }
  function renderTrack() {
    var b = S.b, me = b.me, list = screensFor(), scr = pickScreen(list);
    var html = header(me.name + (me.role ? ' · ' + me.role : '')) + banner() + waiting() + (me.note ? '<div class="banner warn">' + esc(me.note) + '</div>' : '');
    if (!list.length) { app.innerHTML = html + '<div class="card"><p class="muted">' + esc(me.note || (me.view ? 'Your account can see the board but has no station.' : 'Nothing to update right now.')) + '</p>' + (me.view ? '<a class="cbtn alt" href="board.html">Open the HQ board</a>' : '') + '</div>' + escalate(me) + footer(); return; }
    if (list.length > 1) html += '<div class="scrnav">' + list.map(function (s) { return '<button class="tpill' + (s.key === scr ? '' : ' alt') + '" data-act="screen" data-k="' + s.key + '">' + esc(s.label) + '</button>'; }).join('') + (me.view ? '<a class="tpill alt" href="board.html">HQ board</a>' : '') + '</div>';
    if (S.undo) html += '<div class="banner ok">' + esc(S.undo.text) + ' <button class="link" data-act="undo" data-id="' + esc(S.undo.logIds.join(',')) + '">Undo</button></div>';
    html += (SCREEN[scr] || function () { return ''; })();
    app.innerHTML = html + askBox() + escalate(me) + footer();
  }
  function cpill(cls, unitId, act, name, sub, extra) {
    return '<button class="cpill ' + cls + '" data-act="' + act + '" data-unit="' + esc(unitId) + '"' + (extra || '') + '><span class="cn">' + esc(name) + '</span><span class="cs">' + esc(sub) + '</span></button>';
  }
  function list(fn) { var us = S.b.units; return us.length ? '<div class="clist">' + us.map(fn).join('') + '</div>' : '<div class="card"><p class="muted">No guards yet.</p></div>'; }
  var SCREEN = {
    unload: function () {
      return '<p class="hint">Tap a school when its props or tarp come in the prop door.</p>' + list(function (u) {
        if (!hasProps(u)) return cpill('none', u.id, 'pr-restore', u.order + '. ' + u.name, PROPS_NOTE[u.props]);
        var dn = u.done.P1, later = !dn && current(u, ['Props']);
        if (later) return cpill('done', u.id, 'pr-tap', u.order + '. ' + u.name, doneTxt({ at: later.at, by: later.by }, later.s.name.replace(/^Props /, '')) + ' · not checked in at the door', ' data-step="P1"');
        return dn ? cpill('done', u.id, 'pr-undo', u.order + '. ' + u.name, doneTxt(dn, 'Arrived'), ' data-step="P1"') : cpill('todo', u.id, 'pr-tap', u.order + '. ' + u.name, u.perform ? 'Performs ' + hm(u.perform) : '', ' data-step="P1"');
      });
    },
    proparea: function () {
      return '<p class="hint">Holding, then staged at warm-up before the guard\'s transit to holding.</p>' + list(function (u) {
        var nm = u.order + '. ' + u.name;
        if (!hasProps(u)) return cpill('none', u.id, 'pr-restore', nm, PROPS_NOTE[u.props]);
        if (!reachedId(u, 'P2')) return cpill(u.done.P1 ? 'todo' : 'wait', u.id, 'pr-tap', nm, 'Next: in holding · ' + (u.done.P1 ? 'arrived ' + clock(u.done.P1.at) : 'not arrived yet'), ' data-step="P2"');
        if (!reachedId(u, 'P3')) return cpill(u.done.G6 || u.done.G7 ? 'hot' : 'todo', u.id, 'pr-tap', nm, 'Next: staged at warm-up' + (u.toHold ? ' by ' + hm(u.toHold) : '') + ' · in holding ' + clock((u.done.P2 || { at: now() }).at), ' data-step="P3"');
        var last = u.done.P3 ? 'P3' : 'P2', dn = u.done[last];
        var with_ = reachedId(u, 'T1') ? 'With the guard' : doneTxt(dn, last === 'P3' ? 'Staged' : 'In holding');
        return cpill('done', u.id, 'pr-undo', nm, with_, ' data-step="' + last + '"');
      });
    },
    loading: function () {
      return '<p class="hint">Highlighted schools are on their way to loading.</p>' + list(function (u) {
        var nm = u.order + '. ' + u.name;
        if (!hasProps(u)) return cpill('none', u.id, '', nm, PROPS_NOTE[u.props], ' disabled');
        if (u.done.P5) return cpill('done', u.id, 'pr-undo', nm, doneTxt(u.done.P5, 'Loaded'), ' data-step="P5"');
        return cpill(u.done.P4 ? 'hot' : 'wait', u.id, 'pr-tap', nm, u.done.P4 ? 'Heading to loading since ' + clock(u.done.P4.at) : reachedId(u, 'T1') ? 'Performing / with the guard' : 'Not yet', ' data-step="P5"');
      });
    },
    inspect: function () {
      return '<p class="hint">Highlighted schools have equipment in inspection.</p>' + list(function (u) {
        var nm = u.order + '. ' + u.name;
        if (u.done.E1) return cpill('done', u.id, 'pr-undo', nm, doneTxt(u.done.E1, 'Complete'), ' data-step="E1"');
        return cpill(u.done.G5 ? 'hot' : 'wait', u.id, 'pr-tap', nm, u.done.G5 ? 'Dropped off ' + clock(u.done.G5.at) : 'Not dropped off yet' + (u.insp ? ' · due ' + hm(u.insp) : ''), ' data-step="E1"');
      });
    },
    door: function () {
      return '<p class="hint">Logging only: the show runs to the schedule.</p><div class="clist">' + S.b.units.map(function (u) {
        var p = function (id, label) { var dn = u.done[id]; return dn ? '<button class="tpill done" data-act="pr-undo" data-unit="' + u.id + '" data-step="' + id + '">' + label + ' ' + esc(clock(dn.at)) + '</button>' : '<button class="tpill" data-act="pr-tap" data-unit="' + u.id + '" data-step="' + id + '">' + label + '</button>'; };
        return '<div class="tile"><div class="th"><b>' + esc(u.order + '. ' + u.name) + '</b><span class="muted">' + esc(hm(u.perform)) + '</span></div><div class="tpills">' + p('T3', 'On floor') + p('T4', 'Off floor') + '</div></div>';
      }).join('') + '</div>';
    },
    checkin: function () {
      return '<div class="clist">' + S.b.units.map(function (u) {
        var g = u.done.G1, d = u.done.D1;
        return '<div class="tile"><div class="th"><b>' + esc(u.order + '. ' + u.name) + '</b><span class="muted">' + (u.perform ? 'perform ' + esc(hm(u.perform)) : '') + '</span></div>' +
          '<div class="whosub">Home room: ' + (u.hr ? esc(u.hr) : '<b>none yet</b>') + ' · ' + esc(hasProps(u) ? (current(u, ['Props']) ? 'props here ' + clock((u.done.P1 || current(u, ['Props'])).at) : u.propsSet ? 'props coming' : 'props: not asked yet') : PROPS_NOTE[u.props]) + '</div>' +
          '<div class="two">' + (g ? cpill('done', u.id, 'ci-undo', 'Unit check-in', doneTxt(g), ' data-step="G1"') : cpill('todo', u.id, 'ci-unit', 'Unit check-in', 'Guard is here')) +
          (d ? cpill('done', u.id, 'ci-undo', 'Director check-in', doneTxt(d), ' data-step="D1"') : cpill('todo', u.id, 'ci-dir', 'Director check-in', 'Director or delegate')) + '</div></div>';
      }).join('') + '</div>';
    },
    hr: function () {
      return areasCard(true) + '<div class="card"><h2>Assign</h2>' + S.b.units.map(function (u) {
        return '<div class="status-line"><div><div class="who">' + esc(u.order + '. ' + u.name) + '</div><div class="whosub">' + (u.done.G10 ? 'Cleared ' + esc(clock(u.done.G10.at)) : u.done.G3 ? 'In their home room' : u.done.G1 ? 'Checked in' : 'Not here yet') + '</div></div><div style="max-width:52%">' + hrSelect(u, 'hr-set') + '</div></div>';
      }).join('') + '</div>';
    },
    guide: function () { return guideScreen(); }
  };
  function hrSelect(u, cls) {
    var a = (S.b.areas || []).filter(function (x) { return x.home; });
    if (!a.length) return '<span class="whosub">No home rooms on the Areas tab yet.</span>';
    var rank = { available: 0, cleared: 0, assigned: 1, occupied: 2 };
    a = a.slice().sort(function (x, y) { return (rank[x.status] || 0) - (rank[y.status] || 0); });
    return '<select class="' + cls + '" data-unit="' + esc(u.id) + '"><option value="">' + (u.hr ? 'No home room' : 'Pick a home room…') + '</option>' + a.map(function (x) {
      var taken = (x.units || []).filter(function (y) { return y.id !== u.id; });
      return '<option value="' + esc(x.name) + '"' + (u.hr === x.name ? ' selected' : '') + '>' + esc(x.name + (taken.length ? ' (' + taken.map(function (y) { return y.name; }).join(', ') + ')' : x.status === 'cleared' ? ' (free again)' : '')) + '</option>';
    }).join('') + '</select>';
  }
  /* Guide: their guard's next step, big, with the scheduled time; the rest below (out of order is fine). */
  var GUIDE_STEPS = ['G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'T1', 'T2', 'T5', 'G8', 'G9', 'G10'];
  function guideSteps(u) { var scr = (S.b.screens || []).filter(function (s) { return s.key === 'guide'; })[0]; return (scr ? scr.steps : GUIDE_STEPS).filter(function (id) { return stepOf(id) && canTap(u, id); }); }
  function guideScreen() {
    var b = S.b, me = b.me, mine = (me.guiding || []).map(function (g) { return g.unitId; });
    var u = unitById(S.unit) || (mine.length === 1 ? unitById(mine[0]) : null);
    if (!u) {
      if (b.claim) return claimView(b);
      return '<p class="hint">Pick a guard.</p>' + list(function (x) { var c = current(x, ['Guard', 'Together']); return cpill('todo', x.id, 'g-open', x.order + '. ' + x.name, c ? c.s.name + ' ' + clock(c.at) : 'Not here yet'); });
    }
    var ids = guideSteps(u), next = ids.filter(function (id) { return !reachedId(u, id); })[0], st = status(u);
    var html = (mine.length !== 1 ? '<div class="nav2t"><button class="link" data-act="g-back">← All guards</button></div>' : '') +
      '<div class="card guide"><h2>Your guard</h2><div class="gname">' + esc(u.name) + '</div>' +
      '<div class="whosub">Perform <b>' + esc(hm(u.perform) || '—') + '</b>' + (u.area ? ' · Warm-up area <b>' + esc(u.area) + '</b>' : '') + ' · Home room <b>' + esc(u.hr || 'not assigned yet') + '</b></div>' +
      '<div class="whosub">Props: ' + esc(hasProps(u) ? (current(u, ['Props']) ? current(u, ['Props']).s.name + ' ' + clock(current(u, ['Props']).at) : 'not here yet') : PROPS_NOTE[u.props]) + ' · Inspection: ' + (u.done.E1 ? '✓ complete' : u.done.G5 ? 'in progress' : 'not dropped off') + '</div>' +
      (st.alerts.length ? '<div class="ualert">' + esc(st.alerts.join(' · ')) + '</div>' : '') +
      (next ? '<button class="bigstep" data-act="g-tap" data-unit="' + esc(u.id) + '" data-step="' + next + '"><span>' + esc(stepName(next)) + '</span><span class="sm2">' + (due(u, next) ? 'Scheduled ' + esc(due(u, next)) : 'Tap when it happens') + '</span></button>'
        : '<div class="banner ok" style="margin:12px 0 0">All done. Thank you!</div>') + '</div>' +
      '<div class="card"><h2>All steps</h2>' + ids.map(function (id) {
        var dn = u.done[id];
        return '<button class="stepbtn' + (dn ? ' done' : '') + '" data-act="' + (dn ? 'g-undo' : 'g-tap') + '" data-unit="' + esc(u.id) + '" data-step="' + id + '"><span>' + esc(stepName(id)) + '</span><span class="sm2">' + (dn ? '✓ ' + esc(doneTxt(dn)) : due(u, id) ? esc(due(u, id)) : '') + '</span></button>';
      }).join('') + '</div>' + guides(u);
    if (mine.length && me.kind === 'member') html += '<div class="card"><p style="margin:0" class="whosub">Need to hand this guard off? <button class="link" data-act="release">Hand off</button> and your coordinator or another guide picks them up.</p></div>';
    return html;
  }
  function claimView(b) {
    var ppl = b.claim.people, who = S.claimAs && ppl.some(function (p) { return p.personId === S.claimAs; }) ? S.claimAs : ppl[0].personId;
    var l = b.claim.units.slice().sort(function (a, c) { return (a.guide ? 2 : a.arrived ? 0 : 1) - (c.guide ? 2 : c.arrived ? 0 : 1) || a.order - c.order; });
    return '<div class="card"><h2>Pick your guard</h2><p class="muted" style="margin-top:0">No guard assigned to you yet. When yours checks in, claim them: you stay with them until their home room is cleared.</p>' +
      (ppl.length > 1 ? '<div class="tpills" style="margin:0 0 10px">' + ppl.map(function (p) { return '<button class="tpill' + (p.personId === who ? '' : ' alt') + '" data-act="claimas" data-pid="' + esc(p.personId) + '">' + esc(p.name) + '</button>'; }).join('') + '</div>' : '') +
      l.map(function (x) {
        var st = x.guide ? esc(x.guide) + ' has them' : x.arrived ? 'Checked in' : 'Not here yet';
        return '<div class="status-line"><div><div class="who">' + esc(x.order + '. ' + x.name) + '</div><div class="whosub">' + st + (x.perform ? ' · perform ' + esc(hm(x.perform)) : '') + '</div></div>' +
          (x.guide ? '' : '<button class="tpill" data-act="claim" data-unit="' + esc(x.id) + '" data-pid="' + esc(who) + '">Claim</button>') + '</div>';
      }).join('') + '</div>';
  }
  function escalate(me) {
    var e = me && me.escalate; if (!e) return '';
    if (e.name) return '<div class="card"><p class="muted" style="margin:0">Questions or problems? Your coordinator: <b>' + esc(e.name) + '</b>' + (e.phone ? ' · <a href="tel:' + tel(e.phone) + '">Call</a> · <a href="sms:' + tel(e.phone) + '">Text</a>' : '') + '</p></div>';
    return e.text ? '<div class="card"><p class="muted" style="margin:0">' + esc(e.text) + '</p></div>' : '';
  }

  // ---------- confirmation pop-ups
  function ask(o) { S.ask = o; render(); }
  function askBox() {
    var a = S.ask; if (!a) return '';
    return '<div class="askbg"><div class="askbox" role="dialog" aria-modal="true">' + (a.link ? '<button class="link asklink" data-act="asklink">' + esc(a.link.label) + '</button>' : '') + '<h3>' + esc(a.title) + '</h3>' + (a.html || '') +
      '<div class="askbtns">' + a.btns.map(function (x, i) { return '<button class="cbtn' + (x.alt ? ' alt' : '') + '" data-act="askbtn" data-i="' + i + '">' + esc(x.label) + '</button>'; }).join('') + '<button class="link" data-act="askcancel">Cancel</button></div></div></div>';
  }
  function val(id) { var el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; }
  function radio(name) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
  function noPropsLink(u) { return { label: 'No props/tarp crew', fn: function () { ask({ title: 'No props or tarp crew for ' + u.name + '?', html: '<p>The school greys out on every prop screen. You can put it back by tapping it.</p>', btns: [{ label: 'Yes, no props or tarp', fn: function () { send({ action: 'unitProps', unitId: u.id, props: 'none' }); } }] }); } }; }
  var VERB = { P1: ['Check in {u} props?', 'This will mark the props for {u} as not arrived.'], P2: ['{u} props in holding?', 'This will mark the props for {u} as not in holding.'], P3: ['{u} props staged at warm-up?', 'This will mark the props for {u} as not staged.'],
    P5: ['Mark {u} props loaded?', 'This will mark the props for {u} as not loaded.'], E1: ['{u}: inspection complete?', 'This will mark {u}\'s inspection as not complete.'], T3: ['{u} on the floor?', 'This will clear {u}\'s on-floor time.'], T4: ['{u} off the floor?', 'This will clear {u}\'s off-floor time.'],
    G1: ['', 'This will mark {u}\'s guard as not checked in.'], D1: ['', 'This will mark {u}\'s director as not checked in.'] };
  function say(s, u) { return s.replace(/\{u\}/g, u.name); }
  function tapStep(u, id) {
    var v = VERB[id] || ['Mark ' + stepName(id) + ' for {u}?'], link = (id === 'P1' || id === 'P2' || id === 'P3') ? noPropsLink(u) : null;
    ask({ title: say(v[0], u), btns: [{ label: 'Yes', fn: function () { send({ action: 'unitMark', unitId: u.id, stepId: id }); } }], link: link });
  }
  function undoStep(u, id) {
    var dn = u.done[id]; if (!dn) return;
    var v = VERB[id] || ['', 'This will take back ' + stepName(id) + ' for {u}.'];
    ask({ title: 'Take it back?', html: '<p>' + esc(say(v[1], u)) + '</p>', btns: [{ label: 'Yes, take it back', fn: function () {
      if (dn.pending) { setQ(getQ().filter(function (x) { return x.tapId !== dn.tap; })); S.ask = null; load(); }
      else send({ action: 'unitUndo', logIds: [dn.log] });
    } }] });
  }
  function hrPicker(u) { return u.hr ? '<p>Home room: <b>' + esc(u.hr) + '</b></p>' : '<label for="hrsel">Home room</label>' + hrSelect(u, 'hrsel').replace('<select ', '<select id="hrsel" '); }
  function checkUnit(u) {
    ask({ title: 'Check in ' + u.name + '?', html: hrPicker(u), btns: [{ label: 'Check in the guard', fn: function () { send({ action: 'unitMark', unitId: u.id, stepId: 'G1', hr: val('hrsel') || '' }); } }] });
  }
  /* Director check-in: tells the director where their props are (or asks), and checks the guard in too if it's with them. */
  function checkDirector(u) {
    var h = '';
    var pc = current(u, ['Props']);
    if (pc) h += '<p class="say">Your prop/tarp crew is already here (' + esc(pc.s.name.replace(/^Props /, '').toLowerCase()) + ' ' + esc(clock(pc.at)) + ').</p>';
    else if (!hasProps(u)) h += '<p class="say">On file: ' + esc(PROPS_NOTE[u.props].toLowerCase()) + '.</p>';
    else h += '<p class="say">Ask: do you have a prop/tarp crew today?</p><div class="radios"><label><input type="radio" name="pq" value="separate"> Yes</label><label><input type="radio" name="pq" value="guard"> Just a tarp, with the guard</label><label><input type="radio" name="pq" value="none"> No</label></div>';
    if (u.done.G1) h += '<p class="say">Guard checked in ' + esc(clock(u.done.G1.at)) + '.</p>';
    else h += '<p class="say">Ask: is your guard with you?</p><label class="chkline"><input type="checkbox" id="gw" data-act="gw"> Yes, check the guard in too</label><div id="hrwrap" hidden>' + hrPicker(u) + '</div>';
    ask({ title: 'Director check-in: ' + u.name, html: h, btns: [{ label: 'Check in the director', fn: function () {
      var gw = !u.done.G1 && val('gw'), pq = radio('pq');
      send({ action: 'unitMark', unitId: u.id, stepId: 'D1', also: gw ? ['G1'] : [], hr: gw ? val('hrsel') || '' : '', props: pq || '' });
    } }] });
  }
  function guideTap(u, id) {
    var ids = guideSteps(u), before = ids.slice(0, ids.indexOf(id)).filter(function (x) { return !reachedId(u, x); }), warn = '';
    if (id === 'G7' && !u.done.E1) warn = 'Inspection isn\'t marked complete yet. That\'s OK: HQ just sees a flag.';
    if (id === 'T1' && hasProps(u) && !reachedId(u, 'P3')) warn = 'The props aren\'t marked staged yet. Meet up with the prop crew if they\'re there.';
    var h = (warn ? '<p class="say warn">' + esc(warn) + '</p>' : '') + (before.length ? '<label class="chkline"><input type="checkbox" id="fill" checked> Also mark ' + esc(before.map(stepName).join(', ')) + '</label>' : '');
    ask({ title: stepName(id) + '?', html: h, btns: [{ label: 'Yes', fn: function () { send({ action: 'unitMark', unitId: u.id, stepId: id, fill: before.length && val('fill') ? before : [] }); } }] });
  }

  function render() { if (!S.b) return renderSignIn(); MODE === 'track' ? renderTrack() : renderBoard(); }
  var timer = null;
  function load() {
    return call({ action: 'board' }).then(function (r) {
      if (r.error) { if (r.net && S.b) { S.offline = true; render(); return; } if (r.signIn) { S.b = null; } S.msg = { kind: 'err', text: r.error }; render(); return; }
      S.offline = false; S.skew = r.now - Date.now(); S.b = r; if (S.msg && S.msg.kind !== 'ok' && S.msg.kind !== 'warn') S.msg = null;
      if (!PUB) getQ().forEach(applyOpt);   // taps not sent yet still show
      if (S.track) put(P + 'sosTrack', S.track); if (S.ucode) put(P + 'sosUnitCode', S.ucode);
      if (MODE === 'track' && location.hash) { var h = location.hash.slice(1).split(':'); if (h[1]) { S.screen = h[0]; S.unit = h[1]; } else S.unit = h[0]; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
      if (!S.ask) render();
      if (getQ().length) flush();
      if (!timer) timer = setInterval(function () { if (!document.hidden && !S.ask && !document.querySelector('select:focus')) load(); }, (r.refresh || 20) * 1000);
    });
  }
  setInterval(function () { var c = document.getElementById('clk'); if (c) c.textContent = clock(now()); }, 1000);
  window.addEventListener('online', function () { flush(); });
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.classList.contains('hr-set')) { var u = unitById(t.getAttribute('data-unit')); if (u) send({ action: 'unitHR', unitId: u.id, area: t.value }); }
    if (t.id === 'gw') { var w = document.getElementById('hrwrap'); if (w) w.hidden = !t.checked; }
  });
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), u = b.getAttribute('data-unit') ? unitById(b.getAttribute('data-unit')) : null, step = b.getAttribute('data-step');
    if (act === 'gw') return;
    if (act === 'screen') { S.screen = b.getAttribute('data-k'); put(P + 'sosScreen', S.screen); S.unit = ''; S.undo = null; render(); window.scrollTo(0, 0); }
    else if (act === 'pr-tap' && u) tapStep(u, step);
    else if ((act === 'pr-undo' || act === 'ci-undo' || act === 'g-undo') && u) undoStep(u, step);
    else if (act === 'pr-restore' && u) ask({ title: 'Put ' + u.name + ' back on the props list?', html: '<p>Use this if they do have props or a tarp after all.</p>', btns: [{ label: 'Yes, props coming', fn: function () { send({ action: 'unitProps', unitId: u.id, props: 'separate' }); } }] });
    else if (act === 'ci-unit' && u) checkUnit(u);
    else if (act === 'ci-dir' && u) checkDirector(u);
    else if (act === 'g-tap' && u) guideTap(u, step);
    else if (act === 'g-open') { S.unit = b.getAttribute('data-unit'); render(); window.scrollTo(0, 0); }
    else if (act === 'g-back') { S.unit = ''; render(); }
    else if (act === 'askbtn') { var x = S.ask && S.ask.btns[+b.getAttribute('data-i')]; if (x) x.fn(); }
    else if (act === 'asklink') { if (S.ask && S.ask.link) S.ask.link.fn(); }
    else if (act === 'askcancel') { S.ask = null; render(); }
    else if (act === 'claimas') { S.claimAs = b.getAttribute('data-pid'); render(); }
    else if (act === 'claim') { b.disabled = true; call({ action: 'unitClaim', unitId: b.getAttribute('data-unit'), personId: b.getAttribute('data-pid') }).then(function (r) { S.msg = r.error ? { kind: 'err', text: r.error } : { kind: 'ok', text: 'You have ' + r.unit + '. Stay with them until their home room is cleared.' }; load(); }); }
    else if (act === 'release') { ask({ title: 'Hand off this guard?', html: '<p>They go back to the pool so your coordinator or another guide can pick them up. Tell your coordinator.</p>', btns: [{ label: 'Hand off', fn: function () { S.ask = null; call({ action: 'unitRelease' }).then(function (r) { S.msg = r.error ? { kind: 'err', text: r.error } : { kind: 'ok', text: 'Handed off.' }; S.unit = ''; load(); }); } }] }); }
    else if (act === 'undo') { b.disabled = true; send({ action: 'unitUndo', logIds: b.getAttribute('data-id').split(',') }); S.undo = null; }
    else if (act === 'out') { put(P + 'sosTrack', ''); put(P + 'sosUnitCode', ''); put(P + 'sosAdminTok', '', true); S.track = S.ucode = S.token = S.fam = S.lead = ''; S.b = null; render(); }
  });

  if (PUB) { call({ action: 'config' }).then(function (r) { if (!r.error) S.cfg = r; load(); }); return; }
  var q = location.search;
  S.track = ((q.match(/[?&]t=([A-Za-z0-9]+)/) || [])[1] || get(P + 'sosTrack')).toUpperCase();
  S.ucode = ((q.match(/[?&]unit=([A-Za-z0-9]+)/) || [])[1] || (S.track ? '' : get(P + 'sosUnitCode'))).toUpperCase();
  S.token = get(P + 'sosAdminTok', true);
  if (!S.track && !S.ucode && !S.token) { S.fam = get(P + 'sosCode'); S.lead = get(P + 'sosLead'); }   // signed in on the family or point-person page (remembered all day)
  var AS = window.sosActAs ? sosActAs(['fam', 'guide', 'track', 'unit', 'lead']) : null;   // admin acting as someone: this tab only, not as the admin
  if (AS) { S.track = AS.kind === 'track' ? AS.code : ''; S.ucode = AS.kind === 'unit' ? AS.code : ''; S.token = ''; S.fam = AS.kind === 'guide' || AS.kind === 'fam' ? AS.code : ''; S.lead = AS.kind === 'lead' ? AS.code : '';
    var put0 = put; put = function (k, v, ss) { if (/sos(Track|UnitCode|AdminTok)$/.test(k)) return; put0(k, v, ss); }; }
  if (/[?&](t|unit)=/.test(q)) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {} }
  call({ action: 'config' }).then(function (r) { if (!r.error) S.cfg = r; if (S.track || S.ucode || S.token || S.fam || S.lead) load(); else render(); });
})();
