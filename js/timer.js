// Pure workout timer: no DOM, injectable clock. Call update() regularly.

export function flatten(w) {
  const steps = [];
  if (w.warmup) steps.push({ type: 'warmup', durationSec: w.warmup.durationSec, round: 0, totalRounds: w.repeats });
  for (let r = 1; r <= w.repeats; r++) {
    for (const s of w.intervals) {
      steps.push({ type: s.type, durationSec: s.durationSec, label: s.label, round: r, totalRounds: w.repeats });
    }
  }
  if (w.cooldown) steps.push({ type: 'cooldown', durationSec: w.cooldown.durationSec, round: 0, totalRounds: w.repeats });
  return steps;
}

const LATE_MS = 1500;
const REALERT_MS = 10000;

export class Timer {
  constructor(steps, { now = () => Date.now(), auto = true, onEvent = () => {} } = {}) {
    this.steps = steps;
    this.now = now;
    this.auto = auto;
    this.onEvent = onEvent;
    this.state = 'idle'; // idle | running | paused | awaitingNext | finished
    this.index = 0;
    this.endsAt = 0;
    this.pausedRemainingMs = 0;
    this.awaitingSince = 0;
    this.lastRealert = 0;
    this.cdSent = new Set();
  }

  get step() { return this.steps[this.index]; }
  emit(name, data = {}) { this.onEvent(name, { ...data, index: this.index, step: this.step }); }

  start() {
    this.index = 0;
    this._begin(this.now());
  }

  _begin(at) {
    this.state = 'running';
    this.endsAt = at + this.step.durationSec * 1000;
    this.cdSent = new Set();
    this.emit('stepStart', { late: this.now() - at > LATE_MS });
  }

  _finish() {
    this.state = 'finished';
    this.emit('finished');
  }

  update() {
    const t = this.now();
    if (this.state === 'running') {
      while (this.state === 'running' && t >= this.endsAt) {
        const endAt = this.endsAt;
        this.emit('stepEnd', { late: t - endAt > LATE_MS });
        if (this.index === this.steps.length - 1) { this._finish(); return; }
        if (this.auto) {
          this.index++;
          this._begin(endAt);
        } else {
          this.state = 'awaitingNext';
          this.awaitingSince = endAt;
          this.lastRealert = endAt;
        }
      }
      if (this.state === 'running') {
        const rem = Math.ceil((this.endsAt - t) / 1000);
        if (rem >= 1 && rem <= 3 && !this.cdSent.has(rem)) {
          this.cdSent.add(rem);
          this.emit('countdown', { remaining: rem });
        }
      }
    } else if (this.state === 'awaitingNext' && t - this.lastRealert >= REALERT_MS) {
      this.lastRealert = t;
      this.emit('realert');
    }
  }

  pause() {
    if (this.state !== 'running') return;
    this.pausedRemainingMs = Math.max(0, this.endsAt - this.now());
    this.state = 'paused';
  }

  resume() {
    if (this.state !== 'paused') return;
    this.endsAt = this.now() + this.pausedRemainingMs;
    this.state = 'running';
  }

  next() {
    if (this.state !== 'awaitingNext') return;
    this.index++;
    this._begin(this.now());
  }

  skip() {
    if (this.state === 'idle' || this.state === 'finished') return;
    if (this.index >= this.steps.length - 1) { this._finish(); return; }
    this.index++;
    this._begin(this.now());
  }

  back() {
    if (this.state === 'idle' || this.state === 'finished') return;
    const durMs = this.step.durationSec * 1000;
    const remaining = this.remainingMs();
    const elapsed = this.state === 'awaitingNext' ? durMs : durMs - remaining;
    if (elapsed <= 3000 && this.index > 0) this.index--;
    this._begin(this.now());
  }

  setAuto(v) {
    this.auto = v;
    if (v && this.state === 'awaitingNext') this.next();
  }

  stop() { this.state = 'idle'; }

  remainingMs() {
    if (this.state === 'running') return Math.max(0, this.endsAt - this.now());
    if (this.state === 'paused') return this.pausedRemainingMs;
    return 0;
  }

  overtimeMs() {
    return this.state === 'awaitingNext' ? Math.max(0, this.now() - this.awaitingSince) : 0;
  }

  totalSec() { return this.steps.reduce((a, s) => a + s.durationSec, 0); }

  totalRemainingMs() {
    if (this.state === 'finished') return 0;
    const later = this.steps.slice(this.index + 1).reduce((a, s) => a + s.durationSec * 1000, 0);
    if (this.state === 'idle') return later + this.step.durationSec * 1000;
    return this.remainingMs() + later;
  }

  snapshot() {
    return {
      index: this.index, state: this.state, endsAt: this.endsAt, pausedRemainingMs: this.pausedRemainingMs,
      awaitingSince: this.awaitingSince, lastRealert: this.lastRealert,
    };
  }

  restore(s) {
    Object.assign(this, s);
    this.cdSent = new Set([1, 2, 3]);
    this.update();
  }
}
