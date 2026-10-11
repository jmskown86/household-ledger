/**
 * 가계부 서비스 워커
 * - 앱 셸(index.html, manifest, 아이콘)을 캐시해 오프라인에서도 열리게 합니다.
 * - Chart.js CDN은 런타임 캐시합니다.
 * - 거래 전송 큐는 페이지(index.html)의 localStorage에 있으며,
 *   온라인 복귀 시 페이지가 'sync' 메시지를 보내 재전송합니다.
 */

const CACHE_NAME = 'household-ledger-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Apps Script 요청은 캐시하지 않고 항상 네트워크로 전달
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('script.googleusercontent.com')) {
    return;
  }

  // Chart.js 등 CDN: 캐시 우선, 없으면 네트워크 후 저장
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
    return;
  }

  // 앱 셸: 네트워크 우선, 실패 시 캐시 (최신 코드 반영 + 오프라인 대응)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
  }
});

// 페이지에서 온라인 복귀 시 보내는 동기화 신호 (큐 전송은 페이지 로직이 수행)
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
