/* Optima widget-enforcer runtime v1.0.0
   Locks the lesson after any widget marked data-enforce until the student completes that widget.
   Two modes, chosen automatically:
     book   - the immersive reader: page turns past the enforced widget are blocked
     scroll - a regular lesson page: everything after the enforced widget is hidden
   Inside one page only. It never touches navigation between pages.
   Stuck-student exit: after N wrong tries (default 2) the answer is shown and the widget counts as done.
   Fails open: any error unlocks everything. No dependencies. Observes the widgets' own DOM state,
   so the widget engines themselves are not changed. */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULT_TRIES = 2;
  if (window.OptimaEnforce && window.OptimaEnforce.version) return;
  var api = window.OptimaEnforce = { version: VERSION, mode: null, failed: false, error: null };

  var state = { done: {}, wrong: {}, revealing: false };
  var key = '', root = null, mode = null, locked = [], timer = null;

  function $all(r, s) { return Array.prototype.slice.call(r.querySelectorAll(s)); }

  /* ---------- failing open ---------- */
  function fail(e) {
    api.failed = true; api.error = String(e && e.message || e);
    try { unlockAll(); } catch (x) { /* nothing more to do */ }
  }
  function unlockAll() {
    locked.forEach(function (el) { el.classList.remove('ow-locked'); }); locked = [];
    var n = document.getElementById('ow-lock-note'); if (n && n.parentNode) n.parentNode.removeChild(n);
    var nx = document.getElementById('tNext'); if (nx && mode === 'book') nx.disabled = bookAtEnd();
  }

  /* ---------- saved progress ---------- */
  function load() {
    try { var s = JSON.parse(localStorage.getItem(key) || '{}'); state.done = s.done || {}; state.wrong = s.wrong || {}; } catch (e) { /* private window */ }
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify({ done: state.done, wrong: state.wrong })); } catch (e) { /* private window */ }
  }

  /* ---------- finding widgets ---------- */
  function allWidgets() { return $all(root, '.optima-widget'); }
  function enforced() { return allWidgets().filter(function (w) { return w.hasAttribute('data-enforce'); }); }
  function idOf(w) { return String(allWidgets().indexOf(w)); }
  function triesOf(w) { var n = parseInt(w.getAttribute('data-enforce'), 10); return n > 0 ? n : DEFAULT_TRIES; }
  function typeOf(w) {
    var t = ['select', 'scale', 'reflect', 'decide', 'order', 'sort', 'hot', 'step', 'flip-w', 'reveal-w'];
    for (var i = 0; i < t.length; i++) if (w.classList.contains('ow-' + t[i])) return t[i];
    return 'other';
  }
  function firstOpen() {
    var ws = enforced();
    for (var i = 0; i < ws.length; i++) if (!state.done[idOf(ws[i])]) return ws[i];
    return null;
  }

  /* ---------- is this widget finished? (read from the widget's own markup) ---------- */
  function isSolved(w) {
    var a, b;
    switch (typeOf(w)) {
      case 'reflect': case 'decide':
        return !!w.querySelector('.widget-options button.selected');
      case 'select': case 'scale':
        a = $all(w, '.widget-row');
        return a.length > 0 && a.every(function (r) { return !!r.querySelector('.widget-options button.correct'); });
      case 'order':
        a = $all(w, '.ow-chip');
        return a.length > 0 && parseInt(w.getAttribute('data-next') || '0', 10) >= a.length;
      case 'sort':
        a = $all(w, '.ow-chip');
        return a.length > 0 && a.every(function (c) { return c.classList.contains('placed'); });
      case 'hot':
        return w.getAttribute('data-task') === '-1' && w.getAttribute('data-ow-touched') === '1';
      case 'step':
        return w.getAttribute('data-ow-seen-last') === '1';
      case 'flip-w':
        a = $all(w, '.ow-flip');
        return a.length > 0 && a.every(function (c) { return c.getAttribute('data-ow-seen') === '1'; });
      case 'reveal-w':
        a = $all(w, 'details');
        return a.length > 0 && a.every(function (d) { return d.getAttribute('data-ow-seen') === '1'; });
      default:
        return w.getAttribute('data-ow-touched') === '1';
    }
  }

  /* ---------- was that click a wrong answer? ---------- */
  function wasWrong(w, t) {
    var b;
    switch (typeOf(w)) {
      case 'select': case 'scale':
        b = t.closest('.widget-options button'); return !!(b && b.classList.contains('incorrect'));
      case 'hot':
        b = t.closest('.ow-part'); return !!(b && b.classList.contains('incorrect'));
      case 'order': {
        var fo = w.querySelector('.widget-feedback');
        return !!(t.closest('.ow-chip') && fo && fo.classList.contains('incorrect'));
      }
      case 'sort': {
        var fs = w.querySelector('.widget-feedback');
        return !!(t.closest('.ow-bin-btn') && fs && fs.classList.contains('incorrect'));
      }
      default: return false;
    }
  }

  /* ---------- the stuck-student exit: drive the widget to its solved state ---------- */
  function giveAnswer(w) {
    state.revealing = true;
    try {
      var g, cur, part, tasks;
      switch (typeOf(w)) {
        case 'select': case 'scale':
          $all(w, '.widget-row').forEach(function (row) {
            if (row.querySelector('.widget-options button.correct')) return;
            var c = row.getAttribute('data-correct');
            var b = $all(row, '.widget-options button').filter(function (x) { return x.getAttribute('data-choice') === c; })[0];
            if (b) b.click();
          });
          break;
        case 'order':
          for (g = 0; g < 60; g++) {
            var next = parseInt(w.getAttribute('data-next') || '0', 10);
            var chip = $all(w, '.ow-chip').filter(function (c) { return !c.classList.contains('placed') && parseInt(c.getAttribute('data-pos'), 10) === next; })[0];
            if (!chip) break;
            chip.click();
          }
          break;
        case 'sort':
          $all(w, '.ow-chip:not(.placed)').forEach(function (chip) {
            if (!chip.classList.contains('selected')) chip.click();
            var bin = $all(w, '.ow-bin').filter(function (b) { return b.getAttribute('data-bin') === chip.getAttribute('data-bin'); })[0];
            var btn = bin && bin.querySelector('.ow-bin-btn');
            if (btn) btn.click();
          });
          break;
        case 'hot':
          tasks = JSON.parse(w.getAttribute('data-tasks') || '[]');
          for (g = 0; g < 60; g++) {
            cur = parseInt(w.getAttribute('data-task') || '-1', 10);
            if (cur < 0 || cur >= tasks.length) break;
            part = $all(w, '.ow-part').filter(function (p) { return parseInt(p.getAttribute('data-part'), 10) === tasks[cur].part; })[0];
            if (!part) break;
            part.click();
          }
          break;
        default: break;
      }
    } finally { state.revealing = false; }
    tellAnswerShown(w);
  }

  /* ---------- messages ---------- */
  function tellAnswerShown(w) {
    var msg = 'You used your tries, so the answer is shown. Read it, then keep going.';
    if (mode === 'book') { toast(msg); return; }
    var n = w.querySelector('.ow-enforce-note');
    if (!n) { n = document.createElement('div'); n.className = 'ow-enforce-note'; w.appendChild(n); }
    n.textContent = msg;
  }
  function toast(text) {
    var t = document.getElementById('ow-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ow-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text; t.className = 'show';
    clearTimeout(timer); timer = setTimeout(function () { t.className = ''; }, 4200);
  }
  function injectStyle() {
    if (document.getElementById('ow-style')) return;
    var s = document.createElement('style'); s.id = 'ow-style';
    s.textContent =
      '.ow-locked{display:none!important}' +
      '.ow-lock-note{margin:18px 0;padding:12px 16px;border:1px dashed #8a7a5c;border-radius:10px;background:#faf5e9;color:#4a3f28;font:600 15px/1.4 system-ui,sans-serif;text-align:center}' +
      '.ow-enforce-note{margin-top:10px;padding:8px 12px;border-radius:8px;background:#fff6dd;color:#5a4710;font:14px/1.4 system-ui,sans-serif}' +
      '#ow-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:90vw;padding:10px 16px;border-radius:10px;background:#2b2418;color:#fff;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);opacity:0;pointer-events:none;transition:opacity .2s;z-index:99999}' +
      '#ow-toast.show{opacity:1}';
    document.head.appendChild(s);
  }

  /* ---------- progress ---------- */
  function complete(id) { state.done[id] = 1; save(); refresh(); }
  function refresh() {
    if (api.failed) return;
    try { if (mode === 'book') applyBook(); else applyScroll(); } catch (e) { fail(e); }
  }

  /* ---------- scroll mode: hide everything after the first unfinished enforced widget ---------- */
  function skip(el) {
    if (/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) return true;
    if (el.id === 'ow-lock-note' || el.id === 'ow-toast' || el.hasAttribute('data-ow-keep')) return true;
    try { if (window.getComputedStyle(el).position === 'fixed') return true; } catch (e) { /* no layout */ }
    return false;
  }
  function applyScroll() {
    locked.forEach(function (el) { el.classList.remove('ow-locked'); }); locked = [];
    var f = firstOpen(), note = document.getElementById('ow-lock-note');
    if (!f) { if (note && note.parentNode) note.parentNode.removeChild(note); return; }
    var n = f;
    while (n && n !== document.body && n !== document.documentElement) {
      var s = n.nextElementSibling;
      while (s) { if (!skip(s)) { s.classList.add('ow-locked'); locked.push(s); } s = s.nextElementSibling; }
      n = n.parentElement;
    }
    if (!note) {
      note = document.createElement('div'); note.id = 'ow-lock-note'; note.className = 'ow-lock-note'; note.setAttribute('role', 'status');
      note.textContent = 'Finish the activity above to keep reading.';
    }
    f.insertAdjacentElement('afterend', note);
  }

  /* ---------- book mode: block page turns past the spread that holds the unfinished widget ---------- */
  function spreadOf(c) { return R.two ? c - (c % 2) : c; }
  function bookAtEnd() { return R.col + R.per >= R.ncol; }
  function lockSpread() {
    if (api.failed) return null;
    var f = firstOpen(); if (!f || !R.open) return null;
    var fl = document.getElementById('flow').getBoundingClientRect().left;
    var rs = f.getClientRects();
    var r = rs.length ? rs[rs.length - 1] : f.getBoundingClientRect();
    var c = Math.floor((r.left - fl + 2) / R.P);
    if (!isFinite(c) || c < 0) return null;
    return spreadOf(c);
  }
  function applyBook() {
    var nx = document.getElementById('tNext'); if (!nx) return;
    var lim = lockSpread();
    nx.disabled = bookAtEnd() || (lim !== null && R.col >= lim);
  }
  function installBook() {
    var oShow = window.show, oGo = window.go;
    if (typeof oShow !== 'function' || typeof oGo !== 'function') throw new Error('reader functions not found');
    window.show = function (c, dir) {
      try {
        var lim = lockSpread();
        if (lim !== null && typeof c === 'number' && spreadOf(c) > lim) {
          if (lim === R.col) dir = 0;
          c = lim; toast('Finish the activity on this page to turn the page.');
        }
      } catch (e) { fail(e); }
      var out = oShow.call(this, c, dir);
      try { applyBook(); } catch (e) { fail(e); }
      return out;
    };
    window.go = function (n) {
      try {
        if (!api.failed && typeof n === 'number' && typeof NP === 'number' && n > NP && firstOpen()) {
          toast('Finish the activity in the book before you go on.'); return;
        }
      } catch (e) { fail(e); }
      return oGo.apply(this, arguments);
    };
  }

  /* ---------- listening to the student ---------- */
  function onClick(e) {
    if (state.revealing || api.failed) return;
    var t = e.target; if (!t || !t.closest) return;
    var w = t.closest('.optima-widget');
    if (!w || !w.hasAttribute('data-enforce') || t.closest('.widget-reset')) return;
    var id = idOf(w); if (state.done[id]) return;
    setTimeout(function () {                      // after the widget's own handler has run
      try {
        w.setAttribute('data-ow-touched', '1');
        var card = t.closest('.ow-flip'); if (card) card.setAttribute('data-ow-seen', '1');
        if (typeOf(w) === 'step') {
          var fr = $all(w, '.ow-frame');
          if (fr.length && parseInt(w.getAttribute('data-frame') || '0', 10) === fr.length - 1) w.setAttribute('data-ow-seen-last', '1');
        }
        if (wasWrong(w, t)) { state.wrong[id] = (state.wrong[id] || 0) + 1; save(); }
        if (isSolved(w)) { complete(id); return; }
        if ((state.wrong[id] || 0) >= triesOf(w)) { giveAnswer(w); complete(id); }
      } catch (x) { fail(x); }
    }, 0);
  }
  function onToggle(e) {
    var d = e.target;
    if (!d || d.tagName !== 'DETAILS' || !d.open) return;
    var w = d.closest('.optima-widget');
    if (!w || !w.hasAttribute('data-enforce')) return;
    d.setAttribute('data-ow-seen', '1');
    var id = idOf(w);
    if (!state.done[id] && isSolved(w)) { try { complete(id); } catch (x) { fail(x); } }
  }

  /* ---------- start ---------- */
  function detect() {
    if (api.forceMode) return api.forceMode;
    var isBook = !!document.getElementById('flow') && typeof window.show === 'function' && typeof window.go === 'function' && typeof R === 'object' && typeof NP === 'number';
    return isBook ? 'book' : 'scroll';
  }
  function start() {
    try {
      mode = detect(); api.mode = mode;
      root = mode === 'book' ? document.getElementById('flow') : document;
      if (!enforced().length) return false;
      key = 'owEnforce:' + (typeof LESSON !== 'undefined' && LESSON.key ? LESSON.key : location.pathname);
      load(); injectStyle();
      document.addEventListener('click', onClick, false);
      document.addEventListener('toggle', onToggle, true);
      if (mode === 'book') installBook();
      refresh();
      api.started = true;
      return true;
    } catch (e) { fail(e); return false; }
  }
  api.isLocked = function () { return !api.failed && !!firstOpen(); };
  api.state = state;
  api.start = start;

  function boot() { if (!start()) window.addEventListener('load', function () { if (!api.started) start(); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
