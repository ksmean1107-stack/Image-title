// ImageRename Service Worker
// /sw-download/:id/:filename 요청을 가로채서
// 페이지에서 blob을 받아 Content-Disposition 헤더와 함께 응답

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (!url.pathname.startsWith('/sw-download/')) return;

  // 경로: /sw-download/:id/:filename
  const parts = url.pathname.split('/');
  const id = parts[2];
  const filename = decodeURIComponent(parts[3] || 'download');

  e.respondWith(new Promise(async resolve => {
    // 페이지 클라이언트에 blob 요청
    const clients = await self.clients.matchAll({ type: 'window' });
    if (!clients.length) {
      resolve(new Response('No client', { status: 500 }));
      return;
    }

    // 메시지 수신 대기
    const onMessage = e => {
      if (e.data && e.data.type === 'SW_BLOB_RESPONSE' && e.data.id === id) {
        self.removeEventListener('message', onMessage);
        const { buffer, mime, filename: fname } = e.data;
        resolve(new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': mime || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
            'Content-Length': buffer.byteLength,
          }
        }));
      }
    };
    self.addEventListener('message', onMessage);

    // 페이지에 blob 요청 전송
    clients[0].postMessage({ type: 'SW_FETCH_BLOB', id });

    // 10초 타임아웃
    setTimeout(() => {
      self.removeEventListener('message', onMessage);
      resolve(new Response('Timeout', { status: 504 }));
    }, 10000);
  }));
});
