/**
 * Oẳn Tù Tì v2 (OTTv2) - Multiplayer Online Manager
 * Tích hợp playhtml (PartyKit & Yjs CRDT) đồng bộ thời gian thực không cần backend
 */

import { playhtml } from "https://unpkg.com/playhtml";

class OnlineManager {
  constructor(game) {
    this.game = game;
    this.myRole = null; // 1 (P1 - Xanh) | 2 (P2 - Đỏ) | 'spectator'
    this.roomCode = null;
    this.isHost = false;
    this.syncHandle = null;
    this.lastProcessedMoveId = null;
    this.lastProcessedResetId = 0;
    this._originalHandleCellClick = null;
    this.playerId = 'user_' + Math.random().toString(36).substring(2, 9);
    this.isConnected = false;

    this.initUI();
    this.checkUrlRoom();
  }

  initUI() {
    const tabCreate = document.getElementById('tabCreateRoom');
    const tabJoin = document.getElementById('tabJoinRoom');
    const createContent = document.getElementById('createRoomContent');
    const joinContent = document.getElementById('joinRoomContent');
    const modal = document.getElementById('onlineModal');
    const btnClose = document.getElementById('btnCloseOnline');

    if (tabCreate && tabJoin && createContent && joinContent) {
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

    if (btnClose && modal) {
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
        const input = document.getElementById('inputJoinCode');
        const code = input ? input.value.trim() : '';
        if (code) {
          this.joinRoom(code);
        } else {
          alert('Vui lòng nhập mã phòng!');
        }
      });
    }

    // Nút copy mã phòng / link
    const btnCopy = document.getElementById('btnCopyCode');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const input = document.getElementById('createdRoomCode');
        if (input) {
          input.select();
          navigator.clipboard.writeText(input.value).then(() => {
            btnCopy.textContent = 'Đã chép! ✅';
            setTimeout(() => btnCopy.textContent = 'Sao chép', 2000);
          });
        }
      });
    }

    // Đăng ký callback khi người chơi thực hiện nước đi
    this.game.onMoveCallback = (moveData) => {
      if (this.game.mode === 'online') {
        this.sendMove(moveData);
      }
    };

    // Đăng ký hook khi bấm Ván mới để đồng bộ sang đối thủ
    const btnRestart = document.getElementById('btnRestart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        if (this.game.mode === 'online' && this.syncHandle) {
          this.broadcastReset();
        }
      });
    }

    const btnPlayAgain = document.getElementById('btnPlayAgain');
    if (btnPlayAgain) {
      btnPlayAgain.addEventListener('click', () => {
        if (this.game.mode === 'online' && this.syncHandle) {
          this.broadcastReset();
        }
      });
    }
  }

  /**
   * Tự động kiểm tra URL nếu có param ?room=xxx thì tham gia ngay
   */
  checkUrlRoom() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      console.log('[playhtml] Tìm thấy tham số phòng trong URL:', roomParam);
      // Tự động kết nối vào phòng từ URL
      setTimeout(() => {
        this.connectToRoom(roomParam.trim(), false);
      }, 200);
    }
  }

  /**
   * Tạo phòng mới (Host = Player 1)
   */
  createRoom() {
    const roomCode = 'ott-' + Math.floor(1000 + Math.random() * 9000);
    this.roomCode = roomCode;
    this.isHost = true;
    this.myRole = 1;

    const shareBox = document.getElementById('roomShareBox');
    const inputCode = document.getElementById('createdRoomCode');
    const statusBox = document.getElementById('createStatus');
    const btnDoCreate = document.getElementById('btnDoCreateRoom');

    if (shareBox) shareBox.style.display = 'block';
    if (inputCode) inputCode.value = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    if (btnDoCreate) {
      btnDoCreate.disabled = true;
      btnDoCreate.textContent = 'Phòng đã tạo thành công';
    }
    if (statusBox) statusBox.textContent = '⏳ Đang khởi tạo kết nối qua playhtml...';

    // Cập nhật URL trình duyệt
    this.updateUrl(roomCode);

    this.connectToRoom(roomCode, true);
  }

  /**
   * Tham gia phòng đã có (Guest = Player 2)
   */
  joinRoom(roomCode) {
    // Làm sạch chuỗi phòng (hỗ trợ nhập cả link hoặc chỉ mã)
    let cleanCode = roomCode.trim();
    if (cleanCode.includes('room=')) {
      cleanCode = cleanCode.split('room=')[1].split('&')[0];
    }
    this.roomCode = cleanCode;
    this.isHost = false;
    this.myRole = 2;

    const statusBox = document.getElementById('joinStatus');
    if (statusBox) statusBox.textContent = `⏳ Đang kết nối vào phòng ${cleanCode}...`;

    this.updateUrl(cleanCode);
    this.connectToRoom(cleanCode, false);
  }

  updateUrl(roomCode) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomCode);
      window.history.pushState({ room: roomCode }, '', url.toString());
    } catch (e) {
      console.warn('Không thể pushState URL:', e);
    }
  }

  /**
   * Khởi tạo kết nối phòng chơi với playhtml
   */
  connectToRoom(roomCode, isCreating = false) {
    this.roomCode = roomCode;

    // Đảm bảo phần tử đồng bộ đã tồn tại trong DOM
    let syncElem = document.getElementById('ottGameSync');
    if (!syncElem) {
      syncElem = document.createElement('div');
      syncElem.id = 'ottGameSync';
      syncElem.setAttribute('can-play', '');
      syncElem.style.display = 'none';
      document.body.appendChild(syncElem);
    }

    try {
      // 1. Đăng ký capability cho phần tử ottGameSync
      this.syncHandle = playhtml.register('ottGameSync', {
        defaultData: {
          p1Id: null,
          p2Id: null,
          lastMove: null,
          resetId: 0,
          chatMessages: []
        },
        updateElement: ({ data, setData }) => {
          this.handleRemoteUpdate(data, setData);
        }
      });

      // 2. Khởi tạo playhtml với phòng đã chỉ định
      playhtml.init({
        room: `ott-room-${roomCode}`,
        cursors: false
      });

      this.isConnected = true;

      // Cập nhật chế độ game sang online
      this.game.mode = 'online';
      document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
      const btnOnline = document.getElementById('btnModeOnline');
      if (btnOnline) btnOnline.classList.add('active');

      // Tắt modal sau khi kết nối thành công
      setTimeout(() => {
        const modal = document.getElementById('onlineModal');
        if (modal) modal.classList.remove('show');
      }, 700);

      this.updateRoomDisplays();
      this.lockBoardForRole();

      console.log(`[playhtml] Kết nối thành công vào phòng [${roomCode}]`);
    } catch (err) {
      console.error('[playhtml] Lỗi khởi tạo kết nối:', err);
      const statusBox = document.getElementById(isCreating ? 'createStatus' : 'joinStatus');
      if (statusBox) statusBox.textContent = '❌ Lỗi kết nối playhtml. Vui lòng thử lại.';
    }
  }

  /**
   * Xử lý khi nhận được dữ liệu đồng bộ mới từ playhtml
   */
  handleRemoteUpdate(data, setData) {
    if (!data) return;

    // 1. Phân chia vai trò người chơi nếu chưa xác định
    if (!this.myRole) {
      if (!data.p1Id || data.p1Id === this.playerId) {
        this.myRole = 1;
        this.isHost = true;
        if (!data.p1Id) {
          setData(draft => { draft.p1Id = this.playerId; });
        }
      } else if (!data.p2Id || data.p2Id === this.playerId) {
        this.myRole = 2;
        this.isHost = false;
        if (!data.p2Id) {
          setData(draft => { draft.p2Id = this.playerId; });
        }
      } else {
        this.myRole = 'spectator';
      }
      this.updateRoomDisplays();
      this.lockBoardForRole();
    } else {
      // Nếu đã có vai trò, cập nhật vào dữ liệu phòng nếu slot còn trống
      if (this.myRole === 1 && !data.p1Id) {
        setData(draft => { draft.p1Id = this.playerId; });
      } else if (this.myRole === 2 && !data.p2Id) {
        setData(draft => { draft.p2Id = this.playerId; });
      }
    }

    // Hiển thị trạng thái đối thủ
    const statusBox = document.getElementById('createStatus');
    if (data.p1Id && data.p2Id) {
      if (statusBox) statusBox.textContent = '✅ Đối thủ đã tham gia phòng! Trận đấu bắt đầu!';
    }

    // 2. Đồng bộ khi có lệnh Ván mới (resetId)
    if (data.resetId && data.resetId !== this.lastProcessedResetId) {
      this.lastProcessedResetId = data.resetId;
      console.log('[playhtml] Đồng bộ ván mới từ phòng...');
      this.game.restart();
      this.lockBoardForRole();
      this.updateStatusForTurn();
    }

    // 3. Đồng bộ nước đi (lastMove)
    if (data.lastMove && data.lastMove.moveId !== this.lastProcessedMoveId) {
      this.lastProcessedMoveId = data.lastMove.moveId;

      // Chỉ thực hiện nước đi nếu nước cờ đó đến từ người chơi khác
      if (data.lastMove.player !== this.myRole) {
        console.log('[playhtml] Nhận nước đi từ đối thủ:', data.lastMove);
        const { fromCol, fromRow, toCol, toRow } = data.lastMove;
        this.game.executeMove(fromCol, fromRow, toCol, toRow, true);
        this.lockBoardForRole();
      }
    }

    // 4. Đồng bộ tin nhắn chat (cho playfull.html)
    if (data.chatMessages && Array.isArray(data.chatMessages)) {
      this.renderChatMessages(data.chatMessages);
    }
  }

  /**
   * Gửi nước đi lên phòng playhtml
   */
  sendMove(moveData) {
    if (!this.syncHandle || !this.isConnected) return;

    const movePayload = {
      fromCol: moveData.fromCol,
      fromRow: moveData.fromRow,
      toCol: moveData.toCol,
      toRow: moveData.toRow,
      player: this.myRole,
      moveId: `${this.playerId}_${Date.now()}_${Math.random()}`
    };

    this.lastProcessedMoveId = movePayload.moveId;

    try {
      this.syncHandle.setData(draft => {
        draft.lastMove = movePayload;
      });
      this.lockBoardForRole();
    } catch (e) {
      console.error('[playhtml] Lỗi gửi nước đi:', e);
    }
  }

  /**
   * Phát lệnh ván mới cho toàn phòng
   */
  broadcastReset() {
    if (!this.syncHandle) return;
    const newResetId = Date.now();
    this.lastProcessedResetId = newResetId;
    try {
      this.syncHandle.setData(draft => {
        draft.resetId = newResetId;
        draft.lastMove = null;
      });
    } catch (e) {
      console.error('[playhtml] Lỗi gửi lệnh ván mới:', e);
    }
  }

  /**
   * Khóa / mở click bàn cờ đúng theo vai trò của người chơi
   */
  lockBoardForRole() {
    if (this.game.mode !== 'online') return;

    if (!this._originalHandleCellClick) {
      this._originalHandleCellClick = this.game.handleCellClick.bind(this.game);
    }

    this.game.handleCellClick = (col, row) => {
      if (this.game.gameOver) return;

      // Khán giả không được di chuyển
      if (this.myRole === 'spectator') {
        this.game.updateStatusSummary('👁️ Bạn đang ở chế độ Người xem (Spectator).');
        return;
      }

      // Chỉ cho phép đi khi đúng lượt
      if (this.game.currentTurn !== this.myRole) {
        this.game.updateStatusSummary(`⏳ Đang đợi ${this.game.getTurnName(this.game.currentTurn)} đi nước cờ...`);
        return;
      }

      this._originalHandleCellClick(col, row);
    };

    this.updateStatusForTurn();
  }

  updateStatusForTurn() {
    if (this.game.mode !== 'online') return;

    let roleName = 'Người chơi';
    if (this.myRole === 1) roleName = 'Người chơi 1 (Xanh)';
    else if (this.myRole === 2) roleName = 'Người chơi 2 (Đỏ)';
    else if (this.myRole === 'spectator') roleName = 'Khán giả';

    if (this.game.currentTurn === this.myRole) {
      this.game.updateStatusSummary(`🌐 Chế độ Online: Bạn là ${roleName}. Đến lượt đi của bạn!`);
    } else if (this.myRole === 'spectator') {
      this.game.updateStatusSummary(`🌐 Chế độ Online: Lượt của ${this.game.getTurnName(this.game.currentTurn)}.`);
    } else {
      this.game.updateStatusSummary(`🌐 Chế độ Online: Bạn là ${roleName}. Đang chờ đối thủ...`);
    }
  }

  /**
   * Cập nhật các nhãn trạng thái phòng trên giao diện (hỗ trợ cả index.html và playfull.html)
   */
  updateRoomDisplays() {
    const roomElem = document.getElementById('activeRoomCodeDisplay');
    if (roomElem) roomElem.textContent = this.roomCode || 'Chưa vào phòng';

    const roleElem = document.getElementById('myRoleDisplay');
    if (roleElem) {
      if (this.myRole === 1) roleElem.textContent = 'Người chơi 1 (Xanh)';
      else if (this.myRole === 2) roleElem.textContent = 'Người chơi 2 (Đỏ)';
      else roleElem.textContent = 'Khán giả (Spectator)';
    }

    const p1Name = document.getElementById('p1Name');
    const p2Name = document.getElementById('p2Name');
    if (p1Name && this.myRole === 1) p1Name.textContent = 'Người chơi 1 (Bạn - Xanh)';
    if (p2Name && this.myRole === 2) p2Name.textContent = 'Người chơi 2 (Bạn - Đỏ)';
  }

  /**
   * Hỗ trợ gửi chat (sử dụng trên playfull.html)
   */
  sendChatMessage(text) {
    if (!this.syncHandle || !text.trim()) return;
    const msg = {
      sender: this.myRole === 1 ? 'P1 (Xanh)' : (this.myRole === 2 ? 'P2 (Đỏ)' : 'Khán giả'),
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    try {
      this.syncHandle.setData(draft => {
        if (!draft.chatMessages) draft.chatMessages = [];
        draft.chatMessages.push(msg);
        if (draft.chatMessages.length > 50) draft.chatMessages.shift();
      });
    } catch (e) {
      console.error('Lỗi gửi chat:', e);
    }
  }

  renderChatMessages(messages) {
    const chatList = document.getElementById('chatList');
    if (!chatList) return;

    chatList.innerHTML = '';
    messages.forEach(msg => {
      const entry = document.createElement('div');
      entry.className = 'history-entry';
      entry.innerHTML = `<strong>[${msg.sender}]:</strong> ${msg.text} <span style="font-size:0.75rem; opacity:0.6;">${msg.time}</span>`;
      chatList.appendChild(entry);
    });
    chatList.scrollTop = chatList.scrollHeight;
  }
}

// Khởi tạo Online Manager sau khi Game Engine sẵn sàng
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.ottGame) {
      window.ottOnline = new OnlineManager(window.ottGame);
    }
  }, 100);
});

export { OnlineManager };
