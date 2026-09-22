/**
 * Máy chủ Tĩnh Game OTTv2 (Oẳn Tù Tì v2)
 * Toàn bộ tính năng nhiều người chơi đã được thay thế sang playhtml (serverless client-side).
 * File server.js phục vụ các file tĩnh (HTML, CSS, JS) khi chạy local bằng Node.js.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let reqUrl = req.url.split('?')[0];
  if (reqUrl === '/') reqUrl = '/index.html';
  if (reqUrl === '/playfull') reqUrl = '/playfull.html';

  const filePath = path.join(__dirname, reqUrl);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('500 Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 Game OTTv2 Static Server đang chạy tại http://localhost:${PORT}`);
  console.log(`🎮 Bản chính: http://localhost:${PORT}`);
  console.log(`🌐 Bản Hub playfull: http://localhost:${PORT}/playfull`);
  console.log(`⚡ Chế độ Online đồng bộ tự động qua playhtml (PartyKit & Yjs)`);
  console.log('====================================================');
});
