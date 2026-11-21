// Minimal offline shell: static files are cached, API and pages always go to the network first.
const C = 'surya-static-v2';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (/^\/(css|js|fonts|vendor)\//.test(u.pathname) || u.pathname.startsWith('/media/')) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(C).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
  }
});

// Customer phone notifications (order updates, price drops, back in stock, new arrivals)
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'SURYA', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'SURYA', {
    body: d.body || '', icon: '/img/icon-192.png', badge: '/img/favicon-48.png', image: d.image || undefined,
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/' }, actions: (d.actions || []).slice(0, 2), lang: 'en',
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  let u = (e.notification.data && e.notification.data.url) || '/';
  if (!/^\//.test(u)) u = '/';
  if (e.action === 'buy') u += (u.includes('?') ? '&' : '?') + 'buy=1';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if (c.url.startsWith(self.location.origin) && 'focus' in c) { c.navigate(u).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(u);
  }));
});
