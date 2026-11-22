/* SOS Crew – family page: sign in with the family code, see what's owed, pick spots by day.
 * Copyright (c) 2026 NE Prints & Design, LLC. All rights reserved.
 * Talks to the Apps Script web app at window.SOS.API. Holds no data; the family code is remembered only in this browser. */
(function () {
  'use strict';
  var C = window.SOS || {}, API = C.API, app = document.getElementById('app');
  var KEY = (C.ENV === 'LIVE' ? '' : 'sbx_') + 'sosCode';
  var S = { code: '', fam: null, day: null, date: '', msg: null, picking: '', busy: false, open: {}, filter: {}, onlyOpen: false, fopen: false };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  var AS = window.sosActAs ? sosActAs(['fam']) : null;   // admin acting as this family: don't touch this browser's own sign-in
  function put(k, v) { if (AS && k === KEY) return; try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }
  function label(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mi = m % 60, ap = h >= 12 ? 'PM' : 'AM'; return (h % 12 || 12) + (mi ? ':' + ('0' + mi).slice(-2) : '') + ' ' + ap; }
  function hhmm(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
  function dayParts(iso) { var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); return { dow: d.toLocaleDateString('en-US', { weekday: 'short' }), md: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), long: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }; }
  function tel(p) { var d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '+1' + d : d; }
  function smsHref(phones, body) {
    var list = phones.map(tel).filter(String).join(','), ios = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
    return ios ? 'sms:/open?addresses=' + list + (body ? '&body=' + encodeURIComponent(body) : '') : 'sms:' + list + (body ? '?body=' + encodeURIComponent(body) : '');
  }
  function nameOf(pid) { var p = (S.fam.people || []).filter(function (x) { return x.id === pid; })[0]; return p ? p.first : pid; }

  function call(d) {
    if (!API) return Promise.resolve({ error: 'This site is not connected yet.' });
    return fetch(API, { method: 'POST', body: JSON.stringify(d) }).then(function (r) { return r.json(); })
      .catch(function () { return { error: 'Could not reach the server. Check your connection and try again.' }; });
  }

  // ---------- screens
  function header(sub) {
    var cf = S.fam || S.cfg || {}, name = cf.app || C.NAME || 'SOS Crew', ev = cf.event || C.EVENT || '';
    return (C.ENV !== 'LIVE' ? '<div class="sandbox">TEST SITE</div>' : '') +
      '<header><img class=\"logo\" src=\"img/logo-160.png\" alt=\"SOS Crew – Edgewood Winter Guard\" width=\"72\" height=\"72\"><div class="eyebrow">' + esc(ev) + '</div><h1>' + esc(name) + (S.fam && S.fam.admin ? ' <a class="adminpill' + (S.fam.admin.canEdit === false ? ' spot' : '') + '" href="admin.html">' + esc(S.fam.admin.name || 'Admin') + '</a>' : '') + '</h1><div class="hsub">' + esc(sub || 'Volunteer signup') + '</div></header>';
  }
  function footer() {
    var c = ((S.fam || S.cfg || {}).contact) || C.CONTACT;
    return '<footer><a href="help/">Help and how-to videos</a> · Questions? <a href="mailto:' + esc(c) + '">' + esc(c) + '</a>' + (S.code ? ' · <button class="link" data-act="signout">Sign out</button>' : '') +
      ' · <button class="link" data-theme-toggle>Theme: ' + (window.sosTheme ? sosTheme.label() : 'Auto') + '</button>' +
      '<span class="legal">© 2026 NE Prints &amp; Design, LLC. All rights reserved.</span></footer>';
  }
  function banner() { return S.msg ? '<div class="banner ' + S.msg.kind + '">' + esc(S.msg.text) + '</div>' : ''; }

  function renderSignIn() {
    if (S.reg) return renderRegister();
    var gid = (S.cfg && S.cfg.googleClientId) || C.GOOGLE_CLIENT_ID;
    app.innerHTML = header('Sign in to pick your shifts') + banner() +
      (S.choose ? '<div class="card"><h2>Which family?</h2>' + S.choose.map(function (c) { return '<button class="ghost" style="width:100%;margin-top:8px" data-act="usecode" data-code="' + esc(c.code) + '">' + esc(c.name) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="card"><h2>Sign in</h2>' +
      (gid ? '<div id="gbtn" style="display:flex;justify-content:center;min-height:44px"></div><div class="or">or</div>' : '') +
      '<label for="em">Your email</label><input id="em" type="email" autocomplete="email" inputmode="email" value="' + esc(S.email || '') + '">' +
      '<div style="margin-top:12px"><button data-act="start" style="width:100%">Continue</button></div>' +
      '<p class="muted" style="margin-bottom:0">We\'ll email you a sign-in link. New to ' + esc((S.cfg && S.cfg.app) || C.NAME) + '? Enter your email and we\'ll get your family set up.</p></div>' +
      '<div class="card"><details><summary>Have a family code?</summary>' +
      '<label for="code">Family code</label><input id="code" autocapitalize="characters" placeholder="e.g. K7QM2P">' +
      '<div style="margin-top:12px"><button class="ghost" data-act="signin" style="width:100%">Open my family page</button></div></details></div>' + footer();
    if (gid) googleButton(gid);
  }
  function groupOpts(sel) { return '<option value="">Group…</option>' + ((S.cfg && S.cfg.groups) || []).map(function (g) { return '<option' + (g === sel ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join(''); }
  function renderRegister() {
    var r = S.reg;
    var kid = function (k, i) {
      return '<div class="kid" data-i="' + i + '"><div class="row"><div><label>Student first name</label><input class="kf" value="' + esc(k.first) + '"></div><div><label>Last name</label><input class="kl" value="' + esc(k.last) + '" placeholder="' + esc(r.last || '') + '"></div></div>' +
        '<div class="row"><div><label>Group</label><select class="kg">' + groupOpts(k.group) + '</select></div><div><label>Student\'s cell, if they have one (for texts)</label><input class="kp" type="tel" value="' + esc(k.phone || '') + '"></div></div>' + (i ? '<button class="link" data-act="kidrm" data-i="' + i + '">Remove</button>' : '') + '</div>';
    };
    app.innerHTML = header('Set up your family') + banner() +
      '<div class="card"><h2>You</h2>' +
      '<label for="rem">Email</label><input id="rem" type="email" value="' + esc(r.email) + '"' + (r.verified ? ' disabled' : '') + '>' +
      (r.verified ? '<div class="muted">Verified with Google</div>' : '') +
      '<div class="row"><div><label for="rf">First name</label><input id="rf" value="' + esc(r.first || '') + '" autocomplete="given-name"></div><div><label for="rl">Last name</label><input id="rl" value="' + esc(r.last || '') + '" autocomplete="family-name"></div></div>' +
      '<label for="rp">Cell phone (for texts)</label><input id="rp" type="tel" autocomplete="tel" value="' + esc(r.phone || '') + '">' +
      '<label class="tog"><input type="checkbox" id="rstu"' + (r.isStudent ? ' checked' : '') + '> I am a current student</label>' +
      (r.isStudent ? '<label for="rg">Your group</label><select id="rg">' + groupOpts(r.group) + '</select>' : '') + '</div>' +
      '<div class="card"><h2>' + (r.isStudent ? 'Brothers or sisters in the program (optional)' : 'Your students') + '</h2><p class="muted">Everyone in JH Band, HS Band, Winter Guard or Winter Percussion.</p>' + r.kids.map(kid).join('<hr>') +
      '<div style="margin-top:12px"><button class="ghost sm" data-act="kidadd">+ Another student</button></div></div>' +
      '<div class="card"><details' + (r.p2open ? ' open' : '') + '><summary>' + (r.isStudent ? 'Add a parent (optional)' : 'Add a second parent (optional)') + '</summary>' +
      '<div class="row"><div><label for="p2f">First name</label><input id="p2f" value="' + esc(r.p2first || '') + '"></div><div><label for="p2l">Last name</label><input id="p2l" value="' + esc(r.p2last || '') + '"></div></div>' +
      '<label for="p2e">Email (they can sign in too)</label><input id="p2e" type="email" value="' + esc(r.p2email || '') + '">' +
      '<label for="p2p">Cell phone (for texts)</label><input id="p2p" type="tel" value="' + esc(r.p2phone || '') + '"></details></div>' +
      '<div class="card"><button data-act="register" style="width:100%">Create my family</button>' +
      '<div style="text-align:center;margin-top:10px"><button class="link" data-act="regcancel">Back</button></div></div>' + footer();
  }
  function readRegister() {
    var r = S.reg, v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    if (!r.verified) r.email = v('rem');
    r.first = v('rf'); r.last = v('rl'); r.phone = v('rp'); r.p2first = v('p2f'); r.p2last = v('p2l'); r.p2email = v('p2e'); r.p2phone = v('p2p'); var su = document.getElementById('rstu'); r.isStudent = !!(su && su.checked); r.group = v('rg') || r.group;
    r.p2open = !!(r.p2first || r.p2email);
    r.kids = Array.prototype.map.call(document.querySelectorAll('.kid'), function (el) { return { first: el.querySelector('.kf').value.trim(), last: el.querySelector('.kl').value.trim(), group: el.querySelector('.kg').value, phone: el.querySelector('.kp').value.trim() }; });
    if (r.isStudent) r.kids = r.kids.filter(function (k) { return k.first; });
  }
  var gsiLoading = false;
  function googleButton(gid) {
    var draw = function () {
      var el = document.getElementById('gbtn'); if (!el || !window.google || !google.accounts) return;
      google.accounts.id.initialize({ client_id: gid, callback: function (resp) { S.msg = null; googleDone(resp.credential); } });
      google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 280 });
    };
    if (window.google && google.accounts) return draw();
    if (gsiLoading) return; gsiLoading = true;
    var sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = draw; document.head.appendChild(sc);
  }
  function googleDone(token) {
    app.querySelector('#gbtn') && (app.querySelector('#gbtn').innerHTML = '<span class="muted">Signing in…</span>');
    call({ action: 'google', idToken: token }).then(function (r) {
      if (r.error) { flash('err', r.error); return render(); }
      if (r.code) return loadFamily(r.code);
      if (r.choose) { S.choose = r.choose; return render(); }
      if (r.register) { S.reg = { email: r.email, verified: true, idToken: token, first: r.first, last: r.last, kids: [{ first: '', last: '', group: '' }] }; render(); }
    });
  }

  function statusCard() {
    var st = S.fam.status;
    if (!st.decided) return '<div class="card"><h2>Your family</h2><p class="muted">How many shifts each family and student owes will be posted soon. You can sign up now.</p></div>';
    return '<div class="card"><h2>What your family owes</h2>' + st.lines.map(function (l) {
      var pill = l.needSignup <= 0 ? '<span class="pill done">Signed up ✓</span>' : '<span class="pill need">' + l.needSignup + ' more</span>';
      return '<div class="status-line"><div><div class="who">' + esc(l.who) + '</div><div class="whosub">' + (l.group ? esc(l.group) + ' · ' : '') + 'owes ' + l.owed + ' · signed up ' + l.signed + (l.worked ? ' · worked ' + l.worked : '') + '</div></div>' + pill + '</div>';
    }).join('') + '</div>';
  }
  function bgCard() {
    if (!S.fam.bgOn) return '';
    var ad = (S.fam.people || []).filter(function (p) { return p.type !== 'Student'; }); if (!ad.length) return '';
    return '<div class="card"><h2>Background checks</h2><p class="muted">Adults who volunteer need a background check on file with the school. Students are exempt.' + (S.fam.bgInfo ? ' ' + esc(S.fam.bgInfo) : '') + '</p>' +
      ad.map(function (p) { var ok = p.bg === 'Cleared' || p.bg === 'Exempt'; return '<div class="status-line"><div><div class="who">' + esc(p.name) + '</div>' + (p.bgDate ? '<div class="whosub">' + esc(p.bgDate) + '</div>' : '') + '</div><span class="pill ' + (ok ? 'done' : p.bg === 'Pending' ? 'tbd' : 'need') + '">' + esc(p.bg || 'Not on file') + '</span></div>'; }).join('') + '</div>';
  }
  function mineCard() {
    var m = S.fam.mine || [], hat = S.fam.hat || [];
    if (!m.length && !hat.length) return '';
    var hl = hat.map(function (x) { var dp = dayParts(x.date); return '<li><div><div class="who">' + esc(x.person) + ' · ' + esc(x.station) + ' <span class="pill tbd">' + (x.status === 'Pending' ? 'Name in – pending' : 'Not picked') + '</span></div><div class="whosub">' + esc(dp.dow + ' ' + dp.md + ', ' + x.label) + (x.status === 'Pending' ? ' · doesn\'t count toward your shifts unless you\'re placed' : ' · thanks for offering') + '</div></div>' + (x.status === 'Pending' ? '<button class="sm ghost" data-act="hatout" data-id="' + esc(x.hatId) + '">Take name out</button>' : '') + '</li>'; }).join('');
    return '<div class="card mine"><h2>Your shifts</h2><ul>' + m.map(function (x) {
      var dp = dayParts(x.date), act = x.status === 'Signed up' ? '<button class="sm ghost" data-act="' + (x.extraId ? 'xcancel' : 'cancel') + '" data-id="' + esc(x.extraId || x.signupId) + '">Cancel</button>' : '<span class="pill done">' + esc(x.status) + '</span>';
      var lead = '';
      if (x.lead) lead = '<div class="leadline">Point person: <b>' + esc(x.lead.name) + '</b>' + (x.lead.phone ? ' <a class="cbtn" href="tel:' + tel(x.lead.phone) + '">Call</a><a class="cbtn" href="' + smsHref([x.lead.phone], 'Hi ' + x.lead.name + ', this is ' + x.person + ' (' + x.station + ', ' + dp.dow + ' ' + x.label + '). ') + '">Text</a>' : '<div class="whosub">' + esc(x.lead.opens || '') + '</div>') + '</div>';
      return '<li><div><div class="who">' + esc(x.person) + ' · ' + esc(x.station) + (x.post ? ' <span class="pill tbd">' + esc(x.post) + '</span>' : '') + '</div><div class="whosub">' + esc(dp.dow + ' ' + dp.md + ', ' + x.label) + '</div>' + lead + '</div>' + act + '</li>';
    }).join('') + hl + '</ul></div>';
  }
  function calCard() {
    var c = S.fam.calendar; if (!c || !(S.fam.mine || []).length) return '';
    return '<div class="card"><details' + (S.calOpen ? ' open' : '') + ' id="caldet"><summary>Put your family\'s shifts on your calendar</summary>' +
      '<p class="muted">It updates on its own: new shifts, time changes and cancellations show up without doing anything.</p>' +
      '<div class="row" style="flex-wrap:wrap"><a class="cbtn alt" href="' + esc(c.webcal) + '">iPhone / Mac / Outlook</a><a class="cbtn" href="' + esc(c.google) + '" target="_blank" rel="noopener">Google Calendar</a>' +
      '<button class="link" data-act="calcopy" data-link="' + esc(c.https) + '">Copy link</button></div>' +
      '<p class="muted" style="margin-bottom:0">Reminders come the day before and 2 hours before. On iPhone, if they don\'t show: Settings › Calendar › Accounts › Subscribed Calendars › SOS Crew › turn off <b>Remove Alerts</b>. Google Calendar shows the shifts but doesn\'t send reminders for subscribed calendars, so set your own reminder or check back here.</p></details></div>';
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
    else if (S.fam.hatOpen && s.hatFor && s.hatFor.length) btn = '<button class="sm ghost" data-act="hatpick" data-id="' + esc(s.id) + '">Put my name in</button>';
    else if ((!full || s.who === 'Assigned') && s.reason && !s.can.length) btn = '<span class="pill tbd">' + esc(s.reason) + '</span>';
    var picker = S.picking === s.id ? '<div class="picker"><div class="muted" style="margin-bottom:6px">Who is working this?</div><div class="row">' +
      s.can.map(function (pid) { return '<button class="sm" data-act="claim" data-id="' + esc(s.id) + '" data-pid="' + esc(pid) + '">' + esc(nameOf(pid)) + '</button>'; }).join('') +
      '<button class="sm ghost" data-act="pick" data-id="">Never mind</button></div></div>' : '';
    if (S.hatPicking === s.id) picker = '<div class="picker"><div class="muted" style="margin-bottom:6px">The coordinators fill this spot. Putting a name in doesn\'t hold it or count toward your shifts until they place you; we\'ll let you know either way.</div>' +
      '<label for="hatnote">Anything they should know? (optional)</label><input id="hatnote" maxlength="300" placeholder="e.g. I did this last year">' +
      '<div class="row" style="margin-top:8px">' + s.hatFor.map(function (pid) { return '<button class="sm" data-act="hatadd" data-id="' + esc(s.id) + '" data-pid="' + esc(pid) + '">' + esc(nameOf(pid)) + '</button>'; }).join('') +
      '<button class="sm ghost" data-act="hatpick" data-id="">Never mind</button></div></div>';
    if (s.who === 'Assigned') full = true;
    return '<div class="st' + (full ? ' full' : '') + '"><div><div class="nm">' + esc(s.station) + '</div><div class="meta">' +
      (s.who === 'Assigned' ? 'Filled by the coordinators' : full ? '<span class="open zero">Full</span>' : '<span class="open">' + s.open + ' of ' + s.spots + ' open</span>') +
      (s.counts !== 1 ? ' · counts as ' + s.counts : '') + (s.notes ? ' · ' + esc(s.notes) : '') + '</div>' +
      (yours ? '<div class="yours">You: ' + esc(yours) + '</div>' : '') + (s.hatIn && s.hatIn.length ? '<div class="yours">Name in: ' + esc(s.hatIn.map(function (h) { return nameOf(h.person); }).join(', ')) + ' · pending</div>' : '') + (s.names && s.names.length ? '<div class="names">' + esc(s.names.join(', ')) + '</div>' : '') + '</div>' + btn + '</div>' + picker;
  }
  function keep(s) {
    if (S.onlyOpen && (s.open <= 0 || s.who === 'Assigned') && !s.yours.length) return false;
    var f = Object.keys(S.filter);
    return !f.length || S.filter[s.station];
  }
  function filterCard() {
    var names = {}; S.day.blocks.forEach(function (b) { b.stations.forEach(function (s) { names[s.station] = 1; }); });
    var list = Object.keys(names).sort(), n = Object.keys(S.filter).length;
    return '<div class="card filter"><details' + (S.fopen ? ' open' : '') + ' id="fdet"><summary>Filter' + (n ? ' · ' + n + ' station' + (n > 1 ? 's' : '') : '') + (S.onlyOpen ? ' · open spots only' : '') + '</summary>' +
      '<label class="tog"><input type="checkbox" id="fopen"' + (S.onlyOpen ? ' checked' : '') + '> Only show spots with openings</label>' +
      '<div class="chips">' + list.map(function (x) { return '<button class="chip' + (S.filter[x] ? ' on' : '') + '" data-act="fchip" data-st="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>' +
      '<div class="row" style="margin-top:8px"><button class="sm ghost" data-act="fclear">Clear</button><button class="sm ghost" data-act="expand">Expand all</button><button class="sm ghost" data-act="collapse">Collapse all</button></div></details></div>';
  }
  function saveView() { put('sosView', JSON.stringify({ filter: S.filter, onlyOpen: S.onlyOpen })); }
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
      '<div class="whosub">A current student? Pick Student; students are exempt from background checks.</div>' +
      '<label for="aph">Cell phone (for texts; students too, if they have one)</label><input id="aph" type="tel">' +
      '<div style="margin-top:12px"><button class="ghost" data-act="add" style="width:100%">Add to my family</button></div></details></div>';
  }
  function renderFamily() {
    var dp = S.day && S.day.date ? dayParts(S.day.date) : null;
    var html = header(S.fam.family.name) + banner();
    if (!S.fam.open) html += '<div class="banner info">Signups aren\'t open yet. You can look around; we\'ll email when they open.</div>';
    if (S.fam.units && (S.fam.units.board || S.fam.units.track)) html += '<div class="card unitlinks"><h2>Contest day</h2><div class="row" style="flex-wrap:wrap">' + (S.fam.units.board ? '<a class="cbtn alt" href="board.html">Live unit board</a>' : '') + (S.fam.units.track ? '<a class="cbtn" href="track.html">Unit tracker</a>' : '') + '</div><p class="muted" style="margin-bottom:0">Sign in there with Google, or use your tracker link.</p></div>';
    html += statusCard() + bgCard() + mineCard() + calCard();
    if (S.day && S.day.days.length) {
      html += tabs();
      if (S.day.draft) html += '<div class="banner warn">Times are a draft until the contest schedule is final. If your shift moves, we\'ll email you.</div>';
      html += '<div class="muted" style="margin:10px 16px 0">' + esc(dp.long) + '</div>';
      html += filterCard();
      var shown = 0;
      html += S.day.blocks.map(function (b) {
        var sts = b.stations.filter(keep);
        if (!sts.length) return '';
        shown++;
        var key = S.day.date + '|' + b.start, open = S.open[key] || S.picking && sts.some(function (x) { return x.id === S.picking; });
        var free = sts.reduce(function (n, x) { return n + (x.who === 'Assigned' ? 0 : x.open); }, 0);
        var mineHere = sts.some(function (x) { return x.yours.length; });
        return '<details class="card block" data-key="' + esc(key) + '"' + (open ? ' open' : '') + '><summary><span class="bl">' + esc(b.label) + '</span>' +
          '<span class="bs">' + (mineHere ? '<span class="pill done">You\'re on</span> ' : '') + '<span class="open' + (free ? '' : ' zero') + '">' + (free ? free + ' open' : 'Full') + '</span></span></summary>' +
          sts.map(station).join('') + '</details>';
      }).join('');
      if (!shown) html += '<div class="card"><p class="muted">Nothing matches your filter this day. <button class="link" data-act="fclear">Show everything</button></p></div>';
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
  app.addEventListener('toggle', function (e) {
    var d = e.target; if (!d || d.tagName !== 'DETAILS') return;
    if (d.id === 'fdet') { S.fopen = d.open; return; }
    if (d.id === 'caldet') { S.calOpen = d.open; return; }
    var k = d.getAttribute('data-key'); if (k) S.open[k] = d.open;
  }, true);
  app.addEventListener('change', function (e) { if (e.target.id === 'rstu') { readRegister(); render(); return; } if (e.target.id === 'fopen') { S.onlyOpen = e.target.checked; saveView(); render(); } });
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    var lock = function () { b.disabled = true; };
    S.msg = null;
    if (act === 'start') {
      var em = document.getElementById('em').value.trim(); if (!em) return; S.email = em; lock();
      call({ action: 'start', email: em }).then(function (r) {
        if (r.error) flash('err', r.error);
        else if (r.register) S.reg = { email: r.email, kids: [{ first: '', last: '', group: '' }] };
        else flash('ok', r.msg);
        render();
      });
    }
    else if (act === 'usecode') { S.choose = null; loadFamily(b.getAttribute('data-code')); }
    else if (act === 'kidadd') { readRegister(); S.reg.kids.push({ first: '', last: '', group: '' }); render(); }
    else if (act === 'kidrm') { readRegister(); S.reg.kids.splice(+b.getAttribute('data-i'), 1); render(); }
    else if (act === 'regcancel') { S.reg = null; render(); }
    else if (act === 'register') {
      readRegister(); var r0 = S.reg; lock();
      call({ action: 'register', email: r0.email, idToken: r0.idToken || '', first: r0.first, last: r0.last, phone: r0.phone, students: r0.kids, isStudent: r0.isStudent, group: r0.group, parent2: { first: r0.p2first, last: r0.p2last, email: r0.p2email, phone: r0.p2phone } })
        .then(function (r) {
          if (r.error) { flash('err', r.error); return render(); }
          S.reg = null;
          if (r.code) { flash('ok', 'Your family is set up. Pick your shifts below.'); return loadFamily(r.code); }
          flash('ok', r.msg); render();
        });
    }
    else if (act === 'signin') { var c = document.getElementById('code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!c) return; lock(); loadFamily(c); }
    else if (act === 'sendcode') { lock(); call({ action: 'sendCode', email: document.getElementById('em').value }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || r.msg); render(); }); }
    else if (act === 'signout') { put(KEY, ''); S.code = ''; S.fam = null; S.day = null; try { window.google && google.accounts.id.disableAutoSelect(); } catch (x) {} render(); }
    else if (act === 'day') { S.picking = ''; loadDay(b.getAttribute('data-date')).then(render); }
    else if (act === 'calcopy') { var lk = b.getAttribute('data-link'); (navigator.clipboard ? navigator.clipboard.writeText(lk) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { prompt('Copy this calendar link:', lk); }); }
    else if (act === 'fchip') { var st = b.getAttribute('data-st'); if (S.filter[st]) delete S.filter[st]; else S.filter[st] = 1; saveView(); render(); }
    else if (act === 'fclear') { S.filter = {}; S.onlyOpen = false; saveView(); render(); }
    else if (act === 'expand' || act === 'collapse') { S.day.blocks.forEach(function (bl) { S.open[S.day.date + '|' + bl.start] = act === 'expand'; }); render(); }
    else if (act === 'pick') { S.picking = id || ''; S.hatPicking = ''; render(); }
    else if (act === 'hatpick') { S.hatPicking = id || ''; S.picking = ''; render(); }
    else if (act === 'hatadd') { var hp = b.getAttribute('data-pid'), nt = (document.getElementById('hatnote') || {}).value || ''; lock(); call({ action: 'hatAdd', code: S.code, shiftId: id, personId: hp, note: nt }).then(function (r) { S.hatPicking = ''; if (r.error) { flash('err', r.error); return refresh(); } return refresh(nameOf(hp) + '\'s name is in. The coordinators will let you know.'); }); }
    else if (act === 'hatout') { if (!confirm('Take this name out?')) return; lock(); call({ action: 'hatWithdraw', code: S.code, hatId: id }).then(function (r) { if (r.error) flash('err', r.error); return refresh(r.error ? '' : 'Name taken out.'); }); }
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
      call({ action: 'addMember', code: S.code, first: document.getElementById('af').value, last: document.getElementById('al').value, type: document.getElementById('at').value, group: document.getElementById('ag').value, phone: document.getElementById('aph').value })
        .then(function (r) { if (r.error) flash('err', r.error); return refresh(r.error ? '' : 'Added. The coordinators will double-check it.'); });
    }
  });

  // ---------- start: ?code= link from email, else the remembered code
  try { var v = JSON.parse(get('sosView') || '{}'); S.filter = v.filter || {}; S.onlyOpen = !!v.onlyOpen; } catch (e) {}
  var q = (location.search.match(/[?&]code=([A-Za-z0-9]+)/) || [])[1];
  if (q) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  var start = (AS ? AS.code : q || get(KEY)).toUpperCase();
  call({ action: 'config' }).then(function (r) { if (!r.error) S.cfg = r; if (start) loadFamily(start); else render(); });
})();
