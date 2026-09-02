const CACHE_NAME = "vision-school-v2026-09-02-4";

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

console.log(
    "[Vision School SW] Loaded:",
    CACHE_NAME
);


// =========================================================
// INSTALL
// =========================================================

self.addEventListener("install", event => {

    console.log(
        "[Vision School SW] Installing:",
        CACHE_NAME
    );

    event.waitUntil(

        caches.open(CACHE_NAME)

            .then(async cache => {

                console.log(
                    "[Vision School SW] Caching latest app files..."
                );

                for (const file of APP_FILES) {

                    try {

                        const response = await fetch(
                            file,
                            { cache: "no-cache" }
                        );

                        if (!response || !response.ok) {
                            throw new Error(
                                `HTTP ${response?.status || "unknown"} for ${file}`
                            );
                        }

                        await cache.put(
                            file,
                            response.clone()
                        );

                        console.log(
                            "[Vision School SW] Cached:",
                            file
                        );

                    } catch (error) {

                        console.warn(
                            "[Vision School SW] Could not cache:",
                            file,
                            error
                        );

                    }
                }

            })

    );

    self.skipWaiting();
});


// =========================================================
// ACTIVATE
// =========================================================

self.addEventListener("activate", event => {

    console.log(
        "[Vision School SW] Activating:",
        CACHE_NAME
    );

    event.waitUntil(

        caches.keys()

            .then(cacheNames => {

                return Promise.all(

                    cacheNames.map(cacheName => {

                        if (
                            cacheName !== CACHE_NAME &&
                            cacheName.startsWith("vision-school-")
                        ) {

                            console.log(
                                "[Vision School SW] Removing old cache:",
                                cacheName
                            );

                            return caches.delete(cacheName);
                        }

                        return Promise.resolve();
                    })

                );

            })

            .then(() => {

                console.log(
                    "[Vision School SW] Claiming clients..."
                );

                return self.clients.claim();

            })

    );
});


// =========================================================
// FETCH
// =========================================================

self.addEventListener("fetch", event => {

    const request = event.request;

    // Only handle GET requests.
    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);


    // =====================================================
    // IMPORTANT:
    // DO NOT INTERCEPT SUPABASE OR EXTERNAL CDN REQUESTS
    // =====================================================

    if (
        url.origin !== self.location.origin
    ) {
        return;
    }


    if (
        url.hostname.includes("supabase.co") ||
        url.pathname.includes("/rest/") ||
        url.pathname.includes("/auth/")
    ) {
        return;
    }


    // =====================================================
    // NAVIGATION / HTML
    // Network first, cache fallback
    // =====================================================

    if (
        request.mode === "navigate" ||
        request.destination === "document"
    ) {

        event.respondWith(

            fetch(request, {
                cache: "no-store"
            })

            .then(response => {

                if (
                    response &&
                    response.ok
                ) {

                    const copy = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => {

                            cache.put(
                                request,
                                copy
                            ).catch(error => {

                                console.warn(
                                    "[Vision School SW] Navigation cache failed:",
                                    error
                                );

                            });

                        })
                        .catch(error => {

                            console.warn(
                                "[Vision School SW] Cache open failed:",
                                error
                            );

                        });

                }

                return response;

            })

            .catch(async error => {

                console.warn(
                    "[Vision School SW] Navigation network failed:",
                    error
                );

                const cachedRequest =
                    await caches.match(request);

                if (cachedRequest) {
                    return cachedRequest;
                }

                const cachedIndex =
                    await caches.match("./index.html");

                if (cachedIndex) {
                    return cachedIndex;
                }

                // Always return a valid Response.
                return new Response(
                    "Vision School is currently offline.",
                    {
                        status: 503,
                        statusText: "Offline",
                        headers: {
                            "Content-Type": "text/plain; charset=utf-8"
                        }
                    }
                );

            })

        );

        return;
    }


    // =====================================================
    // SAME-ORIGIN ASSETS
    // Cache first, network fallback
    // =====================================================

    if (
        url.origin === self.location.origin
    ) {

        event.respondWith(

            caches.match(request)

                .then(cached => {

                    if (cached) {

                        return cached;
                    }

                    return fetch(
                        request,
                        {
                            cache: "no-cache"
                        }
                    )

                    .then(response => {

                        if (
                            response &&
                            response.ok
                        ) {

                            const copy =
                                response.clone();

                            caches.open(CACHE_NAME)
                                .then(cache => {

                                    cache.put(
                                        request,
                                        copy
                                    ).catch(error => {

                                        console.warn(
                                            "[Vision School SW] Asset cache failed:",
                                            error
                                        );

                                    });

                                })
                                .catch(error => {

                                    console.warn(
                                        "[Vision School SW] Cache open failed:",
                                        error
                                    );

                                });
                        }

                        return response;

                    })

                    .catch(async error => {

                        console.warn(
                            "[Vision School SW] Asset request failed:",
                            request.url,
                            error
                        );

                        const fallback =
                            await caches.match(request);

                        if (fallback) {
                            return fallback;
                        }

                        // IMPORTANT:
                        // Never return undefined from respondWith().
                        return new Response(
                            "",
                            {
                                status: 503,
                                statusText: "Asset unavailable"
                            }
                        );

                    });

                })

        );

        return;
    }

});


// =========================================================
// MESSAGE
// =========================================================

self.addEventListener("message", event => {

    if (
        event.data &&
        event.data.type === "SKIP_WAITING"
    ) {

        console.log(
            "[Vision School SW] SKIP_WAITING received."
        );

        self.skipWaiting();
    }

});
