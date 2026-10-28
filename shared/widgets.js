/* Optima lesson widgets: shared runtime. One delegated listener drives every engine.
   Engines: reflect, select, scale, reveal, flip, order, sort, step, decide, hot. */
(function () {
  'use strict';

  function $all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function showFb(w, text, kind) {
    var fb = w.querySelector('.widget-feedback');
    if (!fb) return;
    fb.textContent = text;
    fb.className = 'widget-feedback show' + (kind ? ' ' + kind : '');
  }
  function clearFb(w) {
    $all(w, '.widget-feedback').forEach(function (f) { f.className = 'widget-feedback'; f.textContent = ''; });
    $all(w, '.row-feedback').forEach(function (f) { f.remove(); });
  }

  // ---- hot-spot engine: ask the tasks one at a time, then free exploring
  function hotInit(w) {
    var tasks = JSON.parse(w.getAttribute('data-tasks') || '[]');
    w.setAttribute('data-task', tasks.length ? '0' : '-1');
    var t = w.querySelector('.ow-hot-task');
    if (t) t.textContent = tasks.length ? tasks[0].ask : '';
    var info = w.querySelector('.ow-hot-info');
    if (info) info.textContent = 'Tap a part to read about it.';
  }

  function resetWidget(w) {
    $all(w, 'button').forEach(function (b) { b.classList.remove('selected', 'correct', 'incorrect'); });
    clearFb(w);
    $all(w, '.ow-flip.flipped').forEach(function (c) { c.classList.remove('flipped'); });
    $all(w, 'details').forEach(function (d) { d.removeAttribute('open'); });
    // order
    var line = w.querySelector('.ow-line');
    if (line) { line.innerHTML = ''; w.setAttribute('data-next', '0'); }
    // chips (order and sort): return to pool in original order
    var pool = w.querySelector('.ow-pool');
    if (pool) {
      $all(w, '.ow-chip').sort(function (a, b) { return a.getAttribute('data-i') - b.getAttribute('data-i'); })
        .forEach(function (c) { c.classList.remove('placed', 'selected'); pool.appendChild(c); });
    }
    $all(w, '.ow-bin-items').forEach(function (u) { u.innerHTML = ''; });
    // step
    var frames = $all(w, '.ow-frame');
    if (frames.length) { stepTo(w, 0); }
    // decide
    $all(w, '.ow-after').forEach(function (a) { a.style.display = 'none'; });
    // hot
    if (w.classList.contains('ow-hot')) hotInit(w);
  }

  function stepTo(w, n) {
    var frames = $all(w, '.ow-frame');
    n = Math.max(0, Math.min(frames.length - 1, n));
    frames.forEach(function (f, i) { f.classList.toggle('on', i === n); });
    w.setAttribute('data-frame', String(n));
    var c = w.querySelector('.ow-step-count');
    if (c) c.textContent = 'Step ' + (n + 1) + ' of ' + frames.length;
    var back = w.querySelector('.ow-back'), next = w.querySelector('.ow-next');
    if (back) back.disabled = n === 0;
    if (next) next.disabled = n === frames.length - 1;
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var reset = t.closest('.widget-reset');
    if (reset) { resetWidget(reset.closest('.optima-widget')); return; }

    var w = t.closest('.optima-widget');
    if (!w) return;

    // reflect: no right answer
    var rBtn = t.closest('.ow-reflect .widget-options button');
    if (rBtn) {
      $all(w, '.widget-options button').forEach(function (b) { b.classList.remove('selected'); });
      rBtn.classList.add('selected');
      showFb(w, rBtn.getAttribute('data-response') || '', '');
      return;
    }

    // select and scale rows
    var sBtn = t.closest('.ow-select .widget-row .widget-options button, .ow-scale .widget-row .widget-options button');
    if (sBtn) {
      var row = sBtn.closest('.widget-row');
      $all(row, '.widget-options button').forEach(function (b) { b.classList.remove('selected', 'correct', 'incorrect'); });
      var right = sBtn.getAttribute('data-choice') === row.getAttribute('data-correct');
      sBtn.classList.add(right ? 'correct' : 'incorrect');
      var text = sBtn.getAttribute('data-fb') || (right ? row.getAttribute('data-right') : row.getAttribute('data-wrong')) || (right ? 'Right.' : 'Not quite. Try again.');
      var rf = row.querySelector('.row-feedback') || row.appendChild(document.createElement('div'));
      rf.className = 'row-feedback ' + (right ? 'correct' : 'incorrect');
      rf.textContent = text;
      return;
    }

    // flip card
    var flip = t.closest('.ow-flip');
    if (flip) { flip.classList.toggle('flipped'); return; }

    // order: tap the items in sequence
    var chip = t.closest('.ow-order .ow-chip');
    if (chip) {
      var next = parseInt(w.getAttribute('data-next') || '0', 10);
      var total = $all(w, '.ow-chip').length;
      if (parseInt(chip.getAttribute('data-pos'), 10) === next) {
        chip.classList.add('placed');
        var li = document.createElement('li');
        li.textContent = chip.textContent;
        w.querySelector('.ow-line').appendChild(li);
        w.setAttribute('data-next', String(next + 1));
        if (next + 1 === total) showFb(w, w.getAttribute('data-done') || 'That is the whole sequence.', 'correct');
        else showFb(w, 'Yes. What came next?', 'correct');
      } else {
        showFb(w, w.getAttribute('data-nudge') || 'Not the next one. Think about what had to happen first.', 'incorrect');
      }
      return;
    }

    // sort: tap an item, then tap a bin
    var sortChip = t.closest('.ow-sort .ow-chip');
    if (sortChip) {
      var was = sortChip.classList.contains('selected');
      $all(w, '.ow-chip').forEach(function (c) { c.classList.remove('selected'); });
      if (!was) sortChip.classList.add('selected');
      return;
    }
    var binBtn = t.closest('.ow-sort .ow-bin-btn');
    if (binBtn) {
      var sel = w.querySelector('.ow-chip.selected');
      if (!sel) { showFb(w, 'Tap one of the items first, then tap the group where it belongs.', ''); return; }
      var bin = binBtn.closest('.ow-bin');
      if (sel.getAttribute('data-bin') === bin.getAttribute('data-bin')) {
        sel.classList.remove('selected');
        sel.classList.add('placed');
        var item = document.createElement('li');
        item.textContent = sel.textContent;
        bin.querySelector('.ow-bin-items').appendChild(item);
        var left = $all(w, '.ow-chip:not(.placed)').length;
        showFb(w, (sel.getAttribute('data-why') || 'Right.') + (left ? '' : ' ' + (w.getAttribute('data-done') || 'All sorted.')), 'correct');
      } else {
        showFb(w, sel.getAttribute('data-hint') || 'Not that group. Look again at what the lesson says.', 'incorrect');
      }
      return;
    }

    // step through frames
    if (t.closest('.ow-back')) { stepTo(w, parseInt(w.getAttribute('data-frame') || '0', 10) - 1); return; }
    if (t.closest('.ow-next')) { stepTo(w, parseInt(w.getAttribute('data-frame') || '0', 10) + 1); return; }

    // decide: no wrong answer
    var dBtn = t.closest('.ow-decide .widget-options button');
    if (dBtn) {
      $all(w, '.widget-options button').forEach(function (b) { b.classList.remove('selected'); });
      dBtn.classList.add('selected');
      showFb(w, dBtn.getAttribute('data-result') || '', '');
      $all(w, '.ow-after').forEach(function (a) { a.style.display = 'block'; });
      return;
    }

    // hot spots
    var part = t.closest('.ow-hot .ow-part');
    if (part) {
      var info = w.querySelector('.ow-hot-info');
      var tasks = JSON.parse(w.getAttribute('data-tasks') || '[]');
      var cur = parseInt(w.getAttribute('data-task') || '-1', 10);
      var idx = parseInt(part.getAttribute('data-part'), 10);
      $all(w, '.ow-part').forEach(function (b) { b.classList.remove('selected', 'correct', 'incorrect'); });
      if (cur >= 0 && cur < tasks.length) {
        if (idx === tasks[cur].part) {
          part.classList.add('correct');
          info.textContent = part.getAttribute('data-info');
          showFb(w, tasks[cur].right || 'Yes.', 'correct');
          cur++;
          w.setAttribute('data-task', String(cur));
          var tk = w.querySelector('.ow-hot-task');
          if (cur < tasks.length) tk.textContent = tasks[cur].ask;
          else { tk.textContent = ''; w.setAttribute('data-task', '-1'); showFb(w, (tasks[cur - 1].right || 'Yes.') + ' You found them all. Tap any part to read more.', 'correct'); }
        } else {
          part.classList.add('incorrect');
          info.textContent = part.getAttribute('data-info');
          showFb(w, tasks[cur].wrong || 'Not that part. Read what this one does and try again.', 'incorrect');
        }
      } else {
        part.classList.add('selected');
        info.textContent = part.getAttribute('data-info');
        clearFb(w);
      }
      return;
    }
  });

  function initAll() {
    $all(document, '.ow-hot').forEach(hotInit);
    $all(document, '.ow-step').forEach(function (w) { stepTo(w, 0); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll); else initAll();
})();
