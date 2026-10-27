import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timer, flatten } from '../js/timer.js';

const workout = {
  warmup: { type: 'warmup', durationSec: 10 },
  intervals: [{ type: 'walk', durationSec: 60 }, { type: 'run', durationSec: 120 }],
  repeats: 3,
  cooldown: { type: 'cooldown', durationSec: 10 },
};

function make(opts = {}, w = workout) {
  const clock = { t: 0 };
  const events = [];
  const timer = new Timer(flatten(w), { now: () => clock.t, onEvent: (n, d) => events.push([n, d.index, d.late]), ...opts });
  return { clock, events, timer };
}

test('flatten expands repeats with warm-up and cool-down', () => {
  const steps = flatten(workout);
  assert.equal(steps.length, 8);
  assert.deepEqual(steps.map(s => s.type).slice(0, 3), ['warmup', 'walk', 'run']);
  assert.equal(steps[2].round, 1);
  assert.equal(steps[7].type, 'cooldown');
});

test('auto mode advances through every step and finishes', () => {
  const { clock, events, timer } = make({ auto: true });
  timer.start();
  clock.t = 10_000; timer.update();
  assert.equal(timer.index, 1);
  clock.t = 10_000 + 60_000; timer.update();
  assert.equal(timer.index, 2);
  clock.t = 10 * 1000 + 3 * 180_000 + 10_000; timer.update();
  assert.equal(timer.state, 'finished');
  assert.equal(events.filter(e => e[0] === 'stepStart').length, 8);
});

test('manual mode waits, tracks overtime, re-alerts, then continues on next()', () => {
  const { clock, events, timer } = make({ auto: false });
  timer.start();
  clock.t = 10_000; timer.update();
  assert.equal(timer.state, 'awaitingNext');
  assert.equal(timer.index, 0);
  clock.t = 22_000; timer.update();
  assert.equal(timer.overtimeMs(), 12_000);
  assert.equal(events.filter(e => e[0] === 'realert').length, 1);
  timer.next();
  assert.equal(timer.index, 1);
  assert.equal(timer.state, 'running');
  assert.equal(timer.remainingMs(), 60_000);
});

test('pause and resume preserve remaining time', () => {
  const { clock, timer } = make();
  timer.start();
  clock.t = 4_000; timer.pause();
  clock.t = 100_000; timer.update();
  assert.equal(timer.state, 'paused');
  timer.resume();
  assert.equal(timer.remainingMs(), 6_000);
});

test('background fast-forward in auto mode lands on the right step, marked late', () => {
  const { clock, events, timer } = make({ auto: true });
  timer.start();
  clock.t = 10_000 + 60_000 + 30_000; timer.update();
  assert.equal(timer.index, 2);
  assert.equal(timer.remainingMs(), 90_000);
  assert.ok(events.some(e => e[0] === 'stepStart' && e[1] === 1 && e[2] === true));
});

test('skip and back behave sensibly', () => {
  const { clock, timer } = make();
  timer.start();
  timer.skip();
  assert.equal(timer.index, 1);
  clock.t += 1_000; timer.back();
  assert.equal(timer.index, 0);
  clock.t += 8_000; timer.back();
  assert.equal(timer.index, 0);
  assert.equal(timer.remainingMs(), 10_000);
});

test('countdown beeps fire once each at 3, 2, 1', () => {
  const { clock, events, timer } = make();
  timer.start();
  for (let t = 6_000; t <= 9_900; t += 100) { clock.t = t; timer.update(); }
  assert.deepEqual(events.filter(e => e[0] === 'countdown').length, 3);
});

test('switching to auto while waiting advances immediately', () => {
  const { clock, timer } = make({ auto: false });
  timer.start();
  clock.t = 10_000; timer.update();
  timer.setAuto(true);
  assert.equal(timer.state, 'running');
  assert.equal(timer.index, 1);
});

test('snapshot/restore round trips', () => {
  const { clock, timer } = make();
  timer.start();
  clock.t = 12_000; timer.update();
  const snap = timer.snapshot();
  const b = make();
  b.clock.t = 15_000;
  b.timer.restore(snap);
  assert.equal(b.timer.index, 1);
  assert.equal(b.timer.remainingMs(), 55_000);
});
