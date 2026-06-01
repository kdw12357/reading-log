'use strict';

// ─────────────────────────────────────────────────────────────
//  캐시 버전을 바꾸면 activate 시 이전 캐시가 자동 삭제됩니다.
//  앱 파일을 수정한 경우 CACHE_NAME을 v2, v3 ... 으로 올려주세요.
// ─────────────────────────────────────────────────────────────
const CACHE_NAME = 'reading-log-v14';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
];

// ── install: 핵심 파일 사전 캐시 ─────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // 새 SW가 즉시 활성화되도록 대기 건너뜀
  self.skipWaiting();
});

// ── activate: 구버전 캐시 삭제 ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // 페이지 새로고침 없이 SW가 즉시 제어권 획득
  self.clients.claim();
});

// ── fetch: cache-first 전략 ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  // GET 요청만 처리 (POST 등은 그냥 통과)
  if (event.request.method !== 'GET') return;

  // 다른 오리진 요청(교보문고 검색 등)은 그냥 통과
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // 캐시 미스 → 네트워크 요청 후 캐시에 저장
      return fetch(event.request)
        .then((response) => {
          if (
            !response ||
            response.status !== 200 ||
            response.type !== 'basic'
          ) {
            return response;
          }
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, cloned)
          );
          return response;
        })
        .catch(() => {
          // 완전 오프라인 상태: index.html 폴백
          return caches.match('./index.html');
        });
    })
  );
});
