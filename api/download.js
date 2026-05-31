// POST /api/download  → blob을 Vercel Blob에 임시 저장 후 URL 반환
// GET  /api/download?id=xxx&filename=리나_01.png → 해당 blob을 Content-Disposition과 함께 응답

import { put, get, del } from '@vercel/blob';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // ── POST: blob 저장 → 다운로드 URL 반환 ──
  if (req.method === 'POST') {
    try {
      const formData = await parseMultipart(req);
      const file = formData.file;
      const filename = formData.filename || 'download';
      if (!file) { res.status(400).json({ error: 'No file' }); return; }

      // 파일명을 경로에 포함시켜 저장 → URL에 파일명이 들어감
      const safeName = filename.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
      const blobPath = `tmp/${Date.now()}_${safeName}`;

      const { url } = await put(blobPath, file.data, {
        access: 'public',
        contentType: file.type || 'application/octet-stream',
        addRandomSuffix: false,
      });

      // 5분 후 자동 삭제 (백그라운드)
      setTimeout(async () => {
        try { await del(url); } catch {}
      }, 5 * 60 * 1000);

      res.status(200).json({ url, filename });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).end('Method Not Allowed');
}

async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)$/);
        if (!boundaryMatch) return reject(new Error('No boundary'));
        const boundary = '--' + boundaryMatch[1];
        const parts = splitBuffer(body, Buffer.from('\r\n' + boundary));
        const result = {};
        for (const part of parts) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;
          const headerStr = part.slice(0, headerEnd).toString();
          const data = part.slice(headerEnd + 4);
          const nameMatch = headerStr.match(/name="([^"]+)"/);
          const filenameMatch = headerStr.match(/filename="([^"]+)"/);
          const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
          if (!nameMatch) continue;
          const name = nameMatch[1];
          if (filenameMatch) {
            result[name] = {
              filename: filenameMatch[1],
              type: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
              data: data.slice(-2).toString() === '\r\n' ? data.slice(0, -2) : data
            };
          } else {
            result[name] = data.toString().replace(/\r\n$/, '');
          }
        }
        resolve(result);
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function splitBuffer(buf, delimiter) {
  const parts = [];
  let start = 0, idx;
  while ((idx = buf.indexOf(delimiter, start)) !== -1) {
    parts.push(buf.slice(start, idx));
    start = idx + delimiter.length;
  }
  parts.push(buf.slice(start));
  return parts.slice(1).filter(p => p.length > 4);
}
