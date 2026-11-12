// Service worker: guarda os arquivos do app para funcionar sem internet.
const VERSAO = 'campo-v1';
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'parametros-pda.json', 'css/app.css',
  'icones/logo.png', 'icones/icone-192.png', 'icones/icone-512.png',
  'js/main.js', 'js/ui.js', 'js/db.js', 'js/rotas.js', 'js/regras.js', 'js/fichas.js', 'js/componentes.js', 'js/talhoes.js',
  'js/telas/inicio.js', 'js/telas/ficha.js', 'js/telas/parametros.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Parâmetros do PDA: tenta a rede primeiro para pegar a versão mais nova.
  if (e.request.url.endsWith('parametros-pda.json')) {
    e.respondWith(
      fetch(e.request)
        .then((r) => { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); return r; })
        .catch(() => caches.match(e.request, { ignoreSearch: true })),
    );
    return;
  }
  // Talhões do WebGIS: o app guarda uma cópia própria no IndexedDB; aqui só passa adiante.
  if (!new URL(e.request.url).pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? fetch(e.request)));
});
