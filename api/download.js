// Vercel Serverless Function
// POST /api/download
// body: multipart/form-data { file: <binary>, filename: <string> }

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Method Not Allowed');
    return;
  }

  try {
    const formData = await parseMultipart(req);
    const file = formData.file;
    const filename = formData.filename || 'download';

    if (!file) { res.status(400).end('No file'); return; }

    const encoded = encodeURIComponent(filename);

    res.setHeader('Content-Type', file.type || 'application/octet-stream');
    res.setHeader('Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`);
    res.setHeader('Content-Length', file.data.length);
    res.setHeader('Access-Control-Allow-Origin', '*');
    // 캐시 완전 비활성화
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).end(file.data);
  } catch (e) {
    console.error(e);
    res.status(500).end('Server Error');
  }
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
  let start = 0;
  let idx;
  while ((idx = buf.indexOf(delimiter, start)) !== -1) {
    parts.push(buf.slice(start, idx));
    start = idx + delimiter.length;
  }
  parts.push(buf.slice(start));
  return parts.slice(1).filter(p => p.length > 4);
}
