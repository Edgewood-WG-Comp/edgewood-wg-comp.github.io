/* SOS Crew – unit board (board.html, TV/tablet) and unit tracker (track.html, phones).
 * Copyright (c) 2026 NE Prints & Design, LLC. All rights reserved.
 * Who: admins (Google) update anything; spotters see; trackers by link (?t=CODE) or Google, limited to their steps;
 * directors by their unit link (?unit=CODE) see their unit and the one before. Polls every 15 s (the server caches). */
(function () {
  'use strict';
  var C = window.SOS || {}, API = C.API, app = document.getElementById('app'), MODE = document.body.getAttribute('data-mode') || 'board';
  var P = C.ENV === 'LIVE' ? '' : 'sbx_';
  var S = { b: null, msg: null, unit: '', undo: null, skew: 0, cfg: null, track: '', ucode: '', token: '', fam: '', lead: '' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function get(k, ss) { try { return (ss ? sessionStorage : localStorage).getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v, ss) { try { var st = ss ? sessionStorage : localStorage; v ? st.setItem(k, v) : st.removeItem(k); } catch (e) {} }
  function tel(p) { var d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '+1' + d : d; }
  function call(d) {
    if (!API) return Promise.resolve({ error: 'This site is not connected yet.' });
    d.trackCode = S.track; d.unitCode = S.ucode; d.idToken = S.token; d.famCode = S.fam; d.leadCode = S.lead;   // family/lead codes: group volunteers and their leads
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
  var TRACK_LABEL = { Director: 'Director / delegate', Guard: 'Guard', Props: 'Props / tarp', Together: 'Guard + props together' };
  function tracks() { var t = ['Director', 'Guard', 'Props', 'Together']; S.b.steps.forEach(function (s) { if (t.indexOf(s.track) < 0) t.push(s.track); }); return t; }
  /* Tracker sections in the order things happen: before (by track), together, after the performance (by track). */
  function sections(steps) {
    var tog = steps.filter(function (s) { return s.track === 'Together'; }), first = tog.length ? tog[0].order : Infinity, last = tog.length ? tog[tog.length - 1].order : Infinity, out = [];
    function add(list, pre) { tracks().forEach(function (tr) { var l = list.filter(function (s) { return s.track === tr; }); if (l.length) out.push({ label: pre + (TRACK_LABEL[tr] || tr), list: l }); }); }
    add(steps.filter(function (s) { return s.track !== 'Together' && s.order < first; }), '');
    if (tog.length) out.push({ label: TRACK_LABEL.Together, list: tog });
    add(steps.filter(function (s) { return s.track !== 'Together' && s.order > last; }), 'After · ');
    return out;
  }
  function stepById(id) { return S.b.steps.filter(function (s) { return s.id === id; })[0] || null; }
  function reachedId(u, id) {   // this step, or any later step on the same track or the together track
    var t = stepById(id); if (!t) return false;
    return Object.keys(u.done).some(function (k) { var s = stepOf(k); return s && (s.track === t.track || s.track === 'Together') && s.order >= t.order; });
  }
  /* Alerts go by step ID (names can be edited): D1 checked in, G3 to warm-up, G5 in warm-up, P3 props in holding, P5 props at the
   * meet-up, T1 to the gym, T3 performing, T4 performed, G8 left the building, G9 homeroom clear. */
  function status(u) {
    var t = now(), g = current(u, ['Guard', 'Together']), p = current(u, ['Props', 'Together']), d = current(u, ['Director']), alerts = [], level = 0;
    var ci = at(u.checkin), wu = at(u.warmup), pf = at(u.perform), finished = reachedId(u, 'T4');
    function flag(due, ok, what, early) { if (!due || ok || finished) return; if (t >= due) { alerts.push(what + ' late'); level = Math.max(level, 2); } else if (t >= due - early * 60000) { alerts.push(what + ' due ' + clock(due)); level = Math.max(level, 1); } }
    flag(ci, !!u.done.D1, 'Director check-in', 10);
    flag(wu && wu - 5 * 60000, reachedId(u, 'G3'), 'Guard to warm-up', 10);
    flag(wu, reachedId(u, 'G5'), 'Guard in warm-up', 10);
    if (hasProps(u)) { flag(wu, reachedId(u, 'P3'), 'Props in holding', 15); flag(pf && pf - 10 * 60000, reachedId(u, 'P5'), 'Props at meet-up', 10); }
    flag(pf, reachedId(u, 'T1'), 'To the gym', 5);
    if (u.done.G8 && !u.done.G9) { alerts.push('Guard left – homeroom NOT cleared'); level = 2; }
    var performing = !!u.done.T3 && !finished;
    return { g: g, p: p, d: d, alerts: alerts, level: level, finished: finished, performing: performing };
  }
  /* Props: 'separate' (tracked on their own), 'none' (no props or tarp), 'guard' (tarp travels with the guard). */
  function firstDirector() { var d = S.b.steps.filter(function (s) { return s.track === 'Director'; }); return d.length ? d[0].id : ''; }
  function hasProps(u) { return !u.props || u.props === 'separate'; }
  var PROPS_NOTE = { none: 'No props or tarp', guard: 'Tarp travels with the guard', separate: 'Props / tarp coming in' };
  /* Steps before this one (same track, or guard and props for a together step) that nobody tapped. */
  function skippedBefore(u, step) {
    var t = stepById(step); if (!t || t.track === 'Director') return [];
    var tr = t.track === 'Together' ? ['Guard', 'Props', 'Together'] : [t.track, 'Together'];
    if (!hasProps(u)) tr = tr.filter(function (x) { return x !== 'Props'; });
    return S.b.steps.filter(function (s) { return tr.indexOf(s.track) >= 0 && s.order < t.order && !reachedId(u, s.id); });
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
  function footer() { return '<footer>' + (MODE === 'track' ? (S.b && !S.b.me.view ? '' : '<a href="board.html">Live board</a> · ') : '<a href="track.html">Tracker</a> · ') + '<a href="help/contest-day/' + (MODE === 'track' ? 'unit-tracker' : 'live-board') + '/">Help</a> · <a href="./">Volunteer signup</a>' + (S.track || S.token ? ' · <button class="link" data-act="out">Sign out</button>' : '') + ' · <button class="link" data-theme-toggle>Theme: ' + (window.sosTheme ? sosTheme.label() : 'Auto') + '</button><span class="legal">© 2026 NE Prints &amp; Design, LLC. All rights reserved.</span></footer>'; }
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
      var u = r.u, st = r.st, cls = st.level === 2 ? 'red' : st.finished ? 'fin' : st.performing ? 'perf' : st.level === 2 ? 'red' : st.level === 1 ? 'amber' : '';
      var tog = st.g && st.p && st.g.s === st.p.s ? st.g : null;   // guard and props are together right now
      return '<div class="ucard ' + cls + (me.own === u.id ? ' own' : '') + '"><div class="uh"><div><span class="uo">' + esc(u.order) + '</span> <b class="un">' + esc(u.name) + '</b>' + (u.cls ? ' <span class="muted">' + esc(u.cls) + '</span>' : '') + (me.own === u.id ? ' <span class="pill done">You</span>' : '') + '</div>' +
        '<div class="ut">' + (u.warmup ? 'Warm-up ' + esc(hm(u.warmup)) : '') + (u.perform ? ' · Perform <b>' + esc(hm(u.perform)) + '</b>' : '') + '</div></div>' +
        (tog ? '<div class="chips2">' + chip(tog, 'Unit') + '</div>' : '<div class="chips2">' + chip(st.g, 'Guard') + (hasProps(u) ? chip(st.p, 'Props / tarp') : '<div class="chipst none"><div class="cs1">Props / tarp</div><div class="cs2">' + esc(PROPS_NOTE[u.props]) + '</div></div>') + '</div>') +
        (st.alerts.length ? '<div class="ualert">' + esc(st.alerts.join(' · ')) + '</div>' : '') + guides(u) +
        (me.kind !== 'director' ? '<div class="whosub">Director' + (u.director ? ': ' + esc(u.director) : '') + ' · ' + (st.d ? '✓ ' + esc(st.d.s.id === 'D1' ? 'checked in' : st.d.s.name) + ' ' + esc(clock(st.d.at)) : 'not checked in') + (u.phone ? ' · <a href="tel:' + tel(u.phone) + '">Call</a> · <a href="sms:' + tel(u.phone) + '">Text</a>' : '') + '</div>' : '') +
        (me.steps.length && MODE === 'board' ? '<div style="margin-top:6px"><a class="cbtn alt" href="track.html#' + esc(u.id) + '">Update</a></div>' : '') + '</div>';
    }).join('') + '</div>';
    if (!me.contact && me.kind !== 'director' && b.escalate) html += '<div class="card"><p class="muted">' + esc(b.escalate) + '</p></div>';
    app.innerHTML = html + footer();
  }

  // ---------- tracker
  function renderTrack() {
    var b = S.b, me = b.me;
    if (!me.steps.length && !b.claim) { app.innerHTML = header(me.name) + '<div class="card"><p class="muted">' + esc(me.note || (me.view ? 'Your account can see the board but can\'t update steps.' : 'Nothing to update right now.')) + '</p>' + (me.view ? '<a class="cbtn alt" href="board.html">Open the live board</a>' : '') + '</div>' + escalate(me) + footer(); return; }
    var html = header(b.claim && !me.steps.length ? me.name + ' · homeroom guide' : me.name + ' · can update ' + (me.steps.length === b.steps.length ? 'every step' : me.steps.length + ' step' + (me.steps.length > 1 ? 's' : '')) + (me.scope && b.units.length === 1 ? ' for ' + b.units[0].name : '')) + banner() + (me.note ? '<div class="banner warn">' + esc(me.note) + '</div>' : '');
    if (S.undo) html += '<div class="banner ok">' + esc(S.undo.text) + ' <button class="link" data-act="undo" data-id="' + esc(S.undo.logIds.join(',')) + '">Undo</button></div>';
    var u = b.units.filter(function (x) { return x.id === S.unit; })[0];
    if (b.claim) html += claimView(b);
    if (!u && (me.guiding || []).length) html += '<div class="card"><p style="margin:0">You\'re guiding <b>' + esc(me.guiding.map(function (g) { return g.unit; }).join(', ')) + '</b> today. Stay with them all day. <button class="link" data-act="release">Not your guard?</button></p></div>';
    if (!u) { if (b.units.length) html += tiles(b, me); }
    else html += '<div class="nav2t"><button class="link" data-act="back">← All guards</button></div>';
    if (u) {
      var st = status(u);
      html += '<div class="card"><h2>' + esc(u.name) + (u.perform ? ' · perform ' + esc(hm(u.perform)) : '') + '</h2>' + (st.alerts.length ? '<div class="ualert">' + esc(st.alerts.join(' · ')) + '</div>' : '') + guides(u) + (hasProps(u) ? '' : '<div class="whosub" style="margin:6px 0"><b>' + esc(PROPS_NOTE[u.props]) + '.</b> Props steps not already tapped are hidden for this guard. (Admins can change this under Units.)</div>') +
        sections(b.steps.filter(function (s) { return hasProps(u) || s.track !== 'Props' || u.done[s.id]; })).map(function (sec) {
          return '<div class="trk"><div class="kicker">' + esc(sec.label) + '</div>' + sec.list.map(function (s) {
            var d = u.done[s.id], can = me.steps.indexOf(s.id) >= 0 && (!me.scope || me.scope[s.id] === 'all' || (me.scope[s.id] || []).indexOf(u.id) >= 0);
            return '<button class="stepbtn' + (d ? ' done' : '') + '" data-act="mark" data-step="' + esc(s.id) + '"' + (can && !d ? '' : ' disabled') + '><span>' + esc(s.name) + '</span><span class="sm2">' + (d ? '✓ ' + esc(clock(d.at)) + (d.by ? ' · ' + esc(d.by) : '') : can ? 'Tap when it happens' : '') + '</span></button>';
          }).join('') + '</div>';
        }).join('') + '</div>';
    }
    app.innerHTML = html + ask() + escalate(me) + footer();
  }
  /* List view: a tile per guard with where things stand and a pill for the next step this person taps. */
  function canTap(me, u, id) { return me.steps.indexOf(id) >= 0 && (!me.scope || me.scope[id] === 'all' || (me.scope[id] || []).indexOf(u.id) >= 0); }
  function nextFor(me, u) {   // per track: the first step this person can tap that hasn't happened yet
    var out = [];
    ['Director', 'Guard', 'Props', 'Together'].forEach(function (tr) {
      if (tr === 'Props' && !hasProps(u)) return;
      var mine = S.b.steps.filter(function (s) { return s.track === tr && canTap(me, u, s.id); });
      if (!mine.length) return;
      var nx = mine.filter(function (s) { return tr === 'Director' ? !u.done[s.id] : !reachedId(u, s.id); })[0];
      out.push(nx ? { s: nx, todo: true } : { s: mine[mine.length - 1], todo: false, d: u.done[mine[mine.length - 1].id] });
    });
    return out;
  }
  function line(label, cur, empty) { return '<div class="tl"><span class="tlk">' + label + '</span> ' + (cur ? esc(cur.s.id === firstDirector() ? 'Checked in' : cur.s.name) + ' <span class="muted">' + esc(clock(cur.at)) + '</span>' : '<span class="muted">' + esc(empty) + '</span>') + '</div>'; }
  function tile(u, me) {
    var st = status(u), nx = nextFor(me, u), tog = st.g && st.p && st.g.s === st.p.s ? st.g : null;
    var pills = nx.map(function (n) {
      return n.todo ? '<button class="tpill" data-act="mark" data-unit="' + esc(u.id) + '" data-step="' + esc(n.s.id) + '">' + esc(n.s.id === firstDirector() ? 'Check in director' : n.s.name) + '</button>'
        : '<span class="tpill done">✓ ' + esc(n.s.name) + '</span>';
    }).join('');
    return '<div class="tile' + (st.level === 2 ? ' red' : st.level === 1 ? ' amber' : '') + '" data-act="open" data-unit="' + esc(u.id) + '">' +
      '<div class="th"><b>' + esc(u.order + '. ' + u.name) + '</b>' + (u.perform ? '<span class="muted">perform ' + esc(hm(u.perform)) + '</span>' : '') + '</div>' +
      (st.alerts.length ? '<div class="ualert">' + esc(st.alerts.join(' · ')) + '</div>' : '') +
      line('Director', st.d, 'not checked in') + ((u.guides || []).length ? '<div class="tl"><span class="tlk">Guide</span> ' + esc(u.guides.map(function (g) { return g.name; }).join(', ')) + '</div>' : '') +
      (tog ? line('Guard + props', tog, '') : line('Guard', st.g, 'not here yet') + (hasProps(u) ? line('Props', st.p, 'not here yet') : '<div class="tl"><span class="tlk">Props</span> <span class="muted">' + esc(PROPS_NOTE[u.props]) + '</span></div>')) +
      '<div class="tpills">' + pills + '</div></div>';
  }
  /* Homeroom guides without a guard yet: pick from the guards (one guide per guard). */
  function claimView(b) {
    var ppl = b.claim.people, who = S.claimAs && ppl.some(function (p) { return p.personId === S.claimAs; }) ? S.claimAs : ppl[0].personId;
    var list = b.claim.units.slice().sort(function (a, c) { return (a.guide ? 2 : a.arrived ? 0 : 1) - (c.guide ? 2 : c.arrived ? 0 : 1) || a.order - c.order; });
    return '<div class="card"><h2>Pick your guard</h2><p class="muted" style="margin-top:0">When your guard arrives, claim them. You stay with them all day, and they show up as your guard for everyone else.</p>' +
      (ppl.length > 1 ? '<div class="tpills" style="margin:0 0 10px">' + ppl.map(function (p) { return '<button class="tpill' + (p.personId === who ? '' : ' alt') + '" data-act="claimas" data-pid="' + esc(p.personId) + '">' + esc(p.name) + '</button>'; }).join('') + '</div>' : '') +
      list.map(function (x) {
        var st = x.guide ? esc(x.guide) + ' has them' : x.arrived ? 'Here' : 'Not here yet';
        return '<div class="status-line"><div><div class="who">' + esc(x.order + '. ' + x.name) + '</div><div class="whosub">' + st + (x.perform ? ' · perform ' + esc(hm(x.perform)) : '') + '</div></div>' +
          (x.guide ? '' : '<button class="tpill" data-act="claim" data-unit="' + esc(x.id) + '" data-pid="' + esc(who) + '">Claim</button>') + '</div>';
      }).join('') + '</div>';
  }
  function tiles(b, me) {
    var rows = b.units.map(function (u) { var nx = nextFor(me, u); return { u: u, todo: nx.some(function (n) { return n.todo; }) }; });
    var todo = rows.filter(function (r) { return r.todo; }), done = rows.filter(function (r) { return !r.todo; });
    if (!rows.length) return '<div class="card"><p class="muted">No guards yet.</p></div>';
    return '<div class="tiles">' + todo.map(function (r) { return tile(r.u, me); }).join('') + '</div>' +
      (done.length ? '<details class="donebox"' + (todo.length ? '' : ' open') + '><summary>Done for you · ' + done.length + '</summary><div class="tiles">' + done.map(function (r) { return tile(r.u, me); }).join('') + '</div></details>' : '');
  }
  /* Homeroom guides on this unit (admins and coordinators get them from the server; nobody else does). */
  function guides(u) {
    return (u.guides || []).map(function (g) { return '<div class="whosub">Guide: ' + esc(g.name) + ' <span class="muted">' + esc(g.when) + '</span>' + (g.phone ? ' · <a href="tel:' + tel(g.phone) + '">Call</a> · <a href="sms:' + tel(g.phone) + '">Text</a>' : ' · no phone') + '</div>'; }).join('');
  }
  /* "You skipped something" question, shown before a tap goes through. */
  function ask() {
    var a = S.ask; if (!a) return '';
    var names = function (l) { return l.map(function (s) { return s.name; }).join(', '); };
    var body, btns;
    if (a.kind === 'checkin-props') {
      body = '<h3>Tell the director</h3><p>Your props/tarp ' + esc(a.info.say) + ' (since ' + esc(clock(a.info.at)) + ').</p>';
      btns = '<button class="cbtn" data-act="askjust">Got it: check them in</button>';
    } else if (a.kind === 'checkin-ask') {
      body = '<h3>Does this guard have props or a tarp?</h3><p>Ask the director while you check them in.</p>';
      btns = '<button class="cbtn" data-act="askcheck" data-mode="separate">Yes: props and/or tarp coming in</button>' +
        '<button class="cbtn alt" data-act="askcheck" data-mode="guard">Just a tarp, traveling with the guard</button>' +
        '<button class="cbtn alt" data-act="askcheck" data-mode="none">No props or tarp</button>' +
        '<button class="cbtn alt" data-act="askjust">Not sure yet</button>';
    } else if (a.props.length) {
      body = '<h3>Are the guard and props/tarp moving together?</h3><p>The props/tarp weren\'t marked: <b>' + esc(names(a.props)) + '</b>.' + (a.guard.length ? ' Guard steps not marked: <b>' + esc(names(a.guard)) + '</b>; they\'ll be marked too.' : '') + '</p>';
      btns = '<button class="cbtn" data-act="askall">Yes, together: mark the props steps done</button>' +
        (a.anyProps ? '' : '<button class="cbtn alt" data-act="askmode" data-mode="none">This guard has no props or tarp</button>') +
        '<button class="cbtn alt" data-act="askmode" data-mode="guard">The tarp is traveling with the guard</button>';
    } else {
      body = '<h3>Mark the skipped steps too?</h3><p>These weren\'t marked: <b>' + esc(names(a.guard)) + '</b>.</p>';
      btns = '<button class="cbtn" data-act="askall">Yes, they happened: mark them too</button><button class="cbtn alt" data-act="askjust">Just this step</button>';
    }
    return '<div class="askbg"><div class="askbox" role="dialog" aria-modal="true">' + body + '<div class="askbtns">' + btns + '<button class="link" data-act="askcancel">Cancel</button></div></div></div>';
  }
  /* Director check-in: tell the director where their props are, or ask whether the guard has props at all. */
  var PROPS_SAY = { P1: 'have arrived and are being unloaded at the prop door', P2: 'are checked in', P3: 'are in the holding area', P4: 'are on their way to meet the guard', P5: 'are at the meet-up spot', P6: 'are already out of the building' };
  function propsNow(u) { var c = current(u, ['Props']); return c ? { say: PROPS_SAY[c.s.id] || ('are at: ' + c.s.name), at: c.at } : null; }
  function mark(step, fill, props, uid) {
    uid = uid || (S.ask && S.ask.unit) || S.unit;
    S.ask = null; render();
    var un = S.b.units.filter(function (x) { return x.id === uid; })[0];
    call({ action: 'unitMark', unitId: uid, stepId: step, fill: fill || [], props: props || '' }).then(function (r) {
      if (r.error) S.msg = { kind: 'err', text: r.error };
      else { S.msg = null; var n = (r.logIds || [r.logId]).length; S.undo = { logIds: r.logIds || [r.logId], text: (S.unit ? '' : (un ? un.name + ': ' : '')) + (stepOf(step) || {}).name + ' ✓' + (n > 1 ? ' (and ' + (n - 1) + ' skipped step' + (n > 2 ? 's' : '') + ')' : '') + (props ? ' · ' + PROPS_NOTE[props] : '') }; }
      load();
    });
  }
  /* Who to go to: a group member's lead, else the Director escalation text. Never a director's number. */
  function escalate(me) {
    var e = me && me.escalate; if (!e) return '';
    if (e.name) return '<div class="card"><p class="muted" style="margin:0">Questions or problems? Your coordinator: <b>' + esc(e.name) + '</b>' + (e.phone ? ' · <a href="tel:' + tel(e.phone) + '">Call</a> · <a href="sms:' + tel(e.phone) + '">Text</a>' : '') + '</p></div>';
    return e.text ? '<div class="card"><p class="muted" style="margin:0">' + esc(e.text) + '</p></div>' : '';
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
      var uid = b.getAttribute('data-unit') || S.unit, step = b.getAttribute('data-step'), un = S.b.units.filter(function (x) { return x.id === uid; })[0];
      if (un && stepById(step) && stepById(step).track === 'Director' && step === firstDirector()) {
        var pn = propsNow(un);
        if (pn) { S.ask = { kind: 'checkin-props', unit: uid, step: step, info: pn, props: [], guard: [] }; return render(); }
        if (!un.propsSet) { S.ask = { kind: 'checkin-ask', unit: uid, step: step, props: [], guard: [] }; return render(); }
      }
      var sk = un ? skippedBefore(un, step) : [];
      if (S.b.me.scope) sk = sk.filter(function (s) { return canTap(S.b.me, un, s.id); });   // guides: only their own steps
      if (sk.length) {
        var t = stepById(step), pr = sk.filter(function (s) { return s.track === 'Props'; });
        S.ask = { unit: uid, step: step, props: t.track === 'Together' ? pr : [], guard: t.track === 'Together' ? sk.filter(function (s) { return s.track !== 'Props'; }) : sk,
          anyProps: S.b.steps.some(function (s) { return s.track === 'Props' && un.done[s.id]; }) };
        if (!S.ask.props.length && !S.ask.guard.length) { S.ask = null; return mark(step, null, null, uid); }
        return render();
      }
      b.disabled = true; mark(step, null, null, uid);
    } else if (act === 'askall') { var a1 = S.ask; mark(a1.step, a1.props.concat(a1.guard).map(function (s) { return s.id; })); }
    else if (act === 'askjust') { mark(S.ask.step); }
    else if (act === 'askcheck') { mark(S.ask.step, [], b.getAttribute('data-mode')); }
    else if (act === 'askmode') { var a2 = S.ask; mark(a2.step, a2.guard.map(function (s) { return s.id; }), b.getAttribute('data-mode')); }
    else if (act === 'open') { S.unit = b.getAttribute('data-unit'); S.undo = null; try { history.replaceState(null, '', '#' + S.unit); } catch (x) {} render(); window.scrollTo(0, 0); }
    else if (act === 'back') { S.unit = ''; S.undo = null; try { history.replaceState(null, '', location.pathname + location.search); } catch (x) {} render(); }
    else if (act === 'claimas') { S.claimAs = b.getAttribute('data-pid'); render(); }
    else if (act === 'claim') { b.disabled = true; call({ action: 'unitClaim', unitId: b.getAttribute('data-unit'), personId: b.getAttribute('data-pid') }).then(function (r) { S.msg = r.error ? { kind: 'err', text: r.error } : { kind: 'ok', text: 'Claimed ' + r.unit + '.' }; load(); }); }
    else if (act === 'release') { if (!confirm('Let go of this guard? Another guide can claim them.')) return; call({ action: 'unitRelease' }).then(function (r) { S.msg = r.error ? { kind: 'err', text: r.error } : { kind: 'ok', text: 'Released. Pick your guard.' }; S.unit = ''; load(); }); }
    else if (act === 'askcancel') { S.ask = null; render(); }
    else if (act === 'undo') { b.disabled = true; call({ action: 'unitUndo', logIds: b.getAttribute('data-id').split(',') }).then(function (r) { S.undo = null; S.msg = r.error ? { kind: 'err', text: r.error } : { kind: 'ok', text: 'Undone.' }; load(); }); }
    else if (act === 'out') { put(P + 'sosTrack', ''); put(P + 'sosUnitCode', ''); put(P + 'sosAdminTok', '', true); S.track = S.ucode = S.token = S.fam = S.lead = ''; S.b = null; render(); }
  });

  var q = location.search;
  S.track = ((q.match(/[?&]t=([A-Za-z0-9]+)/) || [])[1] || get(P + 'sosTrack')).toUpperCase();
  S.ucode = ((q.match(/[?&]unit=([A-Za-z0-9]+)/) || [])[1] || (S.track ? '' : get(P + 'sosUnitCode'))).toUpperCase();
  S.token = get(P + 'sosAdminTok', true);
  if (!S.track && !S.ucode && !S.token) { S.fam = get(P + 'sosCode'); S.lead = get(P + 'sosLead'); }   // signed in on the family or point-person page
  if (/[?&](t|unit)=/.test(q)) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {} }
  call({ action: 'config' }).then(function (r) { if (!r.error) S.cfg = r; if (S.track || S.ucode || S.token || S.fam || S.lead) load(); else render(); });
})();
