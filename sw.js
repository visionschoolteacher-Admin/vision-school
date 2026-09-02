const CACHE_NAME = "vision-school-v2026-09-02-3";

const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json",
    "./logo.png",
    "./school-background.png",
    "./images/vision-school-logo.png"
];

console.log("[Vision School SW] Loaded:", CACHE_NAME);

self.addEventListener("install", event => {
    console.log("[Vision School SW] Installing:", CACHE_NAME);

    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            console.log("[Vision School SW] Caching latest app files...");

            for (const file of APP_FILES) {
                try {
                    const response = await fetch(file, { cache: "no-cache" });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status} for ${file}`);
                    }

                    await cache.put(file, response);
                    console.log("[Vision School SW] Cached:", file);
                } catch (error) {
                    console.warn("[Vision School SW] Could not cache:", file, error);
                }
            }
        })
    );

    self.skipWaiting();
});

self.addEventListener("activate", event => {
    console.log("[Vision School SW] Activating:", CACHE_NAME);

    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames.map(cacheName => {
                    if (
                        cacheName !== CACHE_NAME &&
                        cacheName.startsWith("vision-school-")
                    ) {
                        console.log("[Vision School SW] Removing old cache:", cacheName);
                        return caches.delete(cacheName);
                    }
                    return undefined;
                })
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Never intercept Supabase/API traffic.
    if (
        url.hostname.includes("supabase.co") ||
        url.pathname.includes("/rest/") ||
        url.pathname.includes("/auth/")
    ) {
        return;
    }

    // Navigation is network-first so new GitHub Pages deployments are picked up quickly.
    if (request.mode === "navigate" || request.destination === "document") {
        event.respondWith(
            fetch(request, { cache: "no-store" })
                .then(response => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() =>
                    caches.match(request).then(
                        cached => cached || caches.match("./index.html")
                    )
                )
        );
        return;
    }

    // Same-origin application assets use cache-first.
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request)
                .then(cached => {
                    if (cached) return cached;

                    return fetch(request, { cache: "no-cache" }).then(response => {
                        if (response && response.ok) {
                            const copy = response.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                        }
                        return response;
                    });
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // External CDN resources stay outside the app cache.
    event.respondWith(fetch(request));
});

self.addEventListener("message", event => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});
