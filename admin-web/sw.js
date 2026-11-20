/* SURYA admin: phone notifications. No caching, no offline mode: this only receives pushes and handles taps on them. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'SURYA', body: e.data ? e.data.text() : '' }; }
  const hide = d.lockHide && d.publicBody;
  e.waitUntil(self.registration.showNotification(d.title || 'SURYA', {
    body: hide ? d.publicBody : (d.body || ''),
    image: hide ? undefined : d.image,
    icon: 'img/icon-192.png', badge: 'img/badge-96.png',
    tag: d.tag || undefined, renotify: !!d.tag,
    vibrate: [140, 70, 140], timestamp: Date.now(),
    actions: hide ? [] : (d.actions || []).slice(0, 2),
    data: { url: d.url || './', ...(d.data || {}) },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {}, base = self.registration.scope;
  const markSent = () => d.outboxId ? fetch(base + 'api/outbox/' + d.outboxId + '/sent', { method: 'POST', credentials: 'include', headers: { 'x-sy-csrf': '1' } }).catch(() => {}) : Promise.resolve();
  e.waitUntil((async () => {
    if (e.action === 'done') return markSent();
    if (e.action === 'wa' && d.wa) { await markSent(); return self.clients.openWindow(d.wa); }
    const target = base + (d.url && d.url !== './' ? d.url : '');
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if (c.url.startsWith(base)) { await c.focus(); c.postMessage({ go: d.url || '#/' }); return; }
    return self.clients.openWindow(target);
  })());
});
