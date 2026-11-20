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
      '<header class="adm"><div class="eyebrow">' + esc(d.event || C.EVENT) + ' · Admin</div><h1>' + esc(d.app || C.NAME) + '</h1>' +
      (S.who ? '<div class="hsub">' + esc(S.who.email) + '</div><div class="navpills">' +
        [['grid', 'Day grid'], ['fam', 'Families'], ['short', 'Who\'s short'], ['review', 'Review']].map(function (x) { return '<button class="np' + (S.view === x[0] ? ' on' : '') + '" data-act="view" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
        '<a class="np" href="lead.html">Point-person view</a></div>' : '') + '</header>';
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
    return '<div class="person"><div><div class="who">' + esc(p.name) + (p.override ? ' <span class="pill tbd">override</span>' : '') + '</div><div class="whosub">' + esc([p.type, p.group, p.family, p.status !== 'Signed up' ? p.status : ''].filter(String).join(' · ')) + '</div></div><div class="acts">' +
      '<button class="chk' + (inOn ? ' on' : '') + '" data-act="mark" ' + k + '="' + esc(id) + '" data-mark="' + (inOn ? 'undo' : 'in') + '">' + (inOn ? 'In ✓' : 'Check in') + '</button>' +
      '<button class="chk ns' + (nsOn ? ' on' : '') + '" data-act="mark" ' + k + '="' + esc(id) + '" data-mark="' + (nsOn ? 'undo' : 'noshow') + '">No-show</button>' +
      '<button class="chk ns" data-act="' + (kind === 'x' ? 'xcancel' : 'cancel') + '" ' + k + '="' + esc(id) + '">Remove</button></div></div>';
  }
  function cellPanel(s) {
    var live = s.people.filter(function (p) { return p.status !== 'Cancelled'; });
    var html = '<div class="card" id="panel"><h2>' + esc(s.station) + ' · ' + esc(s.label) + ' · ' + s.filled + ' of ' + s.spots + (s.who !== 'Anyone' ? ' · ' + esc(s.who) : '') + '</h2>' +
      (live.length ? live.map(function (p) { return personRow(p, 's'); }).join('') : '<p class="muted">No one yet.</p>') +
      '<label for="addq">Add someone (any restriction is overridden)</label><div class="row"><input id="addq" placeholder="Name or email" value="' + esc(S.addQ) + '"><button class="sm" style="flex:none" data-act="addsearch">Find</button></div>';
    if (S.addHits) html += S.addHits.length ? S.addHits.map(function (p) { return '<div class="person"><div><div class="who">' + esc(p.name) + '</div><div class="whosub">' + esc([p.type, p.group, p.family].filter(String).join(' · ')) + '</div></div><div class="acts"><button class="chk" data-act="place" data-pid="' + esc(p.id) + '">Add to this spot</button></div></div>'; }).join('') : '<p class="muted">No one found.</p>';
    return html + '</div>';
  }
  function extraPanel() {
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

  function render() {
    if (!S.who) return renderSignIn();
    var body = S.view === 'fam' ? renderFam() : S.view === 'short' ? renderShort() : S.view === 'review' ? renderReview() : renderGrid();
    app.innerHTML = header() + banner() + body + footer();
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
    if (t.classList.contains('plc') && t.value) { var x = t.getAttribute('data-x'), sid = t.value; t.disabled = true;
      call({ action: 'adminPlace', extraId: x, shiftId: sid, overfill: true }).then(function (r) { flash(r.error ? 'err' : 'ok', r.error || 'Placed.'); loadDay(); }); }
  });
  app.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'addq') app.querySelector('[data-act=addsearch]').click();
    if (e.target.id === 'famq') app.querySelector('[data-act=famsearch]').click();
  });
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'); S.msg = null;
    if (act === 'view') { S.view = b.getAttribute('data-v'); if (S.view === 'short') loadShort(); else if (S.view === 'review') loadFlags(); else if (S.view === 'grid') loadDay(); else render(); }
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
    else if (act === 'out') { S.token = ''; putS(TOK, ''); S.who = null; try { google.accounts.id.disableAutoSelect(); } catch (x) {} render(); }
  });

  S.token = getS(TOK);
  call({ action: 'config' }).then(function (r) { if (!r.error) S.cfg = r; if (S.token) start(); else render(); });
})();
