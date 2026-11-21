/* SOS Crew – point-person page: your station's people by time slot, call/text each, group texts, check-in.
 * Copyright (c) 2026 NE Prints & Design, LLC. All rights reserved.
 * Signed in by the personal link (?lead=CODE, remembered in this browser) or Google (point people by email; admins see every station). */
(function () {
  'use strict';
  var C = window.SOS || {}, API = C.API, app = document.getElementById('app');
  var KEY = (C.ENV === 'LIVE' ? '' : 'sbx_') + 'sosLead';
  var S = { code: '', token: '', data: null, date: '', msg: null, station: '', body: null, cfg: null };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function get(k, ss) { try { return (ss ? sessionStorage : localStorage).getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v, ss) { try { var st = ss ? sessionStorage : localStorage; v ? st.setItem(k, v) : st.removeItem(k); } catch (e) {} }
  function tel(p) { var d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '+1' + d : d; }
  function smsHref(phones, body) {
    var list = phones.map(tel).filter(String).join(','), ios = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
    return ios ? 'sms:/open?addresses=' + list + (body ? '&body=' + encodeURIComponent(body) : '') : 'sms:' + list + (body ? '?body=' + encodeURIComponent(body) : '');
  }
  function dayParts(iso) { var p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]); return { dow: d.toLocaleDateString('en-US', { weekday: 'short' }), md: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }; }
  function call(d) {
    if (!API) return Promise.resolve({ error: 'This site is not connected yet.' });
    return fetch(API, { method: 'POST', body: JSON.stringify(d) }).then(function (r) { return r.json(); }).catch(function () { return { error: 'Could not reach the server. Try again.' }; });
  }
  function header(sub) {
    var d = S.data || S.cfg || {};
    return (C.ENV !== 'LIVE' ? '<div class="sandbox">TEST SITE</div>' : '') + '<header><img class=\"logo\" src=\"img/logo-160.png\" alt=\"SOS Crew – Edgewood Winter Guard\" width=\"72\" height=\"72\"><div class="eyebrow">' + esc(d.event || C.EVENT) + ' · Point person</div><h1>' + esc(d.app || C.NAME) + (S.data && S.data.lead.all ? (function () { var sp = S.data.lead.viewOnly || get('sosSpotMode', true) !== '0'; return ' <a class="adminpill' + (sp ? ' spot' : '') + '" href="admin.html">' + esc(S.data.lead.viewOnly ? (S.data.lead.role || 'Spotter') : sp ? 'Spotter' : (S.data.lead.role || 'Admin')) + '</a>'; })() : '') + '</h1><div class="hsub">' + esc(sub || '') + '</div></header>';
  }
  function banner() { return S.msg ? '<div class="banner ' + S.msg.kind + '">' + esc(S.msg.text) + '</div>' : ''; }
  function footer() { return '<footer><a href="./">Volunteer signup</a>' + (S.data && S.data.lead.all ? ' · <a href="board.html">Live unit board</a> · <a href="track.html">Unit tracker</a>' : S.data && S.data.lead.track ? ' · <a href="track.html">Unit tracker</a>' : '') + (S.code || S.token ? ' · <button class="link" data-act="out">Sign out</button>' : '') + ' · <button class="link" data-theme-toggle>Theme: ' + (window.sosTheme ? sosTheme.label() : 'Auto') + '</button><span class="legal">© 2026 NE Prints &amp; Design, LLC. All rights reserved.</span></footer>'; }

  function renderSignIn() {
    var gid = (S.cfg && S.cfg.googleClientId) || C.GOOGLE_CLIENT_ID;
    app.innerHTML = header('Sign in') + banner() + '<div class="card"><h2>Point people</h2><p class="muted">Open the link from your point-person email, or sign in with the Google account the coordinators have for you.</p>' +
      (gid ? '<div id="gbtn" style="display:flex;justify-content:center;min-height:44px"></div>' : '') + '</div>' + footer();
    if (gid) {
      var draw = function () { var el = document.getElementById('gbtn'); if (!el) return; google.accounts.id.initialize({ client_id: gid, callback: function (r) { S.token = r.credential; put(KEY + 'Tok', S.token, true); load(); } }); google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280 }); };
      if (window.google && google.accounts) draw(); else { var sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = draw; document.head.appendChild(sc); }
    }
  }
  function postSel(p, station) {
    var list = (S.data.posts || {})[station]; if (!list) return '';
    return '<select class="postsel" data-id="' + esc(p.signupId) + '"><option value="">Post…</option>' + list.map(function (x) { return '<option' + (x === p.post ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + (p.post && list.indexOf(p.post) < 0 ? '<option selected>' + esc(p.post) + '</option>' : '') + '</select>';
  }
  function people(slot) {
    if (!slot.people.length) return '<div class="muted" style="padding:6px 0">No one yet.</div>';
    return slot.people.slice().sort(function (a, b) { return (a.post || '~') < (b.post || '~') ? -1 : (a.post || '~') > (b.post || '~') ? 1 : a.name < b.name ? -1 : 1; }).map(function (p) {
      var sub = [p.type, p.group, p.phone ? p.phone + (p.fromFamily ? ' (family)' : '') : 'no phone on file'].filter(String).join(' · ');
      var inOn = p.status === 'Checked in', nsOn = p.status === 'No-show';
      return '<div class="person"><div><div class="who">' + esc(p.name) + (p.post && (S.data.lead.viewOnly || (S.data.lead.all && get('sosSpotMode', true) !== '0') || !(S.data.posts || {})[slot.station]) ? ' <span class="pill tbd">' + esc(p.post) + '</span>' : '') + '</div><div class="whosub">' + esc(sub) + '</div>' + postSel(p, slot.station) + '</div><div class="acts">' +
        (p.phone ? '<a class="cbtn" href="tel:' + tel(p.phone) + '">Call</a><a class="cbtn alt solo" href="' + smsHref([p.phone], greet(p.name, slot.station)) + '">Text</a>' : '') +
        '<button class="chk' + (inOn ? ' on' : '') + '" data-act="mark" data-id="' + esc(p.signupId) + '" data-mark="' + (inOn ? 'undo' : 'in') + '">' + (inOn ? 'In ✓' : 'Check in') + '</button>' +
        '<button class="chk ns' + (nsOn ? ' on' : '') + '" data-act="mark" data-id="' + esc(p.signupId) + '" data-mark="' + (nsOn ? 'undo' : 'noshow') + '">No-show</button></div></div>';
    }).join('');
  }
  /** One-on-one texts start with who they're to and who's sending, so a reply makes sense even without saved contacts. */
  function greet(to, station) { var d = S.data; return 'Hi ' + to + ', this is ' + d.lead.name + (d.lead.all ? ' with ' + (d.app || 'SOS Crew') : ', ' + station + ' point person') + ' for the ' + d.event + '. '; }
  function phonesOf(list) { var m = {}; list.forEach(function (p) { if (p.phone && p.status !== 'No-show') m[p.phone] = 1; }); return Object.keys(m); }
  function textBtn(label, phones) {
    if (!phones.length) return '<span class="muted">' + esc(label) + ': no phones yet</span>';
    return '<a class="cbtn alt" href="' + smsHref(phones, S.body) + '">' + esc(label) + ' (' + phones.length + ')</a> <button class="link" data-act="copy" data-p="' + esc(phones.join(', ')) + '">Copy numbers</button>';
  }
  function render() {
    if (!S.data) return renderSignIn();
    var d = S.data, stations = {};
    d.slots.forEach(function (s) { (stations[s.station] = stations[s.station] || []).push(s); });
    var names = Object.keys(stations).sort();
    if (S.body === null) S.body = 'Hi, this is ' + d.lead.name + ', point person for ' + (d.lead.all ? 'the ' + d.event : (d.lead.stations[0] || '').replace(/ \(.*/, '')) + '. ';
    var html = header(d.lead.name + (d.lead.all ? ' · all stations' + (d.lead.viewOnly ? ' (view only)' : ' (admin)') : ' · ' + d.lead.stations.join(', '))) + banner();
    html += '<div class="card"><h2>Group text message</h2><textarea id="body">' + esc(S.body) + '</textarea><p class="muted" style="margin:6px 0 0">Group texts open your phone\'s messaging app with everyone in it. Everyone sees the numbers and replies go to the group. For private replies, text people one by one.</p></div>';
    html += '<div class="tabs">' + d.days.map(function (x) { var p = dayParts(x.date); return '<button class="tab' + (x.date === d.date ? ' on' : '') + '" data-act="day" data-date="' + x.date + '"><div class="d1">' + esc(p.dow) + '</div><div class="d2">' + esc(p.md) + '</div></button>'; }).join('') + '</div>';
    if (d.lead.all && names.length > 1) html += '<div class="card"><label for="stf">Station</label><select id="stf"><option value="">All stations</option>' + names.map(function (n) { return '<option' + (n === S.station ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></div>';
    names.filter(function (n) { return !S.station || n === S.station; }).forEach(function (n) {
      var slots = stations[n], dayPeople = [].concat.apply([], slots.map(function (s) { return s.people; }));
      var byPost = {}; dayPeople.forEach(function (p) { if (p.post) (byPost[p.post] = byPost[p.post] || []).push(p); });
      html += '<div class="card"><h2>' + esc(n) + '</h2><div class="leadline">' + textBtn('Text everyone today', phonesOf(dayPeople)) + '</div>' +
        Object.keys(byPost).sort().map(function (k) { return '<div class="leadline">' + textBtn('Text ' + k + ' today', phonesOf(byPost[k])) + '</div>'; }).join('') +
        '<div class="leadline">' + textBtn('Text everyone, all days', d.stationPhones[n] || []) + '</div>';
      slots.forEach(function (s) {
        var live = s.people.filter(function (p) { return p.status !== 'Cancelled'; }).length;
        html += '<hr><div class="block"><h3 style="font-size:16px">' + esc(s.label) + ' <span class="muted">· ' + live + ' of ' + s.spots + '</span></h3><div class="leadline">' + textBtn('Text this time slot', phonesOf(s.people)) + '</div>' + people(s) + '</div>';
      });
      html += '</div>';
    });
    if (!names.length) html += '<div class="card"><p class="muted">No shifts for your station this day.</p></div>';
    app.innerHTML = html + footer();
    if (d.lead.viewOnly || (d.lead.all && get('sosSpotMode', true) !== '0')) Array.prototype.forEach.call(app.querySelectorAll('.postsel, [data-act=mark]'), function (el) { el.remove(); });
  }
  function load(date) {
    return call({ action: 'lead', leadCode: S.code, idToken: S.token, date: date || S.date || '' }).then(function (r) {
      if (r.error) { S.data = null; if (r.signIn) { put(KEY, ''); S.code = ''; S.token = ''; put(KEY + 'Tok', '', true); } S.msg = { kind: 'err', text: r.error }; }
      else { S.data = r; S.date = r.date; if (S.code) put(KEY, S.code); }
      render();
    });
  }
  app.addEventListener('input', function (e) { if (e.target.id === 'body') { S.body = e.target.value; Array.prototype.forEach.call(app.querySelectorAll('a.cbtn.alt:not(.solo)'), function (a) { var m = a.getAttribute('href').match(/addresses=([^&]*)|^sms:([^?]*)/); var ph = (m && (m[1] || m[2]) || '').split(','); a.setAttribute('href', smsHref(ph, S.body)); }); } });
  app.addEventListener('change', function (e) {
    if (e.target.id === 'stf') { S.station = e.target.value; render(); }
    if (e.target.classList.contains('postsel')) { e.target.disabled = true; call({ action: 'setPost', leadCode: S.code, idToken: S.token, signupId: e.target.getAttribute('data-id'), post: e.target.value }).then(function (r) { if (r.error) S.msg = { kind: 'err', text: r.error }; load(); }); }
  });
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.getAttribute('data-act'); S.msg = null;
    if (act === 'day') load(b.getAttribute('data-date'));
    else if (act === 'mark') { b.disabled = true; call({ action: 'leadMark', leadCode: S.code, idToken: S.token, signupId: b.getAttribute('data-id'), mark: b.getAttribute('data-mark') }).then(function (r) { if (r.error) S.msg = { kind: 'err', text: r.error }; load(); }); }
    else if (act === 'copy') { var t = b.getAttribute('data-p'); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { prompt('Copy these numbers:', t); }); }
    else if (act === 'out') { put(KEY, ''); put(KEY + 'Tok', '', true); S.code = S.token = ''; S.data = null; render(); }
  });
  var q = (location.search.match(/[?&]lead=([A-Za-z0-9]+)/) || [])[1];
  if (q) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  S.code = (q || get(KEY)).toUpperCase(); S.token = get(KEY + 'Tok', true) || (S.code ? '' : get((C.ENV === 'LIVE' ? '' : 'sbx_') + 'sosAdminTok', true));   // admins arriving from the admin page stay signed in
  call({ action: 'config' }).then(function (r) { if (!r.error) S.cfg = r; if (S.code || S.token) load(); else render(); });
})();
