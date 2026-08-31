const CACHE_NAME = "bg3quest-cache-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./images/karlekh.png",
  "./images/karlekh-joined.png",
  "./images/gejlina.png",
  "./images/gejlina-joined.png",
  "./images/shadowharya.png",
  "./images/shadowharya-joined.png",
  "./images/newspaper-01-full.jpg",
  "./images/newspaper-02-template.jpg",
  "./images/title-splash.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Стратегия "сеть в приоритете, кэш — запасной вариант":
// пока есть интернет (при разработке/тестах) — всегда подтягивается
// свежая версия файлов и кэш обновляется. Как только сети нет
// (день квеста, глушилки в центре) — приложение работает из кэша.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
