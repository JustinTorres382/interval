import * as storage from '../storage.js';
import * as audio from '../audio.js';
import * as wake from '../wakelock.js';
import { Timer, flatten } from '../timer.js';
import { fmt, esc, TYPE_NAMES } from '../util.js';

const RUN_MAX_AGE_MS = 6 * 3600 * 1000;

const stepName = s => s.label || TYPE_NAMES[s.type];

export function render(root, { id }) {
  const w = storage.getWorkout(id);
  if (!w) { location.hash = '#/'; return; }

  const settings = storage.getSettings();
  audio.setPrefs(settings);
  const steps = flatten(w);
  let flashTimer = 0;

  const flash = () => {
    const el = root.firstElementChild;
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove('flash'), 800);
  };

  const timer = new Timer(steps, {
    auto: settings.autoAdvance,
    onEvent: (name, d) => {
      if (name === 'stepStart') {
        if (!d.late) { audio.stepChime(d.step.type); flash(); }
      } else if (name === 'stepEnd') {
        if (!timer.auto && !d.late) { audio.stepEndAlert(); flash(); }
      } else if (name === 'countdown') {
        if (storage.getSettings().countdownBeeps) audio.tick();
      } else if (name === 'realert') {
        audio.realert();
        flash();
      } else if (name === 'finished') {
        audio.finish();
        flash();
        wake.release();
      }
      persist();
    },
  });

  function persist() {
    const st = timer.state;
    if (st === 'idle' || st === 'finished') storage.setRun(null);
    else storage.setRun({ workoutId: w.id, workoutUpdatedAt: w.updatedAt, savedAt: Date.now(), snap: timer.snapshot() });
  }

  const saved = storage.getRun();
  if (saved && saved.workoutId === w.id && saved.workoutUpdatedAt === w.updatedAt
      && Date.now() - saved.savedAt < RUN_MAX_AGE_MS) {
    timer.restore(saved.snap);
    if (timer.state === 'running') wake.acquire();
  }

  let viewKey = '';
  const refs = {};

  function modeToggle() {
    return `<div class="seg" role="group" aria-label="Advance mode">
      <button data-act="auto" class="${timer.auto ? 'on' : ''}">Auto</button>
      <button data-act="manual" class="${timer.auto ? '' : 'on'}">Manual</button>
    </div>`;
  }

  function view() {
    const st = timer.state;
    const step = timer.step;
    const next = timer.steps[timer.index + 1];
    const typeClass = st === 'idle' || st === 'finished' ? '' : `type-${step.type}`;
    let body;
    let controls;

    if (st === 'idle') {
      body = `<div class="label">${esc(w.name)}</div>
        <div class="time">${fmt(timer.totalSec())}</div>
        <div class="round">${steps.length} steps · total time</div>`;
      controls = '<button class="big" data-act="start">▶ Start</button>';
    } else if (st === 'finished') {
      body = `<div class="label">Done! 🎉</div>
        <div class="time">${fmt(timer.totalSec())}</div>
        <div class="round">Great work</div>`;
      controls = '<button class="big" data-act="exit">Back to workouts</button>';
    } else {
      const round = step.round ? `Round ${step.round} / ${step.totalRounds}` : (step.type === 'warmup' ? 'Get ready' : 'Nice job');
      const nextText = next ? `Next: ${stepName(next)} ${fmt(next.durationSec)}` : 'Last step';
      body = `<div class="label" id="label">${esc(stepName(step))}</div>
        <div class="time" id="time"></div>
        <div class="round">${round}</div>
        <div class="next">${nextText}</div>`;
      if (st === 'awaitingNext') {
        controls = `<button class="big" data-act="next">Start ${next ? stepName(next) + ' ' + fmt(next.durationSec) : ''}</button>`;
      } else {
        controls = `<button data-act="back">◀◀ Back</button>
          <button data-act="${st === 'paused' ? 'resume' : 'pause'}">${st === 'paused' ? '▶ Resume' : '⏸ Pause'}</button>
          <button data-act="skip">Skip ▶▶</button>`;
      }
    }

    root.innerHTML = `
      <div class="runner ${typeClass}">
        <div class="topbar"><button data-act="exit" aria-label="Exit">✕ Exit</button>${modeToggle()}</div>
        <div class="stage">${body}</div>
        <div>
          <div class="bar"><i id="bar"></i></div>
          <div class="totals"><span id="elapsed"></span><span id="remaining"></span></div>
        </div>
        <div class="controls">${controls}</div>
      </div>`;
    refs.time = root.querySelector('#time');
    refs.bar = root.querySelector('#bar');
    refs.elapsed = root.querySelector('#elapsed');
    refs.remaining = root.querySelector('#remaining');
    refs.label = root.querySelector('#label');
  }

  function paint() {
    const key = `${timer.state}:${timer.index}:${timer.auto}`;
    if (key !== viewKey) { viewKey = key; view(); }
    const st = timer.state;
    const total = timer.totalSec();
    const remSec = Math.ceil(timer.totalRemainingMs() / 1000);
    if (refs.time) {
      if (st === 'awaitingNext') {
        refs.time.textContent = '+' + fmt(Math.floor(timer.overtimeMs() / 1000));
        refs.label.textContent = `${stepName(timer.step)} complete`;
      } else {
        refs.time.textContent = fmt(Math.ceil(timer.remainingMs() / 1000));
      }
    }
    refs.bar.style.width = `${total ? Math.min(100, ((total - remSec) / total) * 100) : 0}%`;
    refs.elapsed.textContent = `Elapsed ${fmt(total - remSec)}`;
    refs.remaining.textContent = `Left ${fmt(remSec)}`;
  }

  function tick() {
    timer.update();
    paint();
  }

  const onClick = e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    audio.unlock();
    const act = btn.dataset.act;
    if (act === 'start') { timer.start(); wake.acquire(); }
    else if (act === 'pause') timer.pause();
    else if (act === 'resume') timer.resume();
    else if (act === 'next') timer.next();
    else if (act === 'skip') timer.skip();
    else if (act === 'back') timer.back();
    else if (act === 'auto' || act === 'manual') {
      timer.setAuto(act === 'auto');
      storage.setSetting('autoAdvance', act === 'auto');
    } else if (act === 'exit') {
      const active = timer.state !== 'idle' && timer.state !== 'finished';
      if (active && !confirm('Stop this workout?')) return;
      timer.stop();
      storage.setRun(null);
      location.hash = '#/';
      return;
    }
    persist();
    tick();
  };

  const onPointer = () => audio.unlock();
  const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
  const onBeforeUnload = e => {
    if (timer.state === 'running' || timer.state === 'paused') { e.preventDefault(); e.returnValue = ''; }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', onPointer);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('beforeunload', onBeforeUnload);
  const loop = setInterval(tick, 200);
  tick();

  return () => {
    clearInterval(loop);
    clearTimeout(flashTimer);
    root.removeEventListener('click', onClick);
    root.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('beforeunload', onBeforeUnload);
    wake.release();
  };
}
