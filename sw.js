const CACHE_NAME = "vision-school-v2026-09-03-connection-ui-1";

const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json",
    "./logo.png",
    "./school-background.png",
    "./images/vision-school-logo.png",
    "./Vision%20School%20QR%20Code.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES).catch(error => {
                console.warn("[Vision School SW] Some cache files could not be cached:", error);
            }))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME && key.startsWith("vision-school-"))
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Always try the network first for HTML/JS/CSS so GitHub Pages updates
    // become visible immediately. Fall back to cache when offline.
    const pathname = url.pathname;
    const isAppShell = /\/(?:index\.html|app\.js|style\.css|sw\.js|manifest\.json)?$/.test(pathname)
        || /\/(?:app\.js|style\.css|index\.html)$/.test(pathname);

    if (isAppShell) {
        event.respondWith(
            fetch(request, { cache: "no-store" })
                .then(response => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(request).then(cached => cached || Response.error()))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request).then(response => {
            if (response && response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
        }))
    );
});

console.log("[Vision School SW] Loaded:", CACHE_NAME);
