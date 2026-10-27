export function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const TYPE_NAMES = { walk: 'Walk', run: 'Run', rest: 'Rest', warmup: 'Warm-up', cooldown: 'Cool-down' };

export function totalSec(w) {
  const iv = w.intervals.reduce((a, s) => a + s.durationSec, 0) * w.repeats;
  return iv + (w.warmup ? w.warmup.durationSec : 0) + (w.cooldown ? w.cooldown.durationSec : 0);
}

export function summary(w) {
  const iv = w.intervals.map(s => `${TYPE_NAMES[s.type][0]} ${fmt(s.durationSec)}`).join(' / ');
  return `${iv} × ${w.repeats}`;
}
