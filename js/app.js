import * as list from './views/list.js';
import * as editor from './views/editor.js';
import * as runner from './views/runner.js';

const root = document.getElementById('app');
let cleanup = null;

const routes = [
  [/^#\/edit\/(.+)$/, editor],
  [/^#\/run\/(.+)$/, runner],
];

function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const hash = location.hash || '#/';
  let view = list;
  let params = {};
  for (const [re, v] of routes) {
    const m = hash.match(re);
    if (m) { view = v; params = { id: decodeURIComponent(m[1]) }; break; }
  }
  window.scrollTo(0, 0);
  cleanup = view.render(root, params) || null;
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
