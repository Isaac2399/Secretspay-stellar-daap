/* Service worker: avisos push cuando un pedido del evento queda listo. */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {
    title: 'Orden lista',
    body: 'Ve a la barra a retirar tu pedido.',
    url: '/event',
    orderId: '',
  }
  try {
    if (event.data) {
      const parsed = event.data.json()
      data = {
        title: typeof parsed.title === 'string' ? parsed.title : data.title,
        body: typeof parsed.body === 'string' ? parsed.body : data.body,
        url: typeof parsed.url === 'string' ? parsed.url : data.url,
        orderId: typeof parsed.orderId === 'string' ? parsed.orderId : '',
      }
    }
  } catch {
    try {
      const text = event.data?.text()
      if (text) {
        data.body = text
      }
    } catch {
      // mantener defaults
    }
  }

  const tag = data.orderId ? `order-ready-${data.orderId}` : `order-ready-${Date.now()}`
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url },
      tag,
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [200, 100, 200, 100, 280],
      timestamp: Date.now(),
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/event'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client && targetUrl) {
            return client.navigate(targetUrl).then((navigated) => navigated?.focus?.() ?? client.focus())
          }
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
      return undefined
    }),
  )
})
