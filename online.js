/**
 * Oẳn Tù Tì v2 (OTTv2) - Multiplayer Online Manager
 * Hỗ trợ đa kết nối: Socket.IO Server hoặc WebRTC PeerJS (P2P Serverless)
 */

class OnlineManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.peer = null;
    this.conn = null;
    this.myRole = null; // 1 (P1) | 2 (P2) | 'spectator'
    this.roomCode = null;
    this.isHost = false;

    this.initUI();
    this.tryInitSocketServer();
  }

  initUI() {
    const tabCreate = document.getElementById('tabCreateRoom');
    const tabJoin = document.getElementById('tabJoinRoom');
    const createContent = document.getElementById('createRoomContent');
    const joinContent = document.getElementById('joinRoomContent');
    const modal = document.getElementById('onlineModal');
    const btnClose = document.getElementById('btnCloseOnline');

    if (tabCreate && tabJoin) {
      tabCreate.addEventListener('click', () => {
        tabCreate.classList.add('active');
        tabJoin.classList.remove('active');
        createContent.style.display = 'block';
        joinContent.style.display = 'none';
      });

      tabJoin.addEventListener('click', () => {
        tabJoin.classList.add('active');
        tabCreate.classList.remove('active');
        joinContent.style.display = 'block';
        createContent.style.display = 'none';
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => modal.classList.remove('show'));
    }

    // Nút tạo phòng
    const btnDoCreate = document.getElementById('btnDoCreateRoom');
    if (btnDoCreate) {
      btnDoCreate.addEventListener('click', () => this.createRoom());
    }

    // Nút tham gia phòng
    const btnDoJoin = document.getElementById('btnDoJoinRoom');
    if (btnDoJoin) {
      btnDoJoin.addEventListener('click', () => {
        const code = document.getElementById('inputJoinCode').value.trim();
        if (code) {
          this.joinRoom(code);
        } else {
          alert('Vui lòng nhập mã phòng!');
        }
      });
    }

    // Nút copy mã phòng
    const btnCopy = document.getElementById('btnCopyCode');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const input = document.getElementById('createdRoomCode');
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
          btnCopy.textContent = 'Đã chép! ✅';
          setTimeout(() => btnCopy.textContent = 'Sao chép', 2000);
        });
      });
    }

    // Đăng ký callback nước đi từ game
    this.game.onMoveCallback = (moveData) => {
      this.sendMove(moveData);
    };
  }

  /**
   * Thử kết nối tới Socket.IO Server nếu có server đang chạy
   */
  tryInitSocketServer() {
    if (typeof io !== 'undefined') {
      try {
        this.socket = io(window.location.origin, {
          autoConnect: false,
          reconnectionAttempts: 2,
          timeout: 3000
        });

        this.socket.on('connect', () => {
          console.log('[Socket.IO] Đã kết nối tới Game Server');
        });

        this.socket.on('room_created', (data) => {
          this.handleRoomCreated(data.roomId, 1);
        });

        this.socket.on('player_joined', (data) => {
          this.handlePlayerJoined(data);
        });

        this.socket.on('move_made', (moveData) => {
          this.handleRemoteMove(moveData);
        });

        this.socket.on('opponent_left', () => {
          alert('Đối thủ đã rời khỏi phòng!');
          this.game.updateStatusSummary('⚠️ Đối thủ đã rời phòng.');
        });
      } catch (err) {
        console.warn('[Socket.IO] Chưa mở server Socket.IO, sẽ dự phòng dùng WebRTC PeerJS');
      }
    }
  }

  /**
   * Tạo phòng chơi mới
   */
  createRoom() {
    const roomCode = 'ott-' + Math.floor(1000 + Math.random() * 9000);
    this.roomCode = roomCode;
    this.isHost = true;
    this.myRole = 1; // Host là Player 1 (Xanh)

    const shareBox = document.getElementById('roomShareBox');
    const inputCode = document.getElementById('createdRoomCode');
    const statusBox = document.getElementById('createStatus');
    const btnDoCreate = document.getElementById('btnDoCreateRoom');

    shareBox.style.display = 'block';
    inputCode.value = roomCode;
    btnDoCreate.disabled = true;
    btnDoCreate.textContent = 'Phòng đã sẵn sàng';

    statusBox.textContent = '⏳ Đang chờ người chơi thứ 2 tham gia...';

    // Thử dùng Socket.IO server trước
    if (this.socket && this.socket.connected) {
      this.socket.emit('create_room', { roomId: roomCode });
      return;
    }

    // Dự phòng không cần server: Dùng PeerJS WebRTC P2P
    this.initPeerHost(roomCode, statusBox);
  }

  initPeerHost(roomCode, statusBox) {
    if (typeof Peer === 'undefined') {
      statusBox.textContent = '❌ Không tìm thấy thư viện kết nối mạng.';
      return;
    }

    try {
      this.peer = new Peer(roomCode);
      this.peer.on('open', (id) => {
        statusBox.textContent = `⏳ Đã tạo phòng [${id}]. Đang chờ đối thủ...`;
      });

      this.peer.on('connection', (conn) => {
        this.conn = conn;
        statusBox.textContent = '✅ Đối thủ đã vào phòng! Trận đấu bắt đầu!';

        this.setupConnectionHandlers();

        // Gửi thông báo bắt đầu trận đấu
        setTimeout(() => {
          this.conn.send({ type: 'start', role: 2 });
          document.getElementById('onlineModal').classList.remove('show');
          this.game.restart();
          this.game.updateStatusSummary('🌐 Chế độ Online: Bạn là Người chơi 1 (Xanh). Lượt của bạn!');
          this.lockBoardForRole();
        }, 800);
      });

      this.peer.on('error', (err) => {
        console.warn('Peer error:', err);
        statusBox.textContent = `Lỗi mạng: ${err.type || 'Thử lại'}`;
      });
    } catch (e) {
      console.error(e);
      statusBox.textContent = 'Không thể khởi tạo P2P.';
    }
  }

  /**
   * Tham gia vào phòng đã có
   */
  joinRoom(roomCode) {
    this.roomCode = roomCode;
    this.isHost = false;
    this.myRole = 2; // Khách là Player 2 (Đỏ)

    const statusBox = document.getElementById('joinStatus');
    statusBox.textContent = `⏳ Đang kết nối tới phòng ${roomCode}...`;

    if (this.socket && this.socket.connected) {
      this.socket.emit('join_room', { roomId: roomCode });
      return;
    }

    // Dùng WebRTC PeerJS
    if (typeof Peer === 'undefined') {
      statusBox.textContent = '❌ Không tải được thư viện mạng.';
      return;
    }

    const guestId = 'guest-' + Math.floor(Math.random() * 10000);
    this.peer = new Peer(guestId);

    this.peer.on('open', () => {
      this.conn = this.peer.connect(roomCode);
      this.setupConnectionHandlers();

      this.conn.on('open', () => {
        statusBox.textContent = '✅ Đã kết nối thành công!';
        setTimeout(() => {
          document.getElementById('onlineModal').classList.remove('show');
          this.game.restart();
          this.game.updateStatusSummary('🌐 Chế độ Online: Bạn là Người chơi 2 (Đỏ). Đang đợi P1 đi...');
          this.lockBoardForRole();
        }, 800);
      });
    });

    this.peer.on('error', (err) => {
      statusBox.textContent = `❌ Lỗi kết nối: ${err.message || 'Không tìm thấy phòng'}`;
    });
  }

  setupConnectionHandlers() {
    if (!this.conn) return;

    this.conn.on('data', (data) => {
      if (data.type === 'move') {
        this.game.executeMove(data.fromCol, data.fromRow, data.toCol, data.toRow, true);
        this.lockBoardForRole();
      } else if (data.type === 'start') {
        this.game.restart();
        this.lockBoardForRole();
      }
    });

    this.conn.on('close', () => {
      alert('Đối thủ đã ngắt kết nối!');
      this.game.updateStatusSummary('⚠️ Đối thủ đã rời phòng.');
    });
  }

  sendMove(moveData) {
    if (this.conn && this.conn.open) {
      this.conn.send({
        type: 'move',
        ...moveData
      });
      this.lockBoardForRole();
    } else if (this.socket && this.socket.connected) {
      this.socket.emit('make_move', {
        roomId: this.roomCode,
        moveData
      });
      this.lockBoardForRole();
    }
  }

  handleRemoteMove(moveData) {
    this.game.executeMove(moveData.fromCol, moveData.fromRow, moveData.toCol, moveData.toRow, true);
    this.lockBoardForRole();
  }

  /**
   * Khóa không cho người chơi click quân cờ khi chưa đến lượt mình trong chế độ Online
   */
  lockBoardForRole() {
    if (this.game.mode !== 'online') return;

    // Ghi đè hoặc kiểm tra lượt
    const originalHandleClick = this.game.handleCellClick.bind(this.game);
    this.game.handleCellClick = (col, row) => {
      if (this.game.gameOver) return;

      // Chỉ cho phép click nếu đúng lượt của mình
      if (this.game.currentTurn !== this.myRole) {
        this.game.updateStatusSummary(`⏳ Đang đợi ${this.game.getTurnName(this.game.currentTurn)} đi nước cờ...`);
        return;
      }

      originalHandleClick(col, row);
    };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Khi game đã sẵn sàng, gán online manager
  setTimeout(() => {
    if (window.ottGame) {
      window.ottOnline = new OnlineManager(window.ottGame);
    }
  }, 100);
});
