import * as storage from '../storage.js';
import { esc, fmt, totalSec, summary } from '../util.js';

export function render(root) {
  const draw = () => {
    const workouts = storage.listWorkouts();
    const s = storage.getSettings();
    root.innerHTML = `
      <div class="screen">
        <div class="topbar"><h1>Interval</h1><button class="primary" data-act="new">+ New</button></div>
        ${workouts.length ? '' : '<p class="muted">No workouts yet. Tap “+ New” to create one.</p>'}
        ${workouts.map(w => `
          <div class="card" data-id="${w.id}">
            <div class="row between"><h2>${esc(w.name)}</h2><span class="muted">${fmt(totalSec(w))}</span></div>
            <div class="muted">${summary(w)}${w.warmup ? ' · warm-up' : ''}${w.cooldown ? ' · cool-down' : ''}</div>
            <div class="card-actions">
              <button class="primary start" data-act="start">▶ Start</button>
              <button data-act="edit">Edit</button>
              <button data-act="dup">Copy</button>
              <button class="danger" data-act="del">Delete</button>
            </div>
          </div>`).join('')}
        <div class="card">
          <h2>Settings</h2>
          <label class="setting">Sound alerts<input type="checkbox" data-set="sound" ${s.sound ? 'checked' : ''}></label>
          <label class="setting">Vibration<input type="checkbox" data-set="vibrate" ${s.vibrate ? 'checked' : ''}></label>
          <label class="setting">3-2-1 countdown beeps<input type="checkbox" data-set="countdownBeeps" ${s.countdownBeeps ? 'checked' : ''}></label>
        </div>
      </div>`;
  };

  const onClick = e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'new') { location.hash = '#/edit/new'; return; }
    const id = btn.closest('[data-id]').dataset.id;
    const w = storage.getWorkout(id);
    if (act === 'start') location.hash = `#/run/${id}`;
    else if (act === 'edit') location.hash = `#/edit/${id}`;
    else if (act === 'dup') { storage.duplicateWorkout(id); draw(); }
    else if (act === 'del' && confirm(`Delete “${w.name}”?`)) { storage.deleteWorkout(id); draw(); }
  };

  const onChange = e => {
    const key = e.target.dataset.set;
    if (key) storage.setSetting(key, e.target.checked);
  };

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  draw();
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
}
