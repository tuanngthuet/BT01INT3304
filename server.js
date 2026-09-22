/**
 * Máy chủ Game OTTv2 (Oẳn Tù Tì v2)
 * Sử dụng Express & Socket.IO hỗ trợ nhiều phòng đấu cùng lúc (Bài tập 2)
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Phục vụ các file tĩnh HTML/CSS/JS trong thư mục hiện tại
app.use(express.static(__dirname));

// Route chính cho Bài 1 & Bài 2
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/playfull', (req, res) => {
  res.sendFile(path.join(__dirname, 'playfull.html'));
});

// Quản lý các phòng chơi đang hoạt động
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[+] Người dùng kết nối: ${socket.id}`);

  // 1. Tạo phòng mới
  socket.on('create_room', ({ roomId }) => {
    socket.join(roomId);
    rooms.set(roomId, {
      id: roomId,
      host: socket.id,
      guest: null,
      spectators: []
    });
    console.log(`[Phòng] Đã tạo phòng ${roomId} bởi ${socket.id}`);
    socket.emit('room_created', { roomId, role: 1 });
  });

  // 2. Tham gia phòng
  socket.on('join_room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error_message', { message: 'Phòng không tồn tại!' });
      return;
    }

    socket.join(roomId);

    if (!room.guest) {
      room.guest = socket.id;
      console.log(`[Phòng] ${socket.id} đã vào phòng ${roomId} với tư cách Player 2`);
      socket.emit('player_joined', { roomId, role: 2 });
      io.to(room.host).emit('opponent_joined', { opponentId: socket.id });
    } else {
      room.spectators.push(socket.id);
      console.log(`[Phòng] ${socket.id} vào phòng ${roomId} với tư cách Người xem (Spectator)`);
      socket.emit('player_joined', { roomId, role: 'spectator' });
    }
  });

  // 3. Đồng bộ nước đi
  socket.on('make_move', ({ roomId, moveData }) => {
    // Phát nước đi cho đối thủ và những người đang xem trong cùng phòng
    socket.to(roomId).emit('move_made', moveData);
  });

  // 4. Chat trong phòng
  socket.on('chat_message', ({ roomId, message, sender }) => {
    io.to(roomId).emit('chat_broadcast', { message, sender, time: new Date().toLocaleTimeString() });
  });

  // 5. Ngắt kết nối
  socket.on('disconnect', () => {
    console.log(`[-] Người dùng ngắt kết nối: ${socket.id}`);
    rooms.forEach((room, roomId) => {
      if (room.host === socket.id || room.guest === socket.id) {
        socket.to(roomId).emit('opponent_left');
        rooms.delete(roomId);
        console.log(`[Phòng] Phòng ${roomId} đã đóng do người chơi thoát.`);
      } else {
        room.spectators = room.spectators.filter(id => id !== socket.id);
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Game Server OTTv2 đang chạy tại http://localhost:${PORT}`);
  console.log(`🎮 Bài 1 (Offline / P2P): http://localhost:${PORT}`);
  console.log(`🌐 Bài 2 (Playfull Server Hub): http://localhost:${PORT}/playfull`);
  console.log(`====================================================`);
});
