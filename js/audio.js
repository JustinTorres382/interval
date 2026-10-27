let ctx = null;
let master = null;
const prefs = { sound: true, vibrate: true };

export function setPrefs(p) { Object.assign(prefs, p); }

// Must be called from a user gesture on mobile.
export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      // Compressor lets us stack loud layers without clipping.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 8;
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* audio unsupported */ }
}

function partial(freq, t0, ring, vol, type) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ring);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + ring + 0.05);
}

// Warm, full bell: struck sine/triangle with overtones and a ringing decay.
function bold(freq, startOffset, dur, vol = 0.9) {
  if (!ctx || !prefs.sound) return;
  const t0 = ctx.currentTime + startOffset;
  const ring = dur + 0.5;
  partial(freq, t0, ring, vol * 0.7, 'sine');
  partial(freq * 2, t0, ring * 0.7, vol * 0.35, 'sine');
  partial(freq * 3, t0, ring * 0.45, vol * 0.2, 'sine');
  partial(freq / 2, t0, ring * 0.8, vol * 0.3, 'triangle');
}

export function vibrate(pattern) {
  if (prefs.vibrate && navigator.vibrate) navigator.vibrate(pattern);
}

export function tick() {
  bold(1000, 0, 0.18, 0.8);
  vibrate(60);
}

// Rising for effort, falling for easy.
export function stepChime(type) {
  if (type === 'run') {
    bold(523, 0, 0.18); bold(659, 0.22, 0.18); bold(784, 0.44, 0.18); bold(1047, 0.66, 0.7, 1);
    vibrate([300, 100, 300, 100, 600]);
  } else {
    bold(1047, 0, 0.18); bold(784, 0.22, 0.18); bold(659, 0.44, 0.18); bold(523, 0.66, 0.7, 1);
    vibrate([600, 150, 600]);
  }
}

export function stepEndAlert() {
  for (let i = 0; i < 4; i++) bold(880, i * 0.3, 0.22, 1);
  vibrate([300, 100, 300, 100, 300, 100, 300]);
}

export function realert() {
  for (let i = 0; i < 3; i++) bold(784, i * 0.25, 0.18, 0.9);
  vibrate([200, 100, 200]);
}

export function finish() {
  [523, 659, 784, 1047].forEach((f, i) => bold(f, i * 0.2, 0.25, 1));
  bold(1047, 0.85, 1.0, 1);
  vibrate([300, 100, 300, 100, 800]);
}
