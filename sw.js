/* =========================================================
   VISION SCHOOL ATTENDANCE SYSTEM
   SERVICE WORKER
   Version: 2026.08.14.1

   Purpose:
   - Prevent the phone/PWA from showing an old version
   - Keep the latest app files available
   - Automatically remove old caches
   - Allow the app to work when temporarily offline
   ========================================================= */

const CACHE_VERSION = "vision-school-v2026-08-14-1";
const APP_CACHE = CACHE_VERSION;

/*
   IMPORTANT:
   Keep these files in the same GitHub repository/root
   as index.html, app.js, style.css and sw.js.
*/
const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json",

    // School logo
    "./logo.png"
];


/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener("install", (event) => {

    console.log(
        "[Vision School SW] Installing:",
        CACHE_VERSION
    );

    /*
       Activate the new service worker immediately.
       This is important when a new version is published.
    */
    self.skipWaiting();

    event.waitUntil(

        caches.open(APP_CACHE)
            .then((cache) => {

                console.log(
                    "[Vision School SW] Caching latest app files..."
                );

                /*
                   Cache each file individually.

                   If one optional file fails, the entire
                   service worker installation will not fail.
                */

                return Promise.all(

                    APP_FILES.map((file) => {

                        return fetch(
                            new Request(file, {
                                cache: "no-cache"
                            })
                        )
                        .then((response) => {

                            if (!response.ok) {
                                throw new Error(
                                    `HTTP ${response.status} for ${file}`
                                );
                            }

                            return cache.put(
                                file,
                                response
                            );

                        })
                        .catch((error) => {

                            console.warn(
                                "[Vision School SW] Could not cache:",
                                file,
                                error
                            );

                        });

                    })

                );

            })

    );

});


/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener("activate", (event) => {

    console.log(
        "[Vision School SW] Activating:",
        CACHE_VERSION
    );

    event.waitUntil(

        Promise.all([

            /*
               Delete every old Vision School cache.
            */

            caches.keys()
                .then((cacheNames) => {

                    return Promise.all(

                        cacheNames
                            .filter((cacheName) => {

                                return (
                                    cacheName.startsWith(
                                        "vision-school-v"
                                    ) &&
                                    cacheName !== APP_CACHE
                                );

                            })
                            .map((oldCache) => {

                                console.log(
                                    "[Vision School SW] Removing old cache:",
                                    oldCache
                                );

                                return caches.delete(
                                    oldCache
                                );

                            })

                    );

                }),

            /*
               Take control of already-open pages.
               This helps the phone immediately switch
               to the newest application version.
            */

            self.clients.claim()

        ])

    );

});


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener("fetch", (event) => {

    const request = event.request;

    /*
       Only handle GET requests.
       Supabase POST/PATCH/DELETE requests must go
       directly to Supabase.
    */

    if (request.method !== "GET") {
        return;
    }


    const url = new URL(request.url);


    /* =====================================================
       NEVER CACHE SUPABASE
       ===================================================== */

    if (
        url.hostname.includes("supabase.co") ||
        url.hostname.includes("supabase.com")
    ) {

        return;

    }


    /* =====================================================
       NEVER CACHE CDN FILES
       ===================================================== */

    if (
        url.hostname.includes("cdn.jsdelivr.net") ||
        url.hostname.includes("unpkg.com")
    ) {

        return;

    }


    /* =====================================================
       APP FILES
       ===================================================== */

    event.respondWith(

        fetch(request, {
            cache: "no-cache"
        })

        .then((networkResponse) => {

            /*
               If the server returns a valid response,
               save the newest version into the cache.
            */

            if (
                networkResponse &&
                networkResponse.status === 200 &&
                networkResponse.type !== "opaque"
            ) {

                const responseToCache =
                    networkResponse.clone();

                caches.open(APP_CACHE)
                    .then((cache) => {

                        cache.put(
                            request,
                            responseToCache
                        );

                    });

            }

            return networkResponse;

        })

        .catch(() => {

            /*
               If there is no internet connection,
               use the cached version.
            */

            return caches.match(request)
                .then((cachedResponse) => {

                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    /*
                       If navigation fails completely,
                       fall back to index.html.
                    */

                    if (
                        request.mode === "navigate"
                    ) {

                        return caches.match(
                            "./index.html"
                        );

                    }

                    return new Response(
                        "Offline",
                        {
                            status: 503,
                            statusText: "Offline"
                        }
                    );

                });

        })

    );

});


/* =========================================================
   MESSAGE HANDLER
   ========================================================= */

self.addEventListener("message", (event) => {

    if (!event.data) {
        return;
    }


    /* -----------------------------------------------------
       FORCE UPDATE
       ----------------------------------------------------- */

    if (
        event.data.type ===
        "SKIP_WAITING"
    ) {

        console.log(
            "[Vision School SW] Force update requested."
        );

        self.skipWaiting();

    }


    /* -----------------------------------------------------
       CLEAR CACHE
       ----------------------------------------------------- */

    if (
        event.data.type ===
        "CLEAR_CACHE"
    ) {

        event.waitUntil(

            caches.keys()
                .then((cacheNames) => {

                    return Promise.all(

                        cacheNames
                            .filter((cacheName) => {

                                return cacheName.startsWith(
                                    "vision-school-v"
                                );

                            })
                            .map((cacheName) => {

                                return caches.delete(
                                    cacheName
                                );

                            })

                    );

                })

        );

    }


    /* -----------------------------------------------------
       GET VERSION
       ----------------------------------------------------- */

    if (
        event.data.type ===
        "GET_VERSION"
    ) {

        if (event.source) {

            event.source.postMessage({

                type: "VISION_SCHOOL_VERSION",

                version: CACHE_VERSION

            });

        }

    }

});


/* =========================================================
   LOG
   ========================================================= */

console.log(
    "Vision School Service Worker loaded:",
    CACHE_VERSION
);
