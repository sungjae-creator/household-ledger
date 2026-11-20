// 최소한의 PWA 서비스 워커 (크롬 및 모바일 브라우저의 정식 WebAPK 앱 설치 요건 충족)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // 네트워크 우선 기본 패스스루 처리
  event.respondWith(fetch(event.request));
});
