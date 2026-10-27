import { uid } from './util.js';

const KEY = 'interval.v1';
const LEGACY_KEY = 'gawk.v1';
const DEFAULT_SETTINGS = { autoAdvance: true, sound: true, vibrate: true, countdownBeeps: true };

function seed() {
  const now = Date.now();
  return {
    workouts: [{
      id: uid(),
      name: 'Beginner Walk/Run',
      warmup: { type: 'warmup', durationSec: 300 },
      intervals: [{ type: 'walk', durationSec: 60 }, { type: 'run', durationSec: 120 }],
      repeats: 3,
      cooldown: { type: 'cooldown', durationSec: 300 },
      createdAt: now,
      updatedAt: now,
    }],
    settings: { ...DEFAULT_SETTINGS },
    run: null,
  };
}

let data = null;

function load() {
  if (data) return data;
  try {
    data = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY));
  } catch {
    data = null;
  }
  if (!data || !Array.isArray(data.workouts)) data = seed();
  data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  return data;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* storage full or blocked; keep in-memory */ }
}

export const listWorkouts = () => load().workouts;
export const getWorkout = id => load().workouts.find(w => w.id === id);

export function validate(w) {
  if (!w.name || !w.name.trim()) return 'Give the workout a name.';
  if (!w.intervals.length) return 'Add at least one interval.';
  if (!(w.repeats >= 1)) return 'Repeats must be at least 1.';
  return null;
}

export function saveWorkout(w) {
  const d = load();
  w.updatedAt = Date.now();
  const i = d.workouts.findIndex(x => x.id === w.id);
  if (i >= 0) d.workouts[i] = w;
  else { w.createdAt = w.updatedAt; d.workouts.push(w); }
  save();
}

export function deleteWorkout(id) {
  const d = load();
  d.workouts = d.workouts.filter(w => w.id !== id);
  if (d.run && d.run.workoutId === id) d.run = null;
  save();
}

export function duplicateWorkout(id) {
  const w = getWorkout(id);
  if (!w) return;
  const copy = JSON.parse(JSON.stringify(w));
  copy.id = uid();
  copy.name = `${w.name} (copy)`;
  saveWorkout(copy);
}

export const getSettings = () => load().settings;
export function setSetting(key, value) {
  load().settings[key] = value;
  save();
}

export const getRun = () => load().run;
export function setRun(run) {
  load().run = run;
  save();
}
