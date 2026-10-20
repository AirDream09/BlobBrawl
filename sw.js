// Blob Brawl – Service Worker (Offline-Modus)
// Seiten & Spieldateien: erst Netzwerk (immer aktuell), sonst Cache. CDN-Dateien (Tailwind, Icons, Schrift): Cache zuerst.
const V = 'blobbrawl-v1';
const LOCAL = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const CDN = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap'
];
const CDN_HOSTS = /(^|\.)(cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(LOCAL.map(u => c.add(u).catch(() => {})));
    for (const u of CDN) {
      try {
        const tw = u.includes('tailwind');
        const r = await fetch(u, { mode: tw ? 'no-cors' : 'cors' });
        await c.put(u, r.clone());
        if (!tw) {   // Schriftdateien (woff2), die das CSS lädt, gleich mit ablegen
          const t = await r.text();
          const files = [...new Set([...t.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/['"]/g, '').trim()).filter(x => /\.woff2(\?|$)/.test(x)).map(x => new URL(x, u).href))];
          await Promise.all(files.map(async f => { try { await c.put(f, await fetch(f, { mode: 'cors' })); } catch (_) {} }));
        }
      } catch (_) {}
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V && k.startsWith('blobbrawl-')) await caches.delete(k);
    await self.clients.claim();
    const cs = await self.clients.matchAll({ includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ t: 'ready' }));
  })());
});

async function networkFirst(req) {
  const c = await caches.open(V);
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
    if (r && r.ok) c.put(req, r.clone());
    return r;
  } catch (_) {
    return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await c.match('./') : null) || Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(V), hit = await c.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || Response.error();
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url); if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
  if (u.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (CDN_HOSTS.test(u.hostname)) e.respondWith(staleWhileRevalidate(req));
});
