// Service worker di Prisma: il gioco è tutto statico, quindi all'installazione si salva ogni file
// e da lì in poi funziona anche senza rete. VERSION la sostituisce il workflow con il commit
// pubblicato: un sw.js diverso fa installare una copia nuova e coerente dei file, e la vecchia sparisce.
const VERSION = "1c10c982df04";
const CACHE = `prisma-${VERSION}`;
const FILES = [
  "./", "index.html", "manifest.webmanifest",
  "assets/style.css", "assets/core.js", "assets/levels.js", "assets/render.js", "assets/legend.js",
  "assets/guide.js", "assets/shop.js", "assets/game.js", "assets/icon.svg",
  "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/icon-maskable-512.png", "assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("prisma-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Prima la copia salvata (apertura istantanea, anche offline), poi la rete per ciò che manca.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true, cacheName: CACHE }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === "navigate" ? caches.match("index.html", { cacheName: CACHE }) : Response.error()));
    })
  );
});
