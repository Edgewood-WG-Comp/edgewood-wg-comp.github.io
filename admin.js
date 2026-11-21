/* SOS Crew – admin page: day grid (stations × time), place/cancel/check in, Extra Help, families, who's short, review.
 * Copyright (c) 2026 NE Prints & Design, LLC. All rights reserved.
 * Admins sign in with Google; the server checks the email against the Lists tab. */
(function () {
  'use strict';
  var C = window.SOS || {}, API = C.API, app = document.getElementById('app');
  var TOK = (C.ENV === 'LIVE' ? '' : 'sbx_') + 'sosAdminTok';
  var S = { token: '', who: null, cfg: null, view: 'grid', date: '', day: null, cell: '', fam: null, famQ: '', famHits: null, short: null, which: 'signup', flags: null, msg: null, addQ: '', addHits: null };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function getS(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function putS(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch (e) {} }
  function label(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + (mi ? ':' + ('0' + mi).slice(-2) : '') + (h >= 12 ? ' PM' : ' AM'); }
  function short(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + (mi ? ':' + ('0' + mi).slice(-2) : '') + (h >= 12 ? 'p' : 'a'); }
  function hhmm(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
  function dayParts(iso) { var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); return { dow: d.toLocaleDateString('en-US', { weekday: 'short' }), md: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }; }
  function call(d) {
    if (!API) return Promise.resolve({ error: 'This site is not connected yet.' });
    d.idToken = S.token;
    return fetch(API, { method: 'POST', body: JSON.stringify(d) }).then(function (r) { return r.json(); })
      .catch(function () { return { error: 'Could not reach the server. Try again.' }; })
      .then(function (r) { if (r && r.signIn) { S.token = ''; putS(TOK, ''); S.who = null; S.msg = { kind: 'err', text: 'Please sign in again (Google sign-ins last about an hour).' }; } return r; });
  }
  function flash(kind, text) { S.msg = { kind: kind, text: text }; }

  // ---------- frame
  function header() {
    var d = S.who || S.cfg || {};
    return (C.ENV !== 'LIVE' ? '<div class="sandbox">TEST SITE</div>' : '') +
      '<header class="adm"><img class=\"logo\" src=\"img/logo-160.png\" alt=\"SOS Crew – Edgewood Winter Guard\" width=\"72\" height=\"72\"><div class="eyebrow">' + esc(d.event || C.EVENT) + ' · Admin</div><h1>' + esc(d.app || C.NAME) + (S.who ? (S.who.canEdit === false ? ' <span class="adminpill spot">' + esc(S.who.role) + '</span>' : ' <span class="adminpill">' + esc(S.who.role || 'Admin') + '</span> <button class="adminpill spottog' + (S.spot ? ' spot' : '') + '" data-act="spot" title="Look around without being able to change anything">Spotter ' + (S.spot ? 'on' : 'off') + '</button>') : '') + '</h1>' +
      (S.who ? '<div class="hsub">' + esc(S.who.email) + '</div><div class="navpills">' +
        [['grid', 'Day grid'], ['setup', 'Setup'], ['fam', 'Families'], ['short', 'Who\'s short'], ['review', 'Review']].concat(S.who.canManage ? [['access', 'Access']] : []).map(function (x) { return '<button class="np' + (S.view === x[0] ? ' on' : '') + '" data-act="view" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
        '<a class="np" href="lead.html">Point-person view</a><a class="np back" href="./">← My family page</a></div>' : '') + '</header>';
  }
  function footer() {
    return '<footer><a href="./">Volunteer signup</a>' + (S.who ? ' · <button class="link" data-act="out">Sign out</button>' : '') +
      ' · <button class="link" data-theme-toggle>Theme: ' + (window.sosTheme ? sosTheme.label() : 'Auto') + '</button><span class="legal">© 2026 NE Prints &amp; Design, LLC. All rights reserved.</span></footer>';
  }
  function banner() { return S.msg ? '<div class="banner ' + S.msg.kind + '">' + esc(S.msg.text) + '</div>' : ''; }

  function renderSignIn() {
    var gid = (S.cfg && S.cfg.googleClientId) || C.GOOGLE_CLIENT_ID;
    app.innerHTML = header() + banner() + '<div class="card"><h2>Admin sign-in</h2><p class="muted">Sign in with a Google account listed on the sheet\'s Lists tab.</p>' +
      (gid ? '<div id="gbtn" style="display:flex;justify-content:center;min-height:44px"></div>' : '<p class="muted">Google sign-in isn\'t set up (Settings › Google client ID).</p>') + '</div>' + footer();
    if (!gid) return;
    var draw = function () { var el = document.getElementById('gbtn'); if (!el) return; google.accounts.id.initialize({ client_id: gid, callback: function (r) { S.token = r.credential; putS(TOK, S.token); start(); } }); google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280 }); };
    if (window.google && google.accounts) draw(); else { var sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = draw; document.head.appendChild(sc); }
  }

  // ---------- day grid
  function cls(f, n) { return n === 0 ? 'z' : f > n ? 'over' : f >= n ? 'full' : f === 0 ? 'empty' : 'part'; }
  function renderGrid() {
    var d = S.day; if (!d) return '<div class="card"><p class="muted">Loading…</p></div>';
    var b = d.balance, html = '';
    html += '<div class="tabs">' + d.days.map(function (x) { var p = dayParts(x.date); return '<button class="tab' + (x.date === d.date ? ' on' : '') + '" data-act="day" data-date="' + x.date + '"><div class="d1">' + esc(p.dow) + '</div><div class="d2">' + esc(p.md) + '</div></button>'; }).join('') + '</div>';
    html += '<div class="banner ' + (b.tight ? 'warn' : 'info') + '">All days: <b>' + b.openSpots + '</b> open spots families can take' + (b.assignedOpen ? ' (+' + b.assignedOpen + ' coordinator-assigned)' : '') + ' · <b>' + b.stillOwed + '</b> shifts still owed and not signed up.' + (b.tight ? ' Not enough spots for what\'s owed: add spots, or families will need Extra Help.' : '') + '</div>';
    var cols = {}, rows = {};
    d.shifts.forEach(function (s) { cols[s.start + '-' + s.end] = { start: s.start, end: s.end }; (rows[s.station] = rows[s.station] || {})[s.start + '-' + s.end] = s; });
    var ck = Object.keys(cols).sort(function (a, b) { return cols[a].start - cols[b].start || cols[a].end - cols[b].end; }), rk = Object.keys(rows).sort();
    var tot = { f: 0, n: 0 }; d.shifts.forEach(function (s) { tot.f += Math.min(s.filled, s.spots); tot.n += s.spots; });
    html += '<div class="card"><h2>' + tot.f + ' of ' + tot.n + ' spots filled</h2><div class="gridwrap"><table class="grid"><thead><tr><th>Station</th>' + ck.map(function (k) { return '<th>' + esc(short(cols[k].start) + '–' + short(cols[k].end)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rk.map(function (st) {
        return '<tr><th>' + esc(st) + '</th>' + ck.map(function (k) {
          var s = rows[st][k]; if (!s) return '<td class="na"></td>';
          return '<td><button class="cell ' + cls(s.filled, s.spots) + (S.cell === s.id ? ' sel' : '') + (s.who === 'Assigned' ? ' asg' : '') + '" data-act="cell" data-id="' + esc(s.id) + '">' + s.filled + '/' + s.spots + '</button></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div><div class="legend"><span class="cell empty">0</span> empty <span class="cell part">½</span> partly <span class="cell full">✓</span> full <span class="cell over">+</span> over <span class="cell asg">A</span> assigned by coordinators</div></div>';
    var s = d.shifts.filter(function (x) { return x.id === S.cell; })[0];
    if (s) html += cellPanel(s);
    html += extraPanel();
    return html;
  }
  function personRow(p, kind) {
    var id = kind === 'x' ? p.extraId : p.signupId, k = kind === 'x' ? 'data-x' : 'data-s';
    var inOn = p.status === 'Checked in', nsOn = p.status === 'No-show';
    var plist = kind !== 'x' && S.day && S.day.posts && S.curStation ? S.day.posts[S.curStation] : null;
    var psel = plist ? '<select class="postsel" data-id="' + esc(p.signupId) + '"><option value="">Post…</option>' + plist.map(function (x) { return '<option' + (x === p.post ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>' : '';
    return '<div class="person"><div><div class="who">' + esc(p.name) + (p.override ? ' <span class="pill tbd">override</span>' : '') + (p.post ? ' <span class="pill done">' + esc(p.post) + '</span>' : '') + '</div><div class="whosub">' + esc([p.type, p.group, p.family, p.status !== 'Signed up' ? p.status : ''].filter(String).join(' · ')) + '</div>' + psel + '</div><div class="acts">' +
      '<button class="chk' + (inOn ? ' on' : '') + '" data-act="mark" ' + k + '="' + esc(id) + '" data-mark="' + (inOn ? 'undo' : 'in') + '">' + (inOn ? 'In ✓' : 'Check in') + '</button>' +
      '<button class="chk ns' + (nsOn ? ' on' : '') + '" data-act="mark" ' + k + '="' + esc(id) + '" data-mark="' + (nsOn ? 'undo' : 'noshow') + '">No-show</button>' +
      '<button class="chk ns" data-act="' + (kind === 'x' ? 'xcancel' : 'cancel') + '" ' + k + '="' + esc(id) + '">Remove</button></div></div>';
  }
  function cellPanel(s) {
    S.curStation = s.station;
    var live = s.people.filter(function (p) { return p.status !== 'Cancelled'; });
    var html = '<div class="card" id="panel"><h2>' + esc(s.station) + ' · ' + esc(s.label) + ' · ' + s.filled + ' of ' + s.spots + (s.who !== 'Anyone' ? ' · ' + esc(s.who) : '') + '</h2>' +
      (live.length ? live.map(function (p) { return personRow(p, 's'); }).join('') : '<p class="muted">No one yet.</p>') +
      '<div class="w"><label for="addq">Add someone (any restriction is overridden)</label><div class="row"><input id="addq" placeholder="Name or email" value="' + esc(S.addQ) + '"><button class="sm" style="flex:none" data-act="addsearch">Find</button></div></div>';
    if (S.addHits) html += S.addHits.length ? S.addHits.map(function (p) { return '<div class="person"><div><div class="who">' + esc(p.name) + '</div><div class="whosub">' + esc([p.type, p.group, p.family].filter(String).join(' · ')) + '</div></div><div class="acts"><button class="chk" data-act="place" data-pid="' + esc(p.id) + '">Add to this spot</button></div></div>'; }).join('') : '<p class="muted">No one found.</p>';
    return html + '</div>';
  }
  function extraPanel() {
    S.curStation = '';
    var x = S.day.extra; if (!x.length) return '';
    var shifts = S.day.shifts;
    return '<div class="card"><h2>Extra Help · ' + x.length + '</h2>' + x.map(function (p) {
      var fits = shifts.filter(function (s) { return s.start < p.end && p.start < s.end; });
      var place = p.status === 'Signed up' ? '<select class="plc" data-x="' + esc(p.extraId) + '"><option value="">Place into…</option>' + fits.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.station + ' ' + short(s.start) + '–' + short(s.end) + ' (' + s.filled + '/' + s.spots + ')') + '</option>'; }).join('') + '</select>' : '';
      var q = Object.assign({}, p, { name: p.name + ' · ' + label(p.start) + '–' + label(p.end) + ' · counts ' + p.credit + (p.placedIn ? ' · placed' : '') });
      return personRow(q, 'x').replace('</div></div><div class="acts">', '</div>' + place + '</div><div class="acts">');
    }).join('') + '</div>';
  }

  // ---------- families
  function renderFam() {
    var html = '<div class="card"><h2>Find a family</h2><div class="row"><input id="famq" placeholder="Name or email" value="' + esc(S.famQ) + '"><button class="sm" style="flex:none" data-act="famsearch">Search</button></div>';
    if (S.famHits) html += S.famHits.length ? S.famHits.map(function (p) { return '<div class="person"><div><div class="who">' + esc(p.name) + '</div><div class="whosub">' + esc([p.type, p.group, p.family].filter(String).join(' · ')) + '</div></div><div class="acts"><button class="chk" data-act="openfam" data-fid="' + esc(p.familyId) + '">Open family</button></div></div>'; }).join('') : '<p class="muted">No one found.</p>';
    html += '</div>';
    if (S.fam) {
      var f = S.fam.family, base = location.href.replace(/admin\.html.*$/, '');
      html += '<div class="card"><h2>' + esc(f.name) + ' · ' + esc(f.id) + '</h2>' + (f.notes ? '<div class="banner ' + (/check/i.test(f.notes) ? 'warn' : 'info') + '" style="margin:0 0 10px">' + esc(f.notes) + '</div>' : '') +
        '<div class="whosub">Emails: ' + esc(f.emails.join(', ') || 'none') + (f.phones ? ' · Phones: ' + esc(f.phones) : '') + ' · Code: <b>' + esc(f.code) + '</b></div>' +
        '<div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="sm" style="flex:none" data-act="resend" data-fid="' + esc(f.id) + '">Email sign-in link</button><a class="cbtn alt" target="_blank" href="' + esc(base + '?code=' + f.code) + '">Open as this family</a></div>' +
        '<h2 style="margin-top:14px">Owes</h2>' + S.fam.status.lines.map(function (l) { return '<div class="status-line"><div><div class="who">' + esc(l.who) + '</div><div class="whosub">' + esc((l.group ? l.group + ' · ' : '') + 'owes ' + l.owed + ' · signed up ' + l.signed + ' · worked ' + l.worked) + '</div></div>' + (l.needSignup > 0 ? '<span class="pill need">' + l.needSignup + ' more</span>' : '<span class="pill done">✓</span>') + '</div>'; }).join('') +
        '<h2 style="margin-top:14px">People</h2>' + S.fam.people.map(function (p) { return '<div class="status-line"><div><div class="who">' + esc(p.name) + '</div><div class="whosub">' + esc([p.type, p.group, p.phone, p.email, p.source].filter(String).join(' · ')) + '</div></div></div>'; }).join('') +
        '<h2 style="margin-top:14px">Shifts</h2>' + (S.fam.mine.length ? S.fam.mine.map(function (m) { var p = dayParts(m.date); return '<div class="status-line"><div><div class="who">' + esc(m.person + ' · ' + m.station) + '</div><div class="whosub">' + esc(p.dow + ' ' + p.md + ', ' + m.label + ' · ' + m.status) + '</div></div>' + (m.status === 'Signed up' ? '<button class="chk ns" data-act="' + (m.extraId ? 'xcancel' : 'cancel') + '" ' + (m.extraId ? 'data-x="' + esc(m.extraId) : 'data-s="' + esc(m.signupId)) + '" data-refam="1">Remove</button>' : '') + '</div>'; }).join('') : '<p class="muted">None yet.</p>') + '</div>';
    }
    return html;
  }
  // ---------- who's short
  function renderShort() {
    var r = S.short, html = '<div class="card"><h2>Who\'s short</h2><div class="row" style="flex-wrap:wrap"><button class="chip' + (S.which === 'signup' ? ' on' : '') + '" style="flex:none" data-act="which" data-w="signup">Not signed up enough</button><button class="chip' + (S.which === 'worked' ? ' on' : '') + '" style="flex:none" data-act="which" data-w="worked">Didn\'t work enough (after the event)</button><button class="sm ghost" style="flex:none" data-act="csv">Download CSV</button></div>';
    if (!r) return html + '<p class="muted">Loading…</p></div>';
    if (!r.rows.length) return html + '<p class="muted">Nobody is short. 🎉</p></div>';
    return html + '<div class="gridwrap"><table class="list"><thead><tr><th>Family</th><th>Who</th><th>Owes</th><th>Signed</th><th>Worked</th><th>Short</th>' + (r.rows.some(function (x) { return x.fee !== ''; }) ? '<th>Fee</th>' : '') + '</tr></thead><tbody>' +
      r.rows.map(function (x) { return '<tr><td><button class="link" data-act="openfam" data-fid="' + esc(x.familyId) + '">' + esc(x.family) + '</button></td><td>' + esc(x.who + (x.group ? ' (' + x.group + ')' : '')) + '</td><td>' + x.owed + '</td><td>' + x.signed + '</td><td>' + x.worked + '</td><td><b>' + x.gap + '</b></td>' + (x.fee !== '' ? '<td>$' + x.fee + '</td>' : '') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="muted">' + r.rows.length + ' line(s).</p></div>';
  }
  function renderReview() {
    var f = S.flags; if (!f) return '<div class="card"><p class="muted">Loading…</p></div>';
    return '<div class="card"><h2>Families to review · ' + f.families.length + '</h2><p class="muted">Self-registered families, and possible duplicates (a student already on another family) first.</p>' +
      (f.families.length ? f.families.map(function (x) { return '<div class="status-line"><div><div class="who">' + esc(x.name) + ' · ' + esc(x.id) + '</div><div class="whosub">' + esc(x.people.join(', ')) + '</div><div class="whosub">' + esc(x.emails) + '</div>' + (x.check ? '<div class="whosub" style="color:var(--warn)">' + esc(x.notes) + '</div>' : '') + '</div><button class="chk" data-act="openfam" data-fid="' + esc(x.id) + '">Open</button></div>'; }).join('') : '<p class="muted">Nothing to review.</p>') + '</div>';
  }

  // ---------- setup: shifts, stations, days, point people
  var WHO = ['Anyone', 'HS & adults', 'Adults', 'Assigned'], STATUS = ['Draft', 'Final', 'Closed'];
  function opt(list, sel) { return list.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
  function toMin(t) { var p = String(t).split(':'); return +p[0] * 60 + +p[1]; }
  function renderSetup() {
    var u = S.setup; if (!u) return '<div class="card"><p class="muted">Loading…</p></div>';
    if (!S.sdate) S.sdate = (u.days[0] || {}).date || '';
    var dayShifts = u.shifts.filter(function (s) { return s.date === S.sdate; });
    var blocks = {}; dayShifts.forEach(function (s) { if (s.status !== 'Closed') blocks[s.start + '-' + s.end] = { start: s.start, end: s.end }; });
    var bk = Object.keys(blocks).sort();
    var html = '<div class="tabs">' + u.days.map(function (x) { var p = dayParts(x.date); return '<button class="tab' + (x.date === S.sdate ? ' on' : '') + '" data-act="sday" data-date="' + x.date + '"><div class="d1">' + esc(p.dow) + '</div><div class="d2">' + esc(p.md) + '</div></button>'; }).join('') +
      '<button class="tab" data-act="newday"><div class="d1">Add</div><div class="d2">+ Day</div></button></div>';
    if (S.newday) html += '<div class="card"><h2>New day</h2><label for="nd">Date</label><input id="nd" type="date"><p class="muted">Then add its shifts below.</p><button class="sm" data-act="newdayok">Use this date</button></div>';
    // add shift(s)
    html += '<div class="card w"><h2>Add a shift' + (S.sdate ? ' · ' + esc(dayParts(S.sdate).dow + ' ' + dayParts(S.sdate).md) : '') + '</h2>' +
      '<label for="as">Station</label><input id="as" list="stl" placeholder="Pick one, or type a new station name"><datalist id="stl">' + u.stations.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<div class="row"><div><label for="ast">Start</label><input id="ast" type="time" value="08:00"></div><div><label for="aen">End</label><input id="aen" type="time" value="11:00"></div><div><label for="asp">Spots</label><input id="asp" type="number" min="0" value="2"></div></div>' +
      '<div class="row"><div><label for="awh">Who can sign up</label><select id="awh">' + opt(WHO, 'Anyone') + '</select></div><div><label for="aco">Counts as</label><input id="aco" type="number" min="0" step="0.5" value="1"></div><div><label for="ass">Status</label><select id="ass">' + opt(STATUS, 'Draft') + '</select></div></div>' +
      '<label for="ano">Note (optional, shown to families)</label><input id="ano">' +
      (bk.length ? '<label class="tog"><input type="checkbox" id="aall"> Add at every time slot this day (' + bk.map(function (k) { return label(toMin(blocks[k].start)) + '–' + label(toMin(blocks[k].end)); }).join(', ') + ') instead of the times above</label>' : '') +
      '<div style="margin-top:12px"><button data-act="addshift" style="width:100%">Add</button></div></div>';
    // shifts by station
    var byStation = {}; dayShifts.forEach(function (s) { (byStation[s.station] = byStation[s.station] || []).push(s); });
    Object.keys(byStation).sort().forEach(function (st) {
      var leads = u.leads.filter(function (l) { return l.station.toLowerCase() === st.toLowerCase(); });
      var pl = (u.posts || {})[st] || [];
      html += '<div class="card"><h2>' + esc(st) + '</h2><div class="whosub">Posts: ' + (pl.length ? pl.map(function (x) { return '<span class="pill tbd">' + esc(x) + ' <button class="link" data-act="postdel" data-st="' + esc(st) + '" data-post="' + esc(x) + '" title="Remove">×</button></span>'; }).join(' ') : 'none') +
        ' · <button class="link" data-act="postadd" data-st="' + esc(st) + '">+ post</button></div><div class="whosub">Point person: ' + (leads.length ? leads.map(function (l) { return esc(l.name + (l.day ? ' (' + l.day + ')' : '')); }).join(', ') : 'none yet') + ' · <button class="link" data-act="leadnew" data-st="' + esc(st) + '">+ point person</button></div>' +
        byStation[st].sort(function (a, b) { return a.start < b.start ? -1 : 1; }).map(function (s) {
          if (S.edit === s.id) return '<div class="editrow" data-id="' + esc(s.id) + '"><div class="row"><div><label>Station</label><input class="e-st" value="' + esc(s.station) + '" list="stl"></div><div><label>Date</label><input class="e-dt" type="date" value="' + esc(s.date) + '"></div></div>' +
            '<div class="row"><div><label>Start</label><input class="e-s" type="time" value="' + esc(s.start) + '"></div><div><label>End</label><input class="e-e" type="time" value="' + esc(s.end) + '"></div><div><label>Spots</label><input class="e-sp" type="number" min="0" value="' + s.spots + '"></div></div>' +
            '<div class="row"><div><label>Who</label><select class="e-w">' + opt(WHO, s.who) + '</select></div><div><label>Counts as</label><input class="e-c" type="number" min="0" step="0.5" value="' + s.counts + '"></div><div><label>Status</label><select class="e-stt">' + opt(STATUS, s.status) + '</select></div></div>' +
            '<label>Note</label><input class="e-n" value="' + esc(s.notes) + '">' + (s.filled ? '<p class="muted">' + s.filled + ' signed up. Changing the date or time emails their families.</p>' : '') +
            '<div class="row" style="margin-top:8px"><button class="sm" data-act="saveshift" data-id="' + esc(s.id) + '">Save</button><button class="sm ghost" data-act="editshift" data-id="">Cancel</button></div></div>';
          return '<div class="status-line' + (s.status === 'Closed' ? ' closed' : '') + '"><div><div class="who">' + esc(label(toMin(s.start)) + ' – ' + label(toMin(s.end))) + ' <span class="muted">· ' + s.filled + ' of ' + s.spots + '</span></div><div class="whosub">' + esc([s.who, s.counts !== 1 ? 'counts ' + s.counts : '', s.status, s.notes, s.id].filter(String).join(' · ')) + '</div></div><button class="chk" data-act="editshift" data-id="' + esc(s.id) + '">Edit</button></div>';
        }).join('') + '</div>';
    });
    // point people
    html += '<div class="card" id="leadsCard"><h2>Point people</h2>' + (u.leads.length ? u.leads.map(function (l) {
      if (S.ledit === l.row) return leadForm(l);
      return '<div class="status-line"><div><div class="who">' + esc(l.name) + ' · ' + esc(l.station + (l.day ? ' (' + l.day + ')' : '')) + '</div><div class="whosub">' + esc([l.phone, l.email].filter(String).join(' · ') || 'no phone or email') + '</div></div><div class="acts"><button class="chk" data-act="leadedit" data-row="' + l.row + '">Edit</button>' + (l.email ? '<button class="chk" data-act="leademail" data-row="' + l.row + '">Email link</button>' : '') + '<button class="chk ns" data-act="leaddel" data-row="' + l.row + '" data-name="' + esc(l.name) + '">Remove</button></div></div>';
    }).join('') : '<p class="muted">None yet.</p>') + (S.ledit === 'new' ? leadForm({ row: '', station: S.lstation || '', day: '', name: '', phone: '', email: '' }) : '<div style="margin-top:10px"><button class="sm ghost" data-act="leadnew">+ Add a point person</button></div>') + '</div>';
    return html;
  }
  function leadForm(l) {
    return '<div class="editrow"><div class="row"><div><label>Station</label><select class="l-st">' + opt(S.setup.stations, l.station) + '</select></div><div><label>Day (blank = all days)</label><input class="l-d" value="' + esc(l.day) + '" placeholder="e.g. Fri"></div></div>' +
      '<div class="row"><div><label>Name</label><input class="l-n" value="' + esc(l.name) + '"></div><div><label>Cell</label><input class="l-p" type="tel" value="' + esc(l.phone) + '"></div></div>' +
      '<label>Email (for their link and Google sign-in)</label><input class="l-e" type="email" value="' + esc(l.email) + '">' +
      '<div class="row" style="margin-top:8px"><button class="sm" data-act="leadsave" data-row="' + esc(l.row) + '">Save</button><button class="sm ghost" data-act="leadcancel">Cancel</button></div></div>';
  }
  function loadSetup() { return call({ action: 'adminSetup' }).then(function (r) { if (r.error) flash('err', r.error); else { S.setup = r; if (S.sdate && !r.days.some(function (d) { return d.date === S.sdate; }) && !S.keepDay) S.sdate = ''; } render(); }); }

  // ---------- access (super admins): who is an admin/spotter, and the role list
  function renderAccess() {
    var a = S.access; if (!a) return '<div class="card"><p class="muted">Loading…</p></div>';
    var rn = a.roles.map(function (r) { return r.name; });
    var person = function (p) {
      if (S.aedit === (p ? p.row : 'new')) return '<div class="editrow w">' + (p ? '' : '<label>Find a volunteer (or type the email below)</label><div class="row"><input class="x-q" placeholder="Name or email" value="' + esc(S.aQ || '') + '"><button class="sm" style="flex:none" data-act="afind">Find</button></div>' +
        (S.aHits ? (S.aHits.length ? S.aHits.map(function (h) { return '<div class="person"><div><div class="who">' + esc(h.name) + '</div><div class="whosub">' + esc([h.type, h.family, h.email || 'no email on file'].filter(String).join(' · ')) + '</div></div><div class="acts">' + (h.email ? '<button class="chk" data-act="apick" data-email="' + esc(h.email) + '" data-name="' + esc(h.name) + '">Use</button>' : '') + '</div></div>'; }).join('') : '<p class="muted">No one found.</p>') : '')) +
        '<div class="row"><div><label>Google email</label><input class="x-e" type="email" value="' + esc(p ? p.email : '') + '"></div><div><label>Name</label><input class="x-n" value="' + esc(p ? p.name : '') + '"></div></div>' +
        '<div class="row"><div><label>Role</label><select class="x-r">' + opt(rn, p ? p.role : 'Admin') + '</select></div><div><label>Notes</label><input class="x-o" value="' + esc(p ? p.notes : '') + '"></div></div>' +
        '<div class="whosub">Use the Google account they\'ll sign in with; it can differ from the email on their family.</div>' +
        '<div class="row" style="margin-top:8px"><button class="sm" data-act="asave" data-row="' + (p ? p.row : '') + '">Save</button><button class="sm ghost" data-act="aedit" data-row="">Cancel</button></div></div>';
      var r = a.roles.filter(function (x) { return x.name.toLowerCase() === p.role.toLowerCase(); })[0] || { canEdit: false };
      return '<div class="status-line"><div><div class="who">' + esc(p.name || p.email) + ' <span class="adminpill' + (r.canEdit ? '' : ' spot') + '" style="font-size:11px">' + esc(p.role) + '</span></div><div class="whosub">' + esc([p.email, p.notes].filter(String).join(' · ')) + (p.email === S.who.email ? ' · you' : '') + '</div></div>' +
        '<div class="acts"><button class="chk w" data-act="aedit" data-row="' + p.row + '">Edit</button><button class="chk ns w" data-act="adel" data-row="' + p.row + '" data-email="' + esc(p.email) + '">Remove</button></div></div>';
    };
    var role = function (r) {
      if (S.redit === (r ? r.row : 'new')) return '<div class="editrow w"><div class="row"><div><label>Role name</label><input class="y-n" value="' + esc(r ? r.name : '') + '"></div><div><label>Description</label><input class="y-d" value="' + esc(r ? r.description : '') + '"></div></div>' +
        '<label class="tog"><input type="checkbox" class="y-e"' + (r && r.canEdit ? ' checked' : '') + '> Can edit (place people, check in, change shifts…)</label>' +
        '<label class="tog"><input type="checkbox" class="y-m"' + (r && r.canManage ? ' checked' : '') + '> Manage access (this Access page)</label>' +
        '<div class="row" style="margin-top:8px"><button class="sm" data-act="rsave" data-row="' + (r ? r.row : '') + '">Save</button><button class="sm ghost" data-act="redit" data-row="">Cancel</button></div></div>';
      var n = a.people.filter(function (p) { return p.role.toLowerCase() === r.name.toLowerCase(); }).length;
      return '<div class="status-line"><div><div class="who">' + esc(r.name) + ' <span class="muted">· ' + n + ' ' + (n === 1 ? 'person' : 'people') + '</span></div><div class="whosub">' + esc(r.description) + '</div><div class="whosub">' +
        (r.canEdit ? 'Can edit' : 'View only') + (r.canManage ? ' · Manages access' : '') + '</div></div><div class="acts"><button class="chk w" data-act="redit" data-row="' + r.row + '">Edit</button>' + (n ? '' : '<button class="chk ns w" data-act="rdel" data-row="' + r.row + '" data-name="' + esc(r.name) + '">Remove</button>') + '</div></div>';
    };
    return '<div class="card"><h2>Admins and spotters · ' + a.people.length + '</h2><p class="muted">They sign in with Google at admin.html. Changes work on their next page load.</p>' +
      a.people.map(person).join('') + (S.aedit === 'new' ? person(null) : '<div style="margin-top:10px" class="w"><button class="sm ghost" data-act="aedit" data-row="new">+ Add someone</button></div>') + '</div>' +
      '<div class="card"><h2>Roles</h2>' + a.roles.map(role).join('') + (S.redit === 'new' ? role(null) : '<div style="margin-top:10px" class="w"><button class="sm ghost" data-act="redit" data-row="new">+ Add a role</button></div>') + '</div>';
  }
  function loadAccess() { return call({ action: 'adminAccess' }).then(function (r) { if (r.error) flash('err', r.error); else S.access = r; render(); }); }

  function render() {
    if (!S.who) return renderSignIn();
    var body = S.view === 'access' ? renderAccess() : S.view === 'setup' ? renderSetup() : S.view === 'fam' ? renderFam() : S.view === 'short' ? renderShort() : S.view === 'review' ? renderReview() : renderGrid();
    var ro = S.who.canEdit === false || S.spot;
    app.innerHTML = header() + (ro ? '<div class="banner info">' + (S.who.canEdit === false ? 'View only. As ' + esc(S.who.role) + ' you see everything but can\'t change anything.' : 'Spotter mode is on: you can look around without changing anything. Tap SPOTTER ON in the title to edit again.') + '</div>' : '') + banner() + body + footer();
    if (ro) Array.prototype.forEach.call(app.querySelectorAll('.w, .postsel, .plc, [data-act=mark], [data-act=cancel], [data-act=xcancel], [data-act=place], [data-act=resend], [data-act=newday], [data-act=editshift], [data-act=postadd], [data-act=postdel], [data-act=leadnew], [data-act=leadedit], [data-act=leademail], [data-act=leaddel]'), function (el) { el.remove(); });
  }

  // ---------- loading
  function loadDay(date) { return call({ action: 'adminDay', date: date || S.date || '' }).then(function (r) { if (r.error) flash('err', r.error); else { S.day = r; S.date = r.date; } render(); }); }
  function loadFam(fid) { return call({ action: 'adminFamily', familyId: fid }).then(function (r) { if (r.error) flash('err', r.error); else S.fam = r; S.view = 'fam'; render(); }); }
  function loadShort() { S.short = null; render(); return call({ action: 'adminShort', which: S.which }).then(function (r) { if (r.error) flash('err', r.error); else S.short = r; render(); }); }
  function loadFlags() { S.flags = null; render(); return call({ action: 'adminFlags' }).then(function (r) { if (r.error) flash('err', r.error); else S.flags = r; render(); }); }
  function refresh() { return S.view === 'fam' && S.fam ? loadFam(S.fam.family.id) : loadDay(); }
  function start() {
    call({ action: 'adminWho' }).then(function (r) {
      if (r.error) { S.who = null; if (!S.msg) flash('err', r.error); return render(); }
      S.who = r; S.msg = null; loadDay();
    });
  }

  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.classList.contains('postsel')) { t.disabled = true; call({ action: 'setPost', signupId: t.getAttribute('data-id'), post: t.value }).then(function (r) { if (r.error) flash('err', r.error); loadDay(); }); return; }
    if (t.classList.contains('plc') && t.value) { var x = t.getAttribute('data-x'), sid = t.value; t.disabled = true;
      call({ action: 'adminPlace', extraId: x, shiftId: sid, overfill: true }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Placed.'); loadDay(); }); }
  });
  app.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'addq') app.querySelector('[data-act=addsearch]').click();
    if (e.target.id === 'famq') app.querySelector('[data-act=famsearch]').click();
    if (e.target.classList.contains('x-q')) app.querySelector('[data-act=afind]').click();
  });
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'); S.msg = null;
    if (act === 'view') { S.view = b.getAttribute('data-v'); if (S.view === 'access') loadAccess(); else if (S.view === 'setup') loadSetup(); else if (S.view === 'short') loadShort(); else if (S.view === 'review') loadFlags(); else if (S.view === 'grid') loadDay(); else render(); }
    else if (act === 'day') { S.cell = ''; S.addHits = null; loadDay(b.getAttribute('data-date')); }
    else if (act === 'cell') { S.cell = S.cell === b.getAttribute('data-id') ? '' : b.getAttribute('data-id'); S.addHits = null; S.addQ = ''; render(); var p = document.getElementById('panel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    else if (act === 'addsearch') { S.addQ = document.getElementById('addq').value; call({ action: 'adminSearch', q: S.addQ }).then(function (r) { S.addHits = r.people || []; render(); }); }
    else if (act === 'place') {
      var s = S.day.shifts.filter(function (x) { return x.id === S.cell; })[0], over = s && s.filled >= s.spots;
      if (over && !confirm('This spot is full. Add anyway (over the count)?')) return;
      b.disabled = true;
      call({ action: 'adminClaim', shiftId: S.cell, personId: b.getAttribute('data-pid'), override: true, overfill: over }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Added.'); S.addHits = null; S.addQ = ''; loadDay(); });
    }
    else if (act === 'mark') { b.disabled = true; var d = { action: 'adminMark', mark: b.getAttribute('data-mark') }; if (b.getAttribute('data-x')) d.extraId = b.getAttribute('data-x'); else d.signupId = b.getAttribute('data-s');
      call(d).then(function (r) { if (r.error) flash('err', r.error); refresh(); }); }
    else if (act === 'cancel' || act === 'xcancel') {
      if (!confirm('Remove this signup?')) return; b.disabled = true;
      call(act === 'cancel' ? { action: 'adminCancel', signupId: b.getAttribute('data-s') } : { action: 'adminExtraCancel', extraId: b.getAttribute('data-x') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Removed.'); refresh(); });
    }
    else if (act === 'famsearch') { S.famQ = document.getElementById('famq').value; call({ action: 'adminSearch', q: S.famQ }).then(function (r) { S.famHits = r.people || []; render(); }); }
    else if (act === 'openfam') loadFam(b.getAttribute('data-fid'));
    else if (act === 'resend') { b.disabled = true; call({ action: 'adminSendCode', familyId: b.getAttribute('data-fid') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || r.msg); render(); }); }
    else if (act === 'which') { S.which = b.getAttribute('data-w'); loadShort(); }
    else if (act === 'csv') { call({ action: 'adminShortCsv', which: S.which }).then(function (r) { if (r.error) { flash('err', r.error); return render(); } var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv' })); a.download = 'sos-crew-short-' + S.which + '.csv'; document.body.appendChild(a); a.click(); a.remove(); }); }
    else if (act === 'sday') { S.sdate = b.getAttribute('data-date'); S.edit = ''; S.newday = false; render(); }
    else if (act === 'newday') { S.newday = !S.newday; render(); }
    else if (act === 'newdayok') { var nd = document.getElementById('nd').value; if (!nd) return; S.sdate = nd; S.keepDay = true; S.newday = false; if (!S.setup.days.some(function (x) { return x.date === nd; })) S.setup.days.push({ date: nd, day: '' }); S.setup.days.sort(function (a, c) { return a.date < c.date ? -1 : 1; }); render(); }
    else if (act === 'addshift') {
      var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }, all = document.getElementById('aall');
      var base = { station: v('as'), date: S.sdate, spots: v('asp'), who: v('awh'), counts: v('aco'), status: v('ass'), notes: v('ano') }, items = [];
      if (!S.sdate) { flash('err', 'Pick a day first (or + Day).'); return render(); }
      if (all && all.checked) { var seen = {}; S.setup.shifts.filter(function (s) { return s.date === S.sdate && s.status !== 'Closed'; }).forEach(function (s) { var k = s.start + '-' + s.end; if (!seen[k]) { seen[k] = 1; items.push(Object.assign({}, base, { start: s.start, end: s.end })); } }); }
      else items.push(Object.assign({}, base, { start: v('ast'), end: v('aen') }));
      b.disabled = true;
      call({ action: 'adminShiftAdd', items: items }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || items.length + ' shift(s) added to ' + base.station + '.'); S.keepDay = false; loadSetup(); });
    }
    else if (act === 'editshift') { S.edit = b.getAttribute('data-id') || ''; render(); }
    else if (act === 'saveshift') {
      var row = b.closest('.editrow'), g = function (c) { return row.querySelector(c).value.trim(); };
      var d2 = { action: 'adminShiftSave', id: b.getAttribute('data-id'), station: g('.e-st'), date: g('.e-dt'), start: g('.e-s'), end: g('.e-e'), spots: g('.e-sp'), who: g('.e-w'), counts: g('.e-c'), status: g('.e-stt'), notes: g('.e-n') };
      b.disabled = true;
      call(d2).then(function (r) {
        if (r.confirm) { if (!confirm(r.error)) { b.disabled = false; return; } d2.force = true; return call(d2); }
        return r;
      }).then(function (r) { if (!r) return; flash(r.error ? 'err' : 'ok', r.error || ('Saved.' + (r.notified ? ' ' + r.notified + ' family email(s) sent about the new time.' : ''))); if (!r.error) S.edit = ''; loadSetup(); });
    }
    else if (act === 'postadd') { var pn = prompt('New post for ' + b.getAttribute('data-st') + ' (e.g. Buses):'); if (!pn) return;
      call({ action: 'adminPostAdd', station: b.getAttribute('data-st'), post: pn }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Post added.'); loadSetup(); }); }
    else if (act === 'postdel') { if (!confirm('Remove the post "' + b.getAttribute('data-post') + '"? People already on it keep it until reassigned.')) return;
      call({ action: 'adminPostDelete', station: b.getAttribute('data-st'), post: b.getAttribute('data-post') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Post removed.'); loadSetup(); }); }
    else if (act === 'leadnew') { S.ledit = 'new'; S.lstation = b.getAttribute('data-st') || ''; render(); var lc = document.getElementById('leadsCard'); if (lc) lc.scrollIntoView({ behavior: 'smooth' }); }
    else if (act === 'leadedit') { S.ledit = +b.getAttribute('data-row'); render(); }
    else if (act === 'leadcancel') { S.ledit = ''; render(); }
    else if (act === 'leadsave') {
      var fr = b.closest('.editrow'), q = function (c) { return fr.querySelector(c).value.trim(); };
      b.disabled = true;
      call({ action: 'adminLeadSave', row: b.getAttribute('data-row') || '', station: q('.l-st'), day: q('.l-d'), name: q('.l-n'), phone: q('.l-p'), email: q('.l-e') })
        .then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Point person saved.'); if (!r.error) S.ledit = ''; loadSetup(); });
    }
    else if (act === 'leademail') { b.disabled = true; call({ action: 'adminLeadEmail', row: b.getAttribute('data-row') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || r.msg); render(); }); }
    else if (act === 'leaddel') { if (!confirm('Remove ' + b.getAttribute('data-name') + ' as a point person?')) return; b.disabled = true;
      call({ action: 'adminLeadDelete', row: b.getAttribute('data-row'), name: b.getAttribute('data-name') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Removed.'); loadSetup(); }); }
    else if (act === 'spot') { S.spot = !S.spot; try { sessionStorage.setItem('sosSpotMode', S.spot ? '1' : '0'); } catch (x) {} render(); }
    else if (act === 'aedit') { var ar = b.getAttribute('data-row'); S.aedit = ar === 'new' ? 'new' : ar ? +ar : ''; S.aHits = null; S.aQ = ''; render(); }
    else if (act === 'afind') { S.aQ = app.querySelector('.x-q').value; var keepE = app.querySelector('.x-e').value, keepN = app.querySelector('.x-n').value;
      call({ action: 'adminSearch', q: S.aQ }).then(function (r) { S.aHits = r.people || []; render(); app.querySelector('.x-e').value = keepE; app.querySelector('.x-n').value = keepN; }); }
    else if (act === 'apick') { app.querySelector('.x-e').value = b.getAttribute('data-email'); app.querySelector('.x-n').value = b.getAttribute('data-name'); S.aHits = null; Array.prototype.forEach.call(app.querySelectorAll('.editrow .person'), function (el) { el.remove(); }); }
    else if (act === 'redit') { var rr = b.getAttribute('data-row'); S.redit = rr === 'new' ? 'new' : rr ? +rr : ''; render(); }
    else if (act === 'asave') { var ae = b.closest('.editrow'), av = function (c) { return ae.querySelector(c).value.trim(); }; b.disabled = true;
      call({ action: 'adminAccessSave', row: b.getAttribute('data-row') || '', email: av('.x-e'), name: av('.x-n'), role: av('.x-r'), notes: av('.x-o') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Saved.'); if (!r.error) S.aedit = ''; loadAccess(); }); }
    else if (act === 'adel') { if (!confirm('Remove ' + b.getAttribute('data-email') + '?')) return; b.disabled = true;
      call({ action: 'adminAccessDelete', row: b.getAttribute('data-row'), email: b.getAttribute('data-email') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Removed.'); loadAccess(); }); }
    else if (act === 'rsave') { var re = b.closest('.editrow'); b.disabled = true;
      call({ action: 'adminRoleSave', row: b.getAttribute('data-row') || '', name: re.querySelector('.y-n').value.trim(), description: re.querySelector('.y-d').value.trim(), canEdit: re.querySelector('.y-e').checked, canManage: re.querySelector('.y-m').checked })
        .then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Role saved.'); if (!r.error) S.redit = ''; loadAccess(); }); }
    else if (act === 'rdel') { if (!confirm('Remove the role ' + b.getAttribute('data-name') + '?')) return; b.disabled = true;
      call({ action: 'adminRoleDelete', row: b.getAttribute('data-row'), name: b.getAttribute('data-name') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Role removed.'); loadAccess(); }); }
    else if (act === 'out') { S.token = ''; putS(TOK, ''); S.who = null; try { google.accounts.id.disableAutoSelect(); } catch (x) {} render(); }
  });

  S.token = getS(TOK); S.spot = getS('sosSpotMode') !== '0';   // admins start in Spotter mode; tapping the pill turns it off for this tab
  call({ action: 'config' }).then(function (r) { if (!r.error) S.cfg = r; if (S.token) start(); else render(); });
})();
