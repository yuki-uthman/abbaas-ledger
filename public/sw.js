// The service worker that makes Chrome offer "Add to Home screen", and that lets
// a launched icon open even when the phone is off the network.
//
// It is deliberately network-first: the ledger is a live thing, so a response from
// the network always wins and the cache is only what answers when the network
// cannot. That way the installed app never shows an older screen than the browser
// would, and a new build is picked up on the first load that reaches the network.

const CACHE = 'abbaas-ledger-v1'

self.addEventListener('install', () => {
  // Nothing is pre-cached: the first online visit fills the cache as it loads.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Older caches from an earlier build are of no use to this one.
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  // Only plain GETs of this origin's own files are ours to answer; everything
  // else, the Supabase calls above all, goes straight to the network untouched.
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request)
        if (response && response.ok) {
          const cache = await caches.open(CACHE)
          await cache.put(request, response.clone())
        }
        return response
      } catch (error) {
        // Offline: the last good copy, or the document for a navigation, so the
        // icon still opens an app rather than a browser error.
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.mode === 'navigate') {
          const fallback = await caches.match(new URL('.', self.location.href).href)
          if (fallback) return fallback
        }
        throw error
      }
    })(),
  )
})
