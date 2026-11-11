const offlineCache = 'reminders-offline-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(offlineCache)
    .then((cache) => cache.add('/offline.html'))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('reminders-offline-') && key !== offlineCache)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(async () => {
    return (await caches.match('/offline.html')) ?? Response.error();
  }));
});

function notificationBody(payload) {
  const body = payload.body || 'Tenés un recordatorio.';
  const scheduledAt = new Date(payload.scheduledAt);
  if (!Number.isFinite(scheduledAt.getTime())) return body;
  const today = new Date().toDateString() === scheduledAt.toDateString();
  const date = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit', minute: '2-digit', ...(today ? {} : { day: 'numeric', month: 'short' }),
  }).format(scheduledAt);
  return body + ' · Programado ' + (today ? 'a las ' : 'para el ') + date;
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'Reminders GJR', {
    body: notificationBody(payload),
    icon: '/icons/icon-192.png',
    tag: payload.tag || 'reminders',
    data: { url: payload.url || '/?view=today' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((item) => item.url === url);
    if (open) return open.focus();

    const current = windows.find((item) => new URL(item.url).origin === self.location.origin);
    if (current) {
      const navigated = await current.navigate(url).catch(() => null);
      if (navigated) return navigated.focus();
    }
    return self.clients.openWindow(url);
  })());
});

