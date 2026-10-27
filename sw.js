/* Mes Flashs — service worker (fonctionnement hors ligne)
   À chaque modification de CE fichier, augmente le numéro de VERSION. */
const VERSION = "mes-flashs-v10";

/* Fichiers indispensables : l'installation échoue si l'un d'eux manque */
const CORE = [
  "./",
  "./index.html",
  "./logo.png",
  "./interdit-photo.png"
];

/* Fichiers du mode easter egg : facultatifs, un fichier absent n'empêche rien */
const EGG = [
  "EasterEgg/cochon.gif",
  "EasterEgg/cochon_danse.mp3",
  "EasterEgg/wizz_logo.mp3",
  "EasterEgg/wizz.gif",
  "EasterEgg/vendu.mp3",
  "EasterEgg/chien.mp3",
  "EasterEgg/chat.mp3",
  "EasterEgg/vache.mp3",
  "EasterEgg/canard.mp3",
  "EasterEgg/ane.mp3",
  "EasterEgg/coq.mp3",
  "EasterEgg/cochon.mp3",
  "EasterEgg/mouton.mp3",
  "EasterEgg/grenouille.mp3",
  "EasterEgg/lion.mp3",
  "EasterEgg/singe.mp3",
  "EasterEgg/hibou.mp3"
].map(f => "./" + f);

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    /* Un par un : on ignore ceux qui n'existent pas */
    await Promise.all(EGG.map(async u => {
      try { const r = await fetch(u, { cache: "no-cache" }); if (r.ok) await c.put(u, r); } catch (err) {}
    }));
    self.skipWaiting();
  })());
});

/* Supprime les anciennes versions du cache */
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* Les sons sont lus par morceaux (en-tête Range) : Safari exige une réponse adaptée */
  if (req.headers.has("range")) {
    e.respondWith(rangeResponse(req));
    return;
  }

  /* La page : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne */
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req, { cache: "no-cache" });
        if (r.ok) (await caches.open(VERSION)).put("./index.html", r.clone());
        return r;
      } catch (err) {
        return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  /* Le reste (logos, sons, GIF) : cache d'abord, sinon réseau (et on garde une copie) */
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok && r.status === 200) (await caches.open(VERSION)).put(req, r.clone());
      return r;
    } catch (err) {
      return Response.error();
    }
  })());
});

/* Répond à une demande partielle (sons sur iPad) à partir du fichier en cache */
async function rangeResponse(req) {
  let full = await caches.match(req.url, { ignoreSearch: true });
  if (!full) {
    try {
      full = await fetch(req.url);
      if (full.ok) (await caches.open(VERSION)).put(req.url, full.clone());
    } catch (err) { return Response.error(); }
  }
  if (!full || !full.ok) return full || Response.error();
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  const size = buf.byteLength;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (start >= size) start = 0;
  if (end >= size) end = size - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": full.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes"
    }
  });
}
