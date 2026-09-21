/**
 * OTTv2 - Static file server (Vercel-compatible)
 * Chỉ phục vụ file tĩnh. Đồng bộ multiplayer do playhtml (PartyKit) xử lý.
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Phục vụ file tĩnh HTML/CSS/JS
app.use(express.static(__dirname));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/playfull', (_req, res) => {
  res.sendFile(path.join(__dirname, 'playfull.html'));
});

// Chỉ khởi server khi chạy local (không chạy khi Vercel import file này)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 OTTv2 đang chạy tại http://localhost:${PORT}`);
    console.log(`🎮 Offline / AI:  http://localhost:${PORT}`);
    console.log(`🌐 Online Lobby:  http://localhost:${PORT}/playfull`);
    console.log(`====================================================`);
  });
}

module.exports = app;
