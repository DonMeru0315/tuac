// キャッシュ名（更新するときはこのバージョン番号を変える）
const CACHE_NAME = 'club-auto-log-v1';

// キャッシュするファイル一覧
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './app.js',
  './auth.js',
  './firebase-init.js',
  './vehicle.js',
  './info.js',
  './practice.js',
  './attendance.js',
  './tools.js',
  './icon-192.png',
  './icon-512.png'
];

// インストール処理
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching all assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// リクエスト処理（キャッシュがあればそこから返し、なければ通信する）
self.addEventListener('fetch', (event) => {
  // FirestoreやCloudinaryへのリクエストはキャッシュしない（常に最新を取得）
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('api.cloudinary.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュが見つかればそれを返す
        if (response) {
          return response;
        }
        // なければネットワークに取りに行く
        return fetch(event.request);
      })
  );
});

// 更新処理（古いキャッシュを削除）
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
});