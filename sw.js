const CACHE_NAME = 'club-auto-log';

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
  // FirestoreやCloudinaryへのリクエストはキャッシュしない
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('api.cloudinary.com')) {
    return;
  }

  event.respondWith(
    // サーバーに最新ファイルを取りに行く
    fetch(event.request)
      .then((networkResponse) => {
        // 最新ファイルをキャッシュに上書き保存しつつ、画面に返す
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // 圏外やオフラインなどで通信失敗した場合は、保存済みのキャッシュを返す
        console.log('[Service Worker] Offline mode, using cache for:', event.request.url);
        return caches.match(event.request);
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
