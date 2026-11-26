/* SOS Crew – light/dark theme. Copyright (c) 2026 NE Prints & Design, LLC. All rights reserved.
 * Follows the phone/computer setting unless the person picks Light or Dark (remembered in this browser). */
(function () {
  var KEY = 'sosTheme', mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function pref() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function apply() {
    var p = pref(), dark = p === 'dark' || (p === 'auto' && mq && mq.matches);
    document.documentElement.classList.toggle('dark', !!dark);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', dark ? '#0B0B0C' : '#111113');
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  window.sosTheme = {
    label: function () { return { auto: 'Auto', light: 'Light', dark: 'Dark' }[pref()]; },
    next: function () { var order = ['auto', 'light', 'dark'], n = order[(order.indexOf(pref()) + 1) % 3]; try { localStorage.setItem(KEY, n); } catch (e) {} apply(); return this.label(); }
  };
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-theme-toggle]'); if (b) b.textContent = 'Theme: ' + window.sosTheme.next(); });
})();
