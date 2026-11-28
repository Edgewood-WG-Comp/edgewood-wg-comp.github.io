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
  // Nov 22: the admin sign-in is shared by every tab on this device (warp links open new tabs). It's Google's own ID token, good for about an hour.
  function getL(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function putL(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }
  function label(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + (mi ? ':' + ('0' + mi).slice(-2) : '') + (h >= 12 ? ' PM' : ' AM'); }
  function short(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + (mi ? ':' + ('0' + mi).slice(-2) : '') + (h >= 12 ? 'p' : 'a'); }
  function hhmm(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
  function dayParts(iso) { var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); return { dow: d.toLocaleDateString('en-US', { weekday: 'short' }), md: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }; }
  function call(d) {
    if (!API) return Promise.resolve({ error: 'This site is not connected yet.' });
    d.idToken = S.token;
    return fetch(API, { method: 'POST', body: JSON.stringify(d) }).then(function (r) { return r.json(); })
      .catch(function () { return { error: 'Could not reach the server. Try again.' }; })
      .then(function (r) { if (r && r.signIn) { if (S.token && !tokExpired(S.token)) putS('sosAutoNo', '1'); S.token = ''; putL(TOK, ''); S.who = null; S.msg = { kind: 'err', text: 'Please sign in again (Google sign-ins last about an hour).' }; } return r; });
  }
  function flash(kind, text) { S.msg = { kind: kind, text: text }; }

  // ---------- frame
  function header() {
    var d = S.who || S.cfg || {};
    return (C.ENV !== 'LIVE' ? '<div class="sandbox">TEST SITE</div>' : '') +
      '<header class="adm"><img class=\"logo\" src=\"img/logo-160.png\" alt=\"SOS Crew – Edgewood Winter Guard\" width=\"72\" height=\"72\"><div class="eyebrow">' + esc(d.event || C.EVENT) + ' · Admin</div><h1>' + esc(d.app || C.NAME) + (S.who ? (S.who.canEdit === false ? ' <span class="adminpill spot">' + esc(S.who.role) + '</span>' : ' <span class="adminpill">' + esc(S.who.role || 'Admin') + '</span> <button class="adminpill spottog' + (S.spot ? ' spot' : '') + '" data-act="spot" title="Look around without being able to change anything">Spotter ' + (S.spot ? 'on' : 'off') + '</button>') : '') + '</h1>' +
      (S.who ? '<div class="hsub">' + esc(S.who.email) + '</div><div class="navpills">' +
        [['grid', 'Day grid'], ['setup', 'Setup'], ['units', 'Units'], ['fam', 'Families'], ['short', 'Who\'s short'], ['hat', 'Hat']].concat(S.who.bgOn ? [['checks', 'Checks']] : []).concat(S.who.shirtsOn ? [['shirts', 'Shirts']] : []).concat([['review', 'Review']].concat(S.who.canEdit !== false ? [['actas', 'Act as']] : [])).concat(S.who.canManage ? [['access', 'Access']] : []).map(function (x) { return '<button class="np' + (S.view === x[0] ? ' on' : '') + '" data-act="view" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
        '<a class="np" href="board.html">HQ board</a><a class="np" href="track.html">Station screens</a><a class="np" href="live.html">Public board</a><a class="np" href="lead.html">Point-person view</a><a class="np" href="help/admin/">Admin help</a><a class="np back" href="./">← My family page</a></div>' : '') + '</header>';
  }
  function footer() {
    return '<footer><a href="./">Volunteer signup</a>' + (S.who ? ' · <button class="link" data-act="out">Sign out</button>' : '') +
      ' · <button class="link" data-theme-toggle>Theme: ' + (window.sosTheme ? sosTheme.label() : 'Auto') + '</button><span class="legal">© 2026 NE Prints &amp; Design, LLC. All rights reserved.</span></footer>';
  }
  function banner() { return S.msg ? '<div class="banner ' + S.msg.kind + '">' + esc(S.msg.text) + '</div>' : ''; }

  /** A Google ID token's own expiry (it lasts about an hour). Expired = sign in again (automatically if allowed); not expired = refused. */
  function tokExpired(t) { if (/^ok:/.test(String(t || ''))) return false;   // the local test server's stand-in tokens
    var sm = String(t || '').match(/^sess_\w+\.(\d+)$/); if (sm) return Number(sm[1]) < Date.now() + 30000;   // Nov 22: 12-hour admin session
    try { var p = JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return !p.exp || p.exp * 1000 < Date.now() + 30000; } catch (e) { return true; } }
  /** Nov 22 (Nick): trade the Google sign-in for the server's 12-hour admin session (Settings › Admin sign-in hours), shared by every tab on this device. */
  function swapForSession(cred) {
    S.token = cred;
    call({ action: 'adminSession' }).then(function (r) {
      if (r && r.session) { S.token = r.session; putL(TOK, r.session); }
      else if (!(r && r.signIn)) { putL(TOK, cred); }   // older server without sessions: keep the Google token (about an hour)
      start();
    });
  }
  // Nov 27 (Nick): the button goes through the browser's FedCM sign-in too. Chrome only signs someone in automatically after a
  // FedCM sign-in on that browser; the old pop-up button never counted, so automatic admin sign-in never kicked in on phones.
  function renderSignIn() {
    var gid = (S.cfg && S.cfg.googleClientId) || C.GOOGLE_CLIENT_ID;
    app.innerHTML = header() + banner() + '<div class="card"><h2>Admin sign-in</h2><p class="muted">Sign in with a Google account listed on the sheet\'s Lists tab.</p>' +
      (gid ? '<div id="gbtn" style="display:flex;justify-content:center;min-height:44px"></div>' : '<p class="muted">Google sign-in isn\'t set up (Settings › Google client ID).</p>') + '</div>' + footer();
    if (!gid) return;
    // Nov 22 (Nick): automatic sign-in on a device that has signed in as admin before (and didn't press Sign out). Google still verifies
    // the account and the server still checks the Lists tab. Not after a refusal in this tab, so a non-admin account can't loop.
    var auto = false; try { auto = localStorage.getItem('sosAdminSeen') === '1' && localStorage.getItem('sosAdminOut') !== '1' && !getS('sosAutoNo'); } catch (e) {}
    var draw = function () { var el = document.getElementById('gbtn'); if (!el) return; google.accounts.id.initialize({ client_id: gid, auto_select: auto, use_fedcm_for_prompt: true, use_fedcm_for_button: true, button_auto_select: true, callback: function (r) { swapForSession(r.credential); } }); google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280 }); if (auto) { try { google.accounts.id.prompt(); } catch (e) {} } };
    if (window.google && google.accounts) draw(); else { var sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = draw; document.head.appendChild(sc); }
  }

  // ---------- day grid
  function cls(f, n) { return n === 0 ? 'z' : f > n ? 'over' : f >= n ? 'full' : f === 0 ? 'empty' : 'part'; }
  function renderGrid() {
    var d = S.day; if (!d) return '<div class="card">' + spin() + '</div>';
    var b = d.balance, html = '';
    html += '<div class="tabs">' + d.days.map(function (x) { var p = dayParts(x.date); return '<button class="tab' + (x.date === d.date ? ' on' : '') + '" data-act="day" data-date="' + x.date + '"><div class="d1">' + esc(p.dow) + '</div><div class="d2">' + esc(p.md) + '</div></button>'; }).join('') + '</div>';
    html += '<div class="banner ' + (b.tight ? 'warn' : 'info') + '">All days: <b>' + b.openSpots + '</b> open spots families can take' + (b.assignedOpen ? ' (+' + b.assignedOpen + ' coordinator-assigned)' : '') + ' · <b>' + b.stillOwed + '</b> shifts still owed and not signed up.' + (b.tight ? ' Not enough spots for what\'s owed: add spots, or families will need Extra Help.' : '') + '</div>';
    var cols = {}, rows = {};
    d.shifts.forEach(function (s) { var k = s.block || s.start + '-' + s.end; cols[k] = { start: s.start, end: s.end, label: s.block ? s.label : '' }; (rows[s.station] = rows[s.station] || {})[k] = s; });
    var ck = Object.keys(cols).sort(function (a, b) { return cols[a].start - cols[b].start || cols[a].end - cols[b].end; }), rk = Object.keys(rows).sort();
    var tot = { f: 0, n: 0 }; d.shifts.forEach(function (s) { tot.f += Math.min(s.filled, s.spots); tot.n += s.spots; });
    html += '<div class="card"><h2>' + tot.f + ' of ' + tot.n + ' spots filled</h2><div class="gridwrap"><table class="grid"><thead><tr><th>Station</th>' + ck.map(function (k) { return '<th>' + esc(cols[k].label || short(cols[k].start) + '–' + short(cols[k].end)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
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
        '<h2 style="margin-top:14px">People</h2>' + S.fam.people.map(function (p) { return '<div class="status-line"><div><div class="who">' + esc(p.name) + '</div><div class="whosub">' + esc([p.type, p.group, p.phone, p.email, p.source].filter(String).join(' · ')) + '</div></div>' + (S.who.shirtsOn ? shirtCtl({ id: p.id, size: p.shirt }, S.fam.shirtSizes || []) : '') + bgCtl(p) + '</div>'; }).join('') +
        '<h2 style="margin-top:14px">Shifts</h2>' + (S.fam.mine.length ? S.fam.mine.map(function (m) { var p = dayParts(m.date); return '<div class="status-line"><div><div class="who">' + esc(m.person + ' · ' + m.station) + '</div><div class="whosub">' + esc(p.dow + ' ' + p.md + ', ' + m.label + ' · ' + m.status) + '</div></div>' + (m.status === 'Signed up' ? '<button class="chk ns" data-act="' + (m.extraId ? 'xcancel' : 'cancel') + '" ' + (m.extraId ? 'data-x="' + esc(m.extraId) : 'data-s="' + esc(m.signupId)) + '" data-refam="1">Remove</button>' : '') + '</div>'; }).join('') : '<p class="muted">None yet.</p>') + '</div>';
    }
    return html;
  }
  // ---------- background checks (Settings › Background checks = Yes)
  var BG = ['Cleared', 'Pending', 'Not on file', 'Exempt'];
  function bgCtl(p) {
    if (!p.bg) return '';
    if (p.type === 'Student') return '<span class="pill done">Exempt</span>';
    var ro = S.who.canEdit === false || S.spot;
    return ro ? '<span class="pill ' + (p.bg === 'Cleared' || p.bg === 'Exempt' ? 'done' : 'need') + '">' + esc(p.bg) + '</span>' : '<select class="bgsel" data-pid="' + esc(p.id) + '" style="width:auto">' + opt(BG, p.bg) + '</select>';
  }
  function renderChecks() {
    var r = S.bg; if (!r) return '<div class="card">' + spin() + '</div>';
    return '<div class="card"><h2>Background checks</h2><p class="muted">Adults (not students) on the People tab: ' + BG.map(function (k) { return esc(k) + ' ' + (r.counts[k] || 0); }).join(' · ') + '. Set a status here or in Families; the school report import comes later.</p></div>' +
      '<div class="card"><h2>Signed up but not cleared · ' + r.rows.length + '</h2>' + (r.rows.length ? r.rows.map(function (x) {
        return '<div class="status-line"><div><div class="who">' + esc(x.name) + '</div><div class="whosub"><button class="link" data-act="openfam" data-fid="' + esc(x.familyId) + '">' + esc(x.family) + '</button> · ' + x.shifts + ' shift' + (x.shifts > 1 ? 's' : '') + (x.date ? ' · ' + esc(x.date) : '') + '</div></div>' + bgCtl({ id: x.personId, bg: x.status, type: 'Parent' }) + '</div>';
      }).join('') : '<p class="muted">Everyone signed up is cleared. 🎉</p>') + '</div>';
  }
  // ---------- shirt sizes (Settings › Shirt sizes; blank = off)
  function shirtCtl(p, sizes) {
    var ro = S.who.canEdit === false || S.spot;
    if (ro) return p.size ? '<span class="pill done">' + esc(p.size) + '</span>' : '<span class="pill need">Not picked</span>';
    return '<select class="shsel" data-pid="' + esc(p.id || p.personId) + '" style="width:auto"><option value="">Not picked</option>' + opt(sizes, p.size || p.shirt) + '</select>';
  }
  function renderShirts() {
    var r = S.shirts; if (!r) return '<div class="card">' + spin() + '</div>';
    var need = r.rows.filter(function (x) { return !x.size; }), have = r.rows.filter(function (x) { return x.size; });
    var line = function (x) { return '<div class="status-line"><div><div class="who">' + esc(x.name) + ' <span class="muted">' + esc(x.type === 'Student' ? x.group || 'Student' : x.type) + '</span></div><div class="whosub"><button class="link" data-act="openfam" data-fid="' + esc(x.familyId) + '">' + esc(x.family) + '</button></div></div>' + shirtCtl(x, r.sizes) + '</div>'; };
    return '<div class="card"><h2>Shirt order</h2><div class="gridwrap"><table class="grid"><thead><tr>' + r.counts.map(function (c) { return '<th>' + esc(c.size) + '</th>'; }).join('') + '<th>Not picked</th>' + (r.other ? '<th>Not on list</th>' : '') + '</tr></thead><tbody><tr>' +
      r.counts.map(function (c) { return '<td>' + c.n + '</td>'; }).join('') + '<td>' + r.missing + '</td>' + (r.other ? '<td>' + r.other + '</td>' : '') + '</tr></tbody></table></div>' +
      '<p class="muted">' + r.total + ' active people (parents, students and other adults). Sizes come from Settings › Shirt sizes.</p><button class="sm ghost" data-act="shirtcsv">Download CSV</button></div>' +
      '<div class="card"><h2>No size yet · ' + need.length + '</h2>' + (need.length ? need.map(line).join('') : '<p class="muted">Everyone has a size. 🎉</p>') + '</div>' +
      '<div class="card"><details><summary>Everyone with a size · ' + have.length + '</summary>' + have.map(line).join('') + '</details></div>';
  }
  function loadShirts() { return call({ action: 'adminShirts' }).then(function (r) { if (r.error) flash('err', r.error); else S.shirts = r; render(); }); }
  function loadChecks() { return call({ action: 'adminBg' }).then(function (r) { if (r.error) flash('err', r.error); else S.bg = r; render(); }); }
  // ---------- who's short
  function renderShort() {
    var r = S.short, html = '<div class="card"><h2>Who\'s short</h2><div class="row" style="flex-wrap:wrap"><button class="chip' + (S.which === 'signup' ? ' on' : '') + '" style="flex:none" data-act="which" data-w="signup">Not signed up enough</button><button class="chip' + (S.which === 'worked' ? ' on' : '') + '" style="flex:none" data-act="which" data-w="worked">Didn\'t work enough (after the event)</button><button class="sm ghost" style="flex:none" data-act="csv">Download CSV</button></div>';
    if (!r) return html + spin() + '</div>';
    if (!r.rows.length) return html + '<p class="muted">Nobody is short. 🎉</p></div>';
    return html + '<div class="gridwrap"><table class="list"><thead><tr><th>Family</th><th>Who</th><th>Owes</th><th>Signed</th><th>Worked</th><th>Short</th>' + (r.rows.some(function (x) { return x.fee !== ''; }) ? '<th>Fee</th>' : '') + '</tr></thead><tbody>' +
      r.rows.map(function (x) { return '<tr><td><button class="link" data-act="openfam" data-fid="' + esc(x.familyId) + '">' + esc(x.family) + '</button></td><td>' + esc(x.who + (x.group ? ' (' + x.group + ')' : '')) + '</td><td>' + x.owed + '</td><td>' + x.signed + '</td><td>' + x.worked + '</td><td><b>' + x.gap + '</b></td>' + (x.fee !== '' ? '<td>$' + x.fee + '</td>' : '') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="muted">' + r.rows.length + ' line(s).</p></div>';
  }
  // ---------- act as: open any page as someone else, in a new tab (simulation, troubleshooting)
  var AS_PAGE = { fam: './', guide: 'track.html', lead: 'lead.html', track: 'track.html', unit: 'board.html' };
  function renderActAs() {
    var r = S.actas;
    return '<div class="card"><h2>Act as someone</h2><p class="muted" style="margin-top:0">Opens their page in a new tab, exactly as they see it: a family, a guide\'s or crew\'s station screen, a point person, a tracker crew, or a director. A red bar shows you\'re acting as them. <b>Anything you change there is real.</b> Your own sign-ins aren\'t touched.</p>' +
      '<div class="row"><input id="asq" placeholder="Name, email, family, station or guard" value="' + esc(S.asq || '') + '"><button class="sm" style="flex:none" data-act="assearch">Search</button></div></div>' +
      (!r ? '<div class="card">' + spin() + '</div>' : '<div class="card">' + (r.results.length ? r.results.map(function (x) {
        return '<div class="status-line"><div><div class="who">' + esc(x.label) + ' <span class="pill tbd">' + esc(x.type) + '</span></div><div class="whosub">' + esc(x.sub || '') + '</div></div><div class="acts">' +
          x.links.map(function (l) { return '<a class="cbtn alt" target="_blank" rel="noopener" href="' + esc(AS_PAGE[l.kind] + '?as=' + l.kind + ':' + l.code + '&asl=' + encodeURIComponent(x.label)) + '">' + esc(l.text) + '</a>'; }).join(' ') + '</div></div>';
      }).join('') : '<p class="muted">Nothing found. Families: type at least 2 letters of a name or email.</p>') + '</div>');
  }
  function loadActAs(q) { S.asq = q; S.actas = null; render(); return call({ action: 'adminActAs', q: q }).then(function (r) { if (r.error) flash('err', r.error); else S.actas = r; render(); }); }
  // ---------- name in the hat: candidates for Assigned spots
  function renderHat() {
    var h = S.hat; if (!h) return '<div class="card">' + spin() + '</div>';
    var ro = S.who.canEdit === false || S.spot;
    return '<div class="card"><h2>Name in the hat</h2><p class="muted">People who offered to take a spot the coordinators fill. ' + (h.open ? 'Open' + (h.closes ? ' until ' + esc(h.closes) : '') : 'Closed') + ' (Settings › Name in the hat / Hat closes). Placing someone is a normal signup; when the spot fills, everyone else still pending is emailed that they weren\'t picked.</p></div>' +
      (h.shifts.length ? h.shifts.map(function (x) {
        var full = x.filled >= x.spots, pend = x.people.filter(function (p) { return p.status === 'Pending'; }).length;
        return '<div class="card"><h2>' + esc(x.station) + ' · ' + esc(x.date + ' ' + x.label) + '</h2><div class="whosub">' + x.filled + ' of ' + x.spots + ' filled · ' + pend + ' pending</div>' +
          x.people.map(function (p) {
            var st = p.status === 'Pending' ? (ro || full ? '' : '<button class="chk w" data-act="hatplace" data-id="' + esc(p.hatId) + '">Place</button>') : '<span class="pill ' + (p.status === 'Placed' ? 'done' : 'tbd') + '">' + esc(p.status) + '</span>';
            return '<div class="status-line"><div><div class="who">' + esc(p.name) + ' <span class="muted">' + esc(p.type === 'Student' ? p.group : p.type) + '</span></div><div class="whosub">' + esc(/family$/i.test(p.family) ? p.family : p.family + ' family') + ' · ' + (p.familyShort == null ? 'shift counts not set' : p.familyShort ? 'still short ' + p.familyShort : 'covered') + '</div>' + (p.note ? '<div class="whosub">“' + esc(p.note) + '”</div>' : '') + '</div><div class="acts">' + st + '</div></div>';
          }).join('') + (pend && !ro ? '<div class="w" style="margin-top:8px"><button class="sm ghost" data-act="hatclose" data-id="' + esc(x.shiftId) + '">Close: tell the rest they weren\'t picked</button></div>' : '') + '</div>';
      }).join('') : '<div class="card"><p class="muted">No names in yet.</p></div>');
  }
  function loadHat() { return call({ action: 'adminHat' }).then(function (r) { if (r.error) flash('err', r.error); else S.hat = r; render(); }); }
  function renderReview() {
    var f = S.flags; if (!f) return '<div class="card">' + spin() + '</div>';
    return '<div class="card"><h2>Families to review · ' + f.families.length + '</h2><p class="muted">Self-registered families, and possible duplicates (a student already on another family) first.</p>' +
      (f.families.length ? f.families.map(function (x) { return '<div class="status-line"><div><div class="who">' + esc(x.name) + ' · ' + esc(x.id) + '</div><div class="whosub">' + esc(x.people.join(', ')) + '</div><div class="whosub">' + esc(x.emails) + '</div>' + (x.check ? '<div class="whosub" style="color:var(--warn)">' + esc(x.notes) + '</div>' : '') + '</div><button class="chk" data-act="openfam" data-fid="' + esc(x.id) + '">Open</button></div>'; }).join('') : '<p class="muted">Nothing to review.</p>') + '</div>';
  }

  // ---------- setup: shifts, stations, days, point people
  var WHO = ['Anyone', 'HS & adults', 'HS students', 'Adults', 'Assigned'], STATUS = ['Draft', 'Final', 'Closed'];
  function opt(list, sel) { return list.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
  function toMin(t) { var p = String(t).split(':'); return +p[0] * 60 + +p[1]; }
  function blockOpts(u, sel) { return '<option value="">Times below</option>' + (u.blocks || []).map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(x.label + (x.start ? ' (' + label(toMin(x.start)) + '–' + label(toMin(x.end)) + ')' : '')) + '</option>'; }).join(''); }
  function blocksCard(u) {
    return '<div class="card"><h2>Shift blocks</h2><p class="muted">Shifts in a block show its name. Rename it, or add times later, and every shift in it follows. Times are optional.</p>' +
      (u.blocks || []).concat([{ id: '', label: '', start: '', end: '', order: '' }]).map(function (x) {
        return '<div class="row blk" style="margin-top:6px"><input class="bl-l" placeholder="' + (x.id ? '' : 'New block (e.g. Early)') + '" value="' + esc(x.label) + '"><input class="bl-s" type="time" value="' + esc(x.start) + '"><input class="bl-e" type="time" value="' + esc(x.end) + '"><input class="bl-o" type="number" min="1" style="max-width:70px" value="' + esc(x.order) + '"><button class="sm" data-act="blsave" data-id="' + esc(x.id) + '" style="flex:none">' + (x.id ? 'Save' : 'Add') + '</button></div>';
      }).join('') + '</div>';
  }
  function renderSetup() {
    var u = S.setup; if (!u) return '<div class="card">' + spin() + '</div>';
    if (!S.sdate) S.sdate = (u.days[0] || {}).date || '';
    var dayShifts = u.shifts.filter(function (s) { return s.date === S.sdate; });
    var blocks = {}; dayShifts.forEach(function (s) { if (s.status !== 'Closed' && !s.block && s.start) blocks[s.start + '-' + s.end] = { start: s.start, end: s.end }; });
    var bk = Object.keys(blocks).sort();
    var html = '<div class="tabs">' + u.days.map(function (x) { var p = dayParts(x.date); return '<button class="tab' + (x.date === S.sdate ? ' on' : '') + '" data-act="sday" data-date="' + x.date + '"><div class="d1">' + esc(p.dow) + '</div><div class="d2">' + esc(p.md) + '</div></button>'; }).join('') +
      '<button class="tab" data-act="newday"><div class="d1">Add</div><div class="d2">+ Day</div></button></div>';
    html += blocksCard(u);
    if (S.newday) html += '<div class="card"><h2>New day</h2><label for="nd">Date</label><input id="nd" type="date"><p class="muted">Then add its shifts below.</p><button class="sm" data-act="newdayok">Use this date</button></div>';
    // add shift(s)
    html += '<div class="card w"><h2>Add a shift' + (S.sdate ? ' · ' + esc(dayParts(S.sdate).dow + ' ' + dayParts(S.sdate).md) : '') + '</h2>' +
      '<label for="as">Station</label><input id="as" list="stl" placeholder="Pick one, or type a new station name"><datalist id="stl">' + u.stations.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<div class="row"><div><label for="abl">Block</label><select id="abl">' + blockOpts(u, (u.blocks[0] || {}).id || '') + '</select></div><div><label for="ast">Start</label><input id="ast" type="time" value="08:00"></div><div><label for="aen">End</label><input id="aen" type="time" value="11:00"></div><div><label for="asp">Spots</label><input id="asp" type="number" min="0" value="2"></div></div>' +
      '<div class="whosub">With a block picked, the times come from the block (leave them as they are).</div>' +
      '<div class="row"><div><label for="awh">Who can sign up</label><select id="awh">' + opt(WHO, 'Anyone') + '</select></div><div><label for="aco">Counts as</label><input id="aco" type="number" min="0" step="0.5" value="1"></div><div><label for="ass">Status</label><select id="ass">' + opt(STATUS, 'Draft') + '</select></div></div>' +
      '<label for="ano">Note (optional, shown to families)</label><input id="ano">' +
      (bk.length ? '<label class="tog"><input type="checkbox" id="aall"> Add at every time slot this day (' + bk.map(function (k) { return label(toMin(blocks[k].start)) + '–' + label(toMin(blocks[k].end)); }).join(', ') + ') instead of the times above</label>' : '') +
      '<div style="margin-top:12px"><button data-act="addshift" style="width:100%">Add</button></div></div>';
    // shifts by station
    var byStation = {}; dayShifts.forEach(function (s) { (byStation[s.station] = byStation[s.station] || []).push(s); });
    Object.keys(byStation).sort().forEach(function (st) {
      var leads = u.leads.concat((u.derivedLeads || []).map(function (l) { return { name: l.name + ' – placed', station: l.station, day: '' }; })).filter(function (l) { return l.station.toLowerCase() === st.toLowerCase(); });
      var pl = (u.posts || {})[st] || [];
      html += '<div class="card"><h2>' + esc(st) + '</h2><div class="whosub">Posts: ' + (pl.length ? pl.map(function (x) { return '<span class="pill tbd">' + esc(x) + ' <button class="link" data-act="postdel" data-st="' + esc(st) + '" data-post="' + esc(x) + '" title="Remove">×</button></span>'; }).join(' ') : 'none') +
        ' · <button class="link" data-act="postadd" data-st="' + esc(st) + '">+ post</button></div><div class="whosub">Point person: ' + (leads.length ? leads.map(function (l) { return esc(l.name + (l.day ? ' (' + l.day + ')' : '')); }).join(', ') : 'none yet') + ' · <button class="link" data-act="leadnew" data-st="' + esc(st) + '">+ point person</button></div>' +
        byStation[st].sort(function (a, b) { return a.sort - b.sort; }).map(function (s) {
          if (S.edit === s.id) return '<div class="editrow" data-id="' + esc(s.id) + '"><div class="row"><div><label>Station</label><input class="e-st" value="' + esc(s.station) + '" list="stl"></div><div><label>Date</label><input class="e-dt" type="date" value="' + esc(s.date) + '"></div></div>' +
            '<div class="row"><div><label>Block</label><select class="e-b">' + blockOpts(u, s.block) + '</select></div><div><label>Start</label><input class="e-s" type="time" value="' + esc(s.start) + '"></div><div><label>End</label><input class="e-e" type="time" value="' + esc(s.end) + '"></div><div><label>Spots</label><input class="e-sp" type="number" min="0" value="' + s.spots + '"></div></div>' +
            '<div class="row"><div><label>Who</label><select class="e-w">' + opt(WHO, s.who) + '</select></div><div><label>Counts as</label><input class="e-c" type="number" min="0" step="0.5" value="' + s.counts + '"></div><div><label>Status</label><select class="e-stt">' + opt(STATUS, s.status) + '</select></div></div>' +
            '<label>Note</label><input class="e-n" value="' + esc(s.notes) + '">' + (s.filled ? '<p class="muted">' + s.filled + ' signed up. Changing the date or time emails their families.</p>' : '') +
            '<div class="row" style="margin-top:8px"><button class="sm" data-act="saveshift" data-id="' + esc(s.id) + '">Save</button><button class="sm ghost" data-act="editshift" data-id="">Cancel</button></div></div>';
          return '<div class="status-line' + (s.status === 'Closed' ? ' closed' : '') + '"><div><div class="who">' + esc(s.label || label(toMin(s.start)) + ' – ' + label(toMin(s.end))) + ' <span class="muted">· ' + s.filled + ' of ' + s.spots + '</span></div><div class="whosub">' + esc([s.who, s.counts !== 1 ? 'counts ' + s.counts : '', s.status, s.notes, s.id].filter(String).join(' · ')) + '</div></div><button class="chk" data-act="editshift" data-id="' + esc(s.id) + '">Edit</button></div>';
        }).join('') + '</div>';
    });
    // point people
    html += '<div class="card" id="leadsCard"><h2>Point people</h2>' + (u.leads.length ? u.leads.map(function (l) {
      if (S.ledit === l.row) return leadForm(l);
      return '<div class="status-line"><div><div class="who">' + esc(l.name) + ' · ' + esc(l.station + (l.day ? ' (' + l.day + ')' : '')) + '</div><div class="whosub">' + esc([l.phone, l.email].filter(String).join(' · ') || 'no phone or email') + '</div></div><div class="acts"><button class="chk" data-act="leadedit" data-row="' + l.row + '">Edit</button>' + (l.email ? '<button class="chk" data-act="leademail" data-row="' + l.row + '">Email link</button>' : '') + '<button class="chk ns" data-act="leaddel" data-row="' + l.row + '" data-name="' + esc(l.name) + '">Remove</button></div></div>';
    }).join('') : '<p class="muted">None yet.</p>') + ((u.derivedLeads || []).length ? '<div class="whosub" style="margin-top:8px"><b>From placed signups</b> (Groups tab › Lead station): ' + esc(u.derivedLeads.map(function (l) { return l.name + ' · ' + l.group + ' (' + l.day + ')'; }).join('; ')) + '. They sign in to the point-person page with their family code.</div>' : '') + (S.ledit === 'new' ? leadForm({ row: '', station: S.lstation || '', day: '', name: '', phone: '', email: '' }) : '<div style="margin-top:10px"><button class="sm ghost" data-act="leadnew">+ Add a point person</button></div>') + '</div>';
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
    var a = S.access; if (!a) return '<div class="card">' + spin() + '</div>';
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
        '<label class="tog"><input type="checkbox" class="y-c"' + (r && r.contact ? ' checked' : '') + '> Director contact (sees director phone numbers and emails)</label>' +
        '<div class="row" style="margin-top:8px"><button class="sm" data-act="rsave" data-row="' + (r ? r.row : '') + '">Save</button><button class="sm ghost" data-act="redit" data-row="">Cancel</button></div></div>';
      var n = a.people.filter(function (p) { return p.role.toLowerCase() === r.name.toLowerCase(); }).length;
      return '<div class="status-line"><div><div class="who">' + esc(r.name) + ' <span class="muted">· ' + n + ' ' + (n === 1 ? 'person' : 'people') + '</span></div><div class="whosub">' + esc(r.description) + '</div><div class="whosub">' +
        (r.canEdit ? 'Can edit' : 'View only') + (r.canManage ? ' · Manages access' : '') + (r.contact ? ' · Director contact' : '') + '</div></div><div class="acts"><button class="chk w" data-act="redit" data-row="' + r.row + '">Edit</button>' + (n ? '' : '<button class="chk ns w" data-act="rdel" data-row="' + r.row + '" data-name="' + esc(r.name) + '">Remove</button>') + '</div></div>';
    };
    return '<div class="card"><h2>Admins and spotters · ' + a.people.length + '</h2><p class="muted">They sign in with Google at admin.html. Changes work on their next page load.</p>' +
      a.people.map(person).join('') + (S.aedit === 'new' ? person(null) : '<div style="margin-top:10px" class="w"><button class="sm ghost" data-act="aedit" data-row="new">+ Add someone</button></div>') + '</div>' +
      '<div class="card"><h2>Roles</h2>' + a.roles.map(role).join('') + (S.redit === 'new' ? role(null) : '<div style="margin-top:10px" class="w"><button class="sm ghost" data-act="redit" data-row="new">+ Add a role</button></div>') + '</div>';
  }
  function loadAccess() { return call({ action: 'adminAccess' }).then(function (r) { if (r.error) flash('err', r.error); else S.access = r; render(); }); }

  // ---------- units (contest-day tracking)
  function renderUnits() {
    var u = S.units; if (!u) return '<div class="card">' + spin() + '</div>';
    var form = function (x) {
      x = x || {}; var f = function (cls, lab, val, type) { return '<div><label>' + lab + '</label><input class="' + cls + '"' + (type ? ' type="' + type + '"' : '') + ' value="' + esc(val || '') + '"></div>'; };
      return '<div class="editrow w"><div class="row">' + f('u-n', 'Unit', x.name) + f('u-c', 'Class', x.cls) + f('u-o', 'Order', x.order, 'number') + '</div>' +
        '<div class="row">' + f('u-ti', 'To inspection', x.toInsp, 'time') + f('u-i', 'Inspection', x.insp, 'time') + f('u-w', 'Warm-up', x.warmup, 'time') + '</div>' +
        '<div class="row">' + f('u-th', 'To holding', x.toHold, 'time') + f('u-h', 'Holding', x.hold, 'time') + f('u-p', 'Perform', x.perform, 'time') + '</div>' +
        '<div class="row">' + f('u-a', 'Warm-up area', x.area) + f('u-hr', 'Home room (Areas tab name)', x.hr) + '</div>' +
        '<div class="row">' + f('u-d', 'Director', x.director) + (u.contact ? f('u-dp', 'Director cell', x.phone, 'tel') + f('u-de', 'Director email', x.email, 'email') : '') + '</div>' + (u.contact ? '' : '<div class="whosub">Director phone and email are hidden for your role.</div>') +
        '<label>Props</label><select class="u-pr">' + [['', 'Not set yet: check-in asks the director'], ['separate', 'Props & tarp (tracked on their own)'], ['none', 'No props or tarp'], ['guard', 'Tarp travels with the guard']].map(function (o) { return '<option value="' + o[0] + '"' + ((x.propsSet ? x.props : '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
        '<label>Notes</label><input class="u-no" value="' + esc(x.notes || '') + '">' +
        '<div class="row" style="margin-top:8px"><button class="sm" data-act="usave" data-id="' + esc(x.id || '') + '">Save</button><button class="sm ghost" data-act="uedit" data-id="">Cancel</button></div></div>';
    };
    var imp = '<div class="card"><h2>Import the IHSCGA schedule</h2><p class="muted">Copy the whole schedule table out of the IHSCGA PDF (or a sheet) and paste it here. Guards are matched by name, so re-importing a new version only changes times; everything already tapped stays. Break and Awards lines become markers on the board; "Exhibition - Name" lines become units.</p>' +
      '<textarea class="u-imp" rows="6" style="width:100%;font:13px ui-monospace,monospace">' + esc(S.uimp || '') + '</textarea><div class="row" style="margin-top:8px"><button class="sm ghost" data-act="uimp">Preview</button>' + (S.uprev ? '<button class="sm" data-act="uimpgo">Import ' + S.uprev.length + ' rows</button>' : '') + '</div>' +
      (S.uprev ? '<div style="margin-top:10px">' + S.uprev.map(function (x, i) { return '<div class="whosub">' + (i + 1) + '. <b>' + esc(x.name) + '</b> ' + (x.kind === 'marker' ? '<i>marker</i> ' + esc(x.perform) : esc([x.cls, x.toInsp && 'to insp ' + x.toInsp, x.insp && 'insp ' + x.insp, x.area && 'area ' + x.area, x.warmup && 'warm-up ' + x.warmup, x.toHold && 'to hold ' + x.toHold, x.hold && 'hold ' + x.hold, 'perform ' + x.perform].filter(Boolean).join(' · '))) + '</div>'; }).join('') + '</div>' : '') + '</div>';
    return imp + '<div class="card"><h2>Units · ' + u.units.length + '</h2><p class="muted">Order is performance order. Times are on ' + esc(u.date) + '. Home rooms come from the sheet\'s Areas tab (hallway sections; restrooms for changing).</p>' +
      '<div class="row" style="flex-wrap:wrap"><a class="cbtn alt" href="board.html">Open HQ board</a><a class="cbtn" href="track.html">Open station screens</a><a class="cbtn alt" href="live.html">Open public board</a></div>' +
      u.units.map(function (x) {
        if (S.uedit === x.id) return form(x);
        return '<div class="status-line"><div><div class="who">' + esc(x.order + '. ' + x.name) + (x.cls ? ' <span class="muted">' + esc(x.cls) + '</span>' : '') + '</div><div class="whosub">' +
          esc([x.insp ? 'inspection ' + x.insp : '', x.warmup ? 'warm-up ' + x.warmup + (x.area ? ' (' + x.area + ')' : '') : '', x.perform ? 'perform ' + x.perform : '', x.hr ? 'HR ' + x.hr : '', x.director, x.phone].filter(String).join(' · ')) + '</div></div>' +
          '<div class="acts"><button class="chk" data-act="ucopy" data-link="' + esc(x.link) + '">Copy director link</button><button class="chk w" data-act="uedit" data-id="' + esc(x.id) + '">Edit</button><button class="chk ns w" data-act="udel" data-id="' + esc(x.id) + '" data-name="' + esc(x.name) + '">Remove</button></div></div>';
      }).join('') + (S.uedit === 'new' ? form(null) : '<div class="w" style="margin-top:10px"><button class="sm ghost" data-act="uedit" data-id="new">+ Add a unit</button></div>') + '</div>' +
      '<div class="card"><h2>Steps</h2><p class="muted">Rename or add steps on the sheet\'s Steps tab.</p>' + ['Director', 'Guard', 'Equipment', 'Props', 'Together'].filter(function (t) { return u.steps.some(function (s) { return s.track === t; }); }).map(function (t) { return '<div class="whosub"><b>' + t + ':</b> ' + esc(u.steps.filter(function (s) { return s.track === t; }).map(function (s) { return s.name; }).join(' → ')) + '</div>'; }).join('') + '</div>';
  }
  function loadUnits() { return call({ action: 'adminUnits' }).then(function (r) { if (r.error) flash('err', r.error); else S.units = r; render(); }); }
  // trackers (in Access, super admins)
  function trackersCard() {
    var u = S.units; if (!u) return '<div class="card"><h2>Unit trackers</h2>' + spin() + '</div>';
    var form = function (t) {
      t = t || { steps: '' }; var all = /^all$/i.test(t.steps), has = function (id) { return all || new RegExp('(^|,\\s*)' + id + '(,|$)').test(t.steps.replace(/\s/g, '')); };
      return '<div class="editrow w"><div class="row"><div><label>Name</label><input class="t-n" value="' + esc(t.name || '') + '"></div><div><label>Google email (optional)</label><input class="t-e" type="email" value="' + esc(t.email || '') + '"></div></div>' +
        '<label class="tog"><input type="checkbox" class="t-v"' + (t.view ? ' checked' : '') + '> Can see the HQ board</label>' +
        '<label class="tog"><input type="checkbox" class="t-all"' + (all ? ' checked' : '') + '> Can update every step</label>' +
        '<div class="chips">' + u.steps.map(function (s) { return '<label class="chip' + (has(s.id) ? ' on' : '') + '"><input type="checkbox" class="t-s" value="' + esc(s.id) + '"' + (has(s.id) ? ' checked' : '') + ' style="display:none">' + esc(s.name) + '</label>'; }).join('') + '</div>' +
        '<div class="row" style="margin-top:8px"><button class="sm" data-act="tsave" data-row="' + (t.row || '') + '">Save</button><button class="sm ghost" data-act="tedit" data-row="">Cancel</button></div></div>';
    };
    var base = location.href.replace(/admin\.html.*$/, '');
    return '<div class="card"><h2>Unit trackers · ' + u.trackers.length + '</h2><p class="muted">People who aren\'t admins: pick whether they see the HQ board and which steps they can tap. Admins update everything; view-only roles see the board.</p>' +
      u.trackers.map(function (t) {
        if (S.tedit === t.row) return form(t);
        return '<div class="status-line"><div><div class="who">' + esc(t.name || t.email) + '</div><div class="whosub">' + esc([t.email, t.view ? 'sees board' : 'no board', t.steps ? 'steps: ' + t.steps : 'no steps'].filter(String).join(' · ')) + '</div></div>' +
          '<div class="acts"><button class="chk" data-act="ucopy" data-link="' + esc(base + 'track.html?t=' + t.code) + '">Copy link</button>' + (t.email ? '<button class="chk w" data-act="temail" data-row="' + t.row + '">Email link</button>' : '') +
          '<button class="chk w" data-act="tedit" data-row="' + t.row + '">Edit</button><button class="chk ns w" data-act="tdel" data-row="' + t.row + '">Remove</button></div></div>';
      }).join('') + (S.tedit === 'new' ? form(null) : '<div class="w" style="margin-top:10px"><button class="sm ghost" data-act="tedit" data-row="new">+ Add a tracker</button></div>') + '</div>';
  }

  function render() {
    if (!S.who) return renderSignIn();
    var body = S.view === 'units' ? renderUnits() : S.view === 'access' ? renderAccess() + trackersCard() : S.view === 'setup' ? renderSetup() : S.view === 'fam' ? renderFam() : S.view === 'short' ? renderShort() : S.view === 'review' ? renderReview() : S.view === 'actas' ? renderActAs() : S.view === 'hat' ? renderHat() : S.view === 'checks' ? renderChecks() : S.view === 'shirts' ? renderShirts() : renderGrid();
    var ro = S.who.canEdit === false || S.spot;
    app.innerHTML = header() + (ro ? '<div class="banner info">' + (S.who.canEdit === false ? 'View only. As ' + esc(S.who.role) + ' you see everything but can\'t change anything.' : 'Spotter mode is on: you can look around without changing anything. Tap SPOTTER ON in the title to edit again.') + '</div>' : '') + banner() + body + footer();
    if (ro) Array.prototype.forEach.call(app.querySelectorAll('.w, .postsel, .plc, [data-act=mark], [data-act=cancel], [data-act=xcancel], [data-act=place], [data-act=resend], [data-act=newday], [data-act=editshift], [data-act=postadd], [data-act=postdel], [data-act=leadnew], [data-act=leadedit], [data-act=leademail], [data-act=leaddel]'), function (el) { el.remove(); });
  }

  // ---------- loading
  function spin() { return window.sosSpin ? sosSpin() : '<p class="muted">Loading…</p>'; }
  function loadDay(date) { return call({ action: 'adminDay', date: date || S.date || '' }).then(function (r) { if (r.error) flash('err', r.error); else { S.day = r; S.date = r.date; } render(); }); }
  function loadFam(fid) { return call({ action: 'adminFamily', familyId: fid }).then(function (r) { if (r.error) flash('err', r.error); else S.fam = r; S.view = 'fam'; render(); }); }
  function loadShort() { S.short = null; render(); return call({ action: 'adminShort', which: S.which }).then(function (r) { if (r.error) flash('err', r.error); else S.short = r; render(); }); }
  function loadFlags() { S.flags = null; render(); return call({ action: 'adminFlags' }).then(function (r) { if (r.error) flash('err', r.error); else S.flags = r; render(); }); }
  function refresh() { return S.view === 'fam' && S.fam ? loadFam(S.fam.family.id) : loadDay(); }
  // Nov 21 (Nick): one place that opens a screen and loads only what that screen needs (nav pills and direct links both use it)
  var VIEWS = ['grid', 'setup', 'units', 'fam', 'short', 'hat', 'checks', 'shirts', 'review', 'actas', 'access'];
  function goView(v) {
    S.view = v;
    if (v === 'units') loadUnits(); else if (v === 'access') { loadAccess(); loadUnits(); } else if (v === 'setup') loadSetup(); else if (v === 'short') loadShort();
    else if (v === 'review') loadFlags(); else if (v === 'hat') loadHat(); else if (v === 'actas') loadActAs(S.asq || ''); else if (v === 'checks') loadChecks(); else if (v === 'shirts') loadShirts(); else if (v === 'grid') loadDay(); else render();
  }
  // Direct links ("warp zones" from Nick's launcher): admin.html?v=short, ?v=fam&q=Smith (searches right away), ?date=YYYY-MM-DD (day grid).
  // Only the screen asked for loads; the day grid isn't fetched first. Sign-in and the server's access checks are unchanged.
  function startView() {
    var q = {}; location.search.replace(/^\?/, '').split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); });
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.date || '')) S.date = q.date;
    var v = VIEWS.indexOf(q.v) >= 0 ? q.v : 'grid';
    if (v === 'access' && !S.who.canManage) v = 'grid';
    if (v === 'checks' && !S.who.bgOn) v = 'grid';
    if (v === 'shirts' && !S.who.shirtsOn) v = 'grid';
    if (v === 'fam' && q.q) { S.view = 'fam'; S.famQ = q.q; S.famHits = null; render(); return call({ action: 'adminSearch', q: q.q }).then(function (r) { S.famHits = r.people || []; if (S.famHits.length === 1 && S.famHits[0].familyId) return loadFam(S.famHits[0].familyId); render(); }); }
    goView(v);
  }
  function start() {
    call({ action: 'adminWho' }).then(function (r) {
      if (r.error) { S.who = null; if (!S.msg) flash('err', r.error); return render(); }
      try { localStorage.setItem('sosAdminSeen', '1'); localStorage.removeItem('sosAdminOut'); } catch (e) {}
      putS('sosAutoNo', ''); S.who = r; S.msg = null; startView();
    });
  }

  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.classList.contains('t-s')) { t.closest('.chip').classList.toggle('on', t.checked); return; }
    if (t.classList.contains('bgsel')) { t.disabled = true; call({ action: 'adminBgSet', personId: t.getAttribute('data-pid'), status: t.value }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Saved.'); if (S.view === 'checks') loadChecks(); else if (S.fam) loadFam(S.fam.family.id); }); return; }
    if (t.classList.contains('shsel')) { t.disabled = true; call({ action: 'adminShirtSet', personId: t.getAttribute('data-pid'), size: t.value }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Saved.'); if (S.view === 'shirts') loadShirts(); else if (S.fam) loadFam(S.fam.family.id); }); return; }
    if (t.classList.contains('postsel')) { t.disabled = true; call({ action: 'setPost', signupId: t.getAttribute('data-id'), post: t.value }).then(function (r) { if (r.error) flash('err', r.error); loadDay(); }); return; }
    if (t.classList.contains('plc') && t.value) { var x = t.getAttribute('data-x'), sid = t.value; t.disabled = true;
      call({ action: 'adminPlace', extraId: x, shiftId: sid, overfill: true }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Placed.'); loadDay(); }); }
  });
  app.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'addq') app.querySelector('[data-act=addsearch]').click();
    if (e.target.id === 'famq') app.querySelector('[data-act=famsearch]').click();
    if (e.target.id === 'asq') app.querySelector('[data-act=assearch]').click();
    if (e.target.classList.contains('x-q')) app.querySelector('[data-act=afind]').click();
  });
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'); S.msg = null;
    if (act === 'view') goView(b.getAttribute('data-v'));
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
    else if (act === 'assearch') { loadActAs((document.getElementById('asq') || {}).value || ''); }
    else if (act === 'hatplace') { b.disabled = true; call({ action: 'adminHatPlace', hatId: b.getAttribute('data-id') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || ('Placed.' + (r.notPicked ? ' ' + r.notPicked + ' other(s) emailed that they weren\'t picked.' : ''))); loadHat(); }); }
    else if (act === 'hatclose') { if (!confirm('Mark everyone still pending on this spot as not picked and email them?')) return; b.disabled = true; call({ action: 'adminHatClose', shiftId: b.getAttribute('data-id') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || (r.notPicked + ' emailed.')); loadHat(); }); }
    else if (act === 'resend') { b.disabled = true; call({ action: 'adminSendCode', familyId: b.getAttribute('data-fid') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || r.msg); render(); }); }
    else if (act === 'which') { S.which = b.getAttribute('data-w'); loadShort(); }
    else if (act === 'shirtcsv') { call({ action: 'adminShirtsCsv' }).then(function (r) { if (r.error) { flash('err', r.error); return render(); } var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv' })); a.download = 'sos-crew-shirts.csv'; document.body.appendChild(a); a.click(); a.remove(); }); }
    else if (act === 'csv') { call({ action: 'adminShortCsv', which: S.which }).then(function (r) { if (r.error) { flash('err', r.error); return render(); } var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv' })); a.download = 'sos-crew-short-' + S.which + '.csv'; document.body.appendChild(a); a.click(); a.remove(); }); }
    else if (act === 'sday') { S.sdate = b.getAttribute('data-date'); S.edit = ''; S.newday = false; render(); }
    else if (act === 'newday') { S.newday = !S.newday; render(); }
    else if (act === 'newdayok') { var nd = document.getElementById('nd').value; if (!nd) return; S.sdate = nd; S.keepDay = true; S.newday = false; if (!S.setup.days.some(function (x) { return x.date === nd; })) S.setup.days.push({ date: nd, day: '' }); S.setup.days.sort(function (a, c) { return a.date < c.date ? -1 : 1; }); render(); }
    else if (act === 'addshift') {
      var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }, all = document.getElementById('aall');
      var base = { station: v('as'), date: S.sdate, spots: v('asp'), who: v('awh'), counts: v('aco'), status: v('ass'), notes: v('ano') }, items = [];
      if (!S.sdate) { flash('err', 'Pick a day first (or + Day).'); return render(); }
      if (all && all.checked) { var seen = {}; S.setup.shifts.filter(function (s) { return s.date === S.sdate && s.status !== 'Closed' && !s.block && s.start; }).forEach(function (s) { var k = s.start + '-' + s.end; if (!seen[k]) { seen[k] = 1; items.push(Object.assign({}, base, { start: s.start, end: s.end })); } }); }
      else items.push(Object.assign({}, base, v('abl') ? { block: v('abl') } : { start: v('ast'), end: v('aen') }));
      b.disabled = true;
      call({ action: 'adminShiftAdd', items: items }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || items.length + ' shift(s) added to ' + base.station + '.'); S.keepDay = false; loadSetup(); });
    }
    else if (act === 'editshift') { S.edit = b.getAttribute('data-id') || ''; render(); }
    else if (act === 'blsave') { var br = b.closest('.blk'), bv = function (c) { return br.querySelector(c).value.trim(); }; b.disabled = true;
      call({ action: 'adminBlockSave', id: b.getAttribute('data-id'), label: bv('.bl-l'), start: bv('.bl-s'), end: bv('.bl-e'), order: bv('.bl-o') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Block saved: every shift in it shows the change.'); loadSetup(); }); }
    else if (act === 'saveshift') {
      var row = b.closest('.editrow'), g = function (c) { return row.querySelector(c).value.trim(); };
      var d2 = { action: 'adminShiftSave', id: b.getAttribute('data-id'), station: g('.e-st'), date: g('.e-dt'), block: g('.e-b'), start: g('.e-s'), end: g('.e-e'), spots: g('.e-sp'), who: g('.e-w'), counts: g('.e-c'), status: g('.e-stt'), notes: g('.e-n') };
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
      call({ action: 'adminRoleSave', row: b.getAttribute('data-row') || '', name: re.querySelector('.y-n').value.trim(), description: re.querySelector('.y-d').value.trim(), canEdit: re.querySelector('.y-e').checked, canManage: re.querySelector('.y-m').checked, contact: re.querySelector('.y-c').checked })
        .then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Role saved.'); if (!r.error) S.redit = ''; loadAccess(); }); }
    else if (act === 'rdel') { if (!confirm('Remove the role ' + b.getAttribute('data-name') + '?')) return; b.disabled = true;
      call({ action: 'adminRoleDelete', row: b.getAttribute('data-row'), name: b.getAttribute('data-name') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Role removed.'); loadAccess(); }); }
    else if (act === 'uedit') { S.uedit = b.getAttribute('data-id') || ''; render(); }
    else if (act === 'uimp' || act === 'uimpgo') { var ta = document.querySelector('.u-imp'); S.uimp = ta ? ta.value : S.uimp; b.disabled = true;
      call({ action: 'adminScheduleImport', text: S.uimp, apply: act === 'uimpgo' }).then(function (r) {
        if (r.error) { flash('err', r.error); S.uprev = null; render(); return; }
        if (r.preview) { S.uprev = r.preview; render(); return; }
        S.uprev = null; S.uimp = ''; flash('ok', 'Schedule imported: ' + r.updated + ' updated, ' + r.added + ' added.' + (r.missing.length ? ' Not in this schedule (left as is): ' + r.missing.join(', ') + '.' : '')); loadUnits(); }); }
    else if (act === 'usave') { var ue = b.closest('.editrow'), uv = function (c) { return ue.querySelector(c).value.trim(); }; b.disabled = true;
      call({ action: 'adminUnitSave', id: b.getAttribute('data-id') || '', name: uv('.u-n'), cls: uv('.u-c'), order: uv('.u-o'), toInsp: uv('.u-ti'), insp: uv('.u-i'), warmup: uv('.u-w'), toHold: uv('.u-th'), hold: uv('.u-h'), perform: uv('.u-p'), area: uv('.u-a'), hr: uv('.u-hr'), director: uv('.u-d'), phone: S.units.contact ? uv('.u-dp') : '', email: S.units.contact ? uv('.u-de') : '', notes: uv('.u-no'), props: uv('.u-pr') })
        .then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Unit saved.'); if (!r.error) S.uedit = ''; loadUnits(); }); }
    else if (act === 'udel') { if (!confirm('Remove ' + b.getAttribute('data-name') + '?')) return; b.disabled = true;
      call({ action: 'adminUnitDelete', id: b.getAttribute('data-id') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Removed.'); loadUnits(); }); }
    else if (act === 'ucopy') { var lk = b.getAttribute('data-link'); (navigator.clipboard ? navigator.clipboard.writeText(lk) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { prompt('Copy this link:', lk); }); }
    else if (act === 'tedit') { var tr = b.getAttribute('data-row'); S.tedit = tr === 'new' ? 'new' : tr ? +tr : ''; render(); }
    else if (act === 'tsave') { var te = b.closest('.editrow'); b.disabled = true;
      call({ action: 'adminTrackerSave', row: b.getAttribute('data-row') || '', name: te.querySelector('.t-n').value.trim(), email: te.querySelector('.t-e').value.trim(), view: te.querySelector('.t-v').checked, all: te.querySelector('.t-all').checked,
        steps: Array.prototype.filter.call(te.querySelectorAll('.t-s'), function (x) { return x.checked; }).map(function (x) { return x.value; }) })
        .then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Tracker saved.'); if (!r.error) S.tedit = ''; loadUnits(); }); }
    else if (act === 'tdel') { if (!confirm('Remove this tracker?')) return; b.disabled = true; call({ action: 'adminTrackerDelete', row: b.getAttribute('data-row') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Removed.'); loadUnits(); }); }
    else if (act === 'temail') { b.disabled = true; call({ action: 'adminTrackerEmail', row: b.getAttribute('data-row') }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || r.msg); render(); }); }
    else if (act === 'out') { if (/^sess_/.test(S.token || '')) call({ action: 'adminSignOut' }); S.token = ''; putL(TOK, ''); S.who = null; try { localStorage.setItem('sosAdminOut', '1'); } catch (x) {} try { google.accounts.id.disableAutoSelect(); } catch (x) {} render(); }   // Nov 22: Sign out turns automatic sign-in off until the next manual sign-in
  });

  S.token = getL(TOK) || getS(TOK); if (S.token && tokExpired(S.token)) { S.token = ''; putL(TOK, ''); }   // an old sign-in: go straight to (automatic) sign-in S.spot = getS('sosSpotMode') !== '0';   // admins start in Spotter mode; tapping the pill turns it off for this tab
  call({ action: 'config' }).then(function (r) { if (!r.error) S.cfg = r; if (S.token) start(); else render(); });
})();
