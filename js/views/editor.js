import * as storage from '../storage.js';
import { uid, esc, fmt, totalSec, TYPE_NAMES } from '../util.js';

const STEP = 15;
const MIN = 5;
const MAX = 3600;
const CYCLE = ['walk', 'run', 'rest'];

function blank() {
  return {
    id: uid(),
    name: '',
    warmup: null,
    intervals: [{ type: 'walk', durationSec: 60 }, { type: 'run', durationSec: 120 }],
    repeats: 3,
    cooldown: null,
  };
}

const clamp = v => Math.min(MAX, Math.max(MIN, v));
// Snap to the next/previous multiple of STEP so 5s -> 15 -> 30 -> 45.
const bump = (sec, dir) => clamp(dir > 0 ? (Math.floor(sec / STEP) + 1) * STEP : (Math.ceil(sec / STEP) - 1) * STEP);

export function render(root, { id }) {
  const existing = id !== 'new' ? storage.getWorkout(id) : null;
  if (id !== 'new' && !existing) { location.hash = '#/'; return; }
  const w = existing ? JSON.parse(JSON.stringify(existing)) : blank();
  let error = '';

  const stepper = (key, sec) => `
    <div class="stepper">
      <button data-act="dec" data-key="${key}" aria-label="less">−</button>
      <span class="val">${fmt(sec)}</span>
      <button data-act="inc" data-key="${key}" aria-label="more">+</button>
    </div>`;

  const draw = () => {
    root.innerHTML = `
      <div class="screen">
        <div class="topbar"><h1>${existing ? 'Edit' : 'New'} workout</h1></div>
        <input type="text" id="name" placeholder="Workout name" maxlength="40" value="${esc(w.name)}">

        <div class="card">
          <div class="row between"><h2>Warm-up</h2><label><input type="checkbox" data-act="toggle" data-key="warmup" ${w.warmup ? 'checked' : ''}> On</label></div>
          ${w.warmup ? stepper('warmup', w.warmup.durationSec) : ''}
        </div>

        <div class="card">
          <h2>Intervals</h2>
          ${w.intervals.map((s, i) => `
            <div class="iv-row" data-i="${i}">
              <span class="handle" data-drag="${i}" aria-label="Drag to reorder" title="Drag to reorder">⠿</span>
              <button class="type t-${s.type}" data-act="type" data-i="${i}">${TYPE_NAMES[s.type]}</button>
              ${stepper('iv' + i, s.durationSec)}
              <button class="mini danger" data-act="remove" data-i="${i}" aria-label="remove">✕</button>
            </div>`).join('')}
          <button class="ghost" data-act="add">+ Add interval</button>
        </div>

        <div class="card">
          <div class="row between"><h2>Repeat</h2>
            <div class="stepper">
              <button data-act="rdec" aria-label="fewer">−</button>
              <span class="val">${w.repeats}×</span>
              <button data-act="rinc" aria-label="more">+</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="row between"><h2>Cool-down</h2><label><input type="checkbox" data-act="toggle" data-key="cooldown" ${w.cooldown ? 'checked' : ''}> On</label></div>
          ${w.cooldown ? stepper('cooldown', w.cooldown.durationSec) : ''}
        </div>

        <p class="muted">Total time: <b>${fmt(totalSec(w))}</b></p>
        ${error ? `<p class="error">${esc(error)}</p>` : ''}
        <div class="footer-bar">
          <button class="ghost" data-act="cancel">Cancel</button>
          <button class="primary" data-act="save">Save</button>
        </div>
      </div>`;
  };

  const target = key => key === 'warmup' || key === 'cooldown' ? w[key] : w.intervals[+key.slice(2)];

  const onClick = e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT') return;
    const act = el.dataset.act;
    const i = +el.dataset.i;
    error = '';
    if (act === 'inc' || act === 'dec') {
      const t = target(el.dataset.key);
      t.durationSec = bump(t.durationSec, act === 'inc' ? 1 : -1);
    } else if (act === 'type') {
      const s = w.intervals[i];
      s.type = CYCLE[(CYCLE.indexOf(s.type) + 1) % CYCLE.length];
    } else if (act === 'remove') w.intervals.splice(i, 1);
    else if (act === 'add') {
      const last = w.intervals[w.intervals.length - 1];
      w.intervals.push({ type: last && last.type === 'walk' ? 'run' : 'walk', durationSec: 60 });
    } else if (act === 'rinc') w.repeats = Math.min(99, w.repeats + 1);
    else if (act === 'rdec') w.repeats = Math.max(1, w.repeats - 1);
    else if (act === 'cancel') { location.hash = '#/'; return; }
    else if (act === 'save') {
      error = storage.validate(w) || '';
      if (!error) {
        w.name = w.name.trim();
        storage.saveWorkout(w);
        location.hash = '#/';
        return;
      }
    }
    draw();
  };

  const onChange = e => {
    const el = e.target;
    if (el.dataset.act !== 'toggle') return;
    const key = el.dataset.key;
    w[key] = el.checked ? { type: key, durationSec: 300 } : null;
    draw();
  };

  const onInput = e => { if (e.target.id === 'name') w.name = e.target.value; };

  let drag = null;

  const dropTarget = y => {
    const rows = [...root.querySelectorAll('.iv-row')];
    for (const row of rows) {
      if (+row.dataset.i === drag.from) continue;
      const r = row.getBoundingClientRect();
      if (y < r.top + r.height / 2) return { row, before: true };
    }
    const others = rows.filter(r => +r.dataset.i !== drag.from);
    return { row: others[others.length - 1] || null, before: false };
  };

  const clearMarks = () => root.querySelectorAll('.drop-before, .drop-after')
    .forEach(el => el.classList.remove('drop-before', 'drop-after'));

  const onPointerDown = e => {
    const h = e.target.closest('[data-drag]');
    if (!h) return;
    e.preventDefault();
    const from = +h.dataset.drag;
    const row = h.closest('.iv-row');
    h.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    drag = { from, row, handle: h, startY: e.clientY, pointerId: e.pointerId };
  };

  const onPointerMove = e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.row.style.transform = `translateY(${e.clientY - drag.startY}px)`;
    clearMarks();
    const t = dropTarget(e.clientY);
    if (t.row) t.row.classList.add(t.before ? 'drop-before' : 'drop-after');
  };

  const onPointerUp = e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const t = e.type === 'pointerup' ? dropTarget(e.clientY) : { row: null };
    const { from } = drag;
    drag = null;
    if (t.row) {
      let to = +t.row.dataset.i + (t.before ? 0 : 1);
      if (to > from) to--;
      if (to !== from) {
        const [moved] = w.intervals.splice(from, 1);
        w.intervals.splice(to, 0, moved);
      }
    }
    draw();
  };

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  draw();
  return () => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
  };
}
