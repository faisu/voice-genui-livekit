/**
 * No-op service worker. Some browser previews and dev tools probe /sw.js;
 * this file exists only to avoid 404 noise. It does not cache or intercept requests.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
