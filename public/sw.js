/* 2 on Streaming 4.0 — network-first shell with safe offline fallback. */
const VERSION='2os-4.0';
const SHELL=['/','/manifest.json','/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(fetch(event.request).then(res=>{const copy=res.clone();caches.open(VERSION).then(c=>c.put(event.request,copy)).catch(()=>{});return res}).catch(()=>caches.match(event.request).then(r=>r||caches.match('/'))))});
