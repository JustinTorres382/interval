let lock = null;
let wanted = false;

export const supported = () => 'wakeLock' in navigator;

async function request() {
  if (!supported() || lock) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch { lock = null; }
}

export function acquire() {
  wanted = true;
  request();
}

export function release() {
  wanted = false;
  if (lock) { lock.release().catch(() => {}); lock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wanted) request();
});
