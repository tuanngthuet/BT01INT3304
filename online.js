/**
 * Oẳn Tù Tì v2 (OTTv2) - Multiplayer Online Manager
 * Sử dụng thư viện playhtml (https://playhtml.fun)
 * - Lobby chung: danh sách phòng mở, ai cũng có thể xem và vào
 * - Mỗi phòng có kênh riêng đồng bộ trạng thái (host/guest/started)
 * - Nước đi & chat dùng dispatchPlayEvent (fire-and-forget, realtime)
 */

class OnlineManager {
  constructor(game) {
    this.game = game;
    this.myRole = null;      // 1 (P1/Xanh) | 2 (P2/Đỏ)
    this.roomCode = null;
    this.isHost = false;
    this.myName = 'Người chơi ' + Math.floor(1000 + Math.random() * 9000);

    // playhtml channels
    this._lobbyChannel = null;   // danh sách phòng mở
    this._roomChannel  = null;   // trạng thái phòng hiện tại
    this._playhtmlReady = false;

    this._initPlayhtml();
    this.initUI();
  }

  // ─── Khởi tạo playhtml ───────────────────────────────────────────────────

  _initPlayhtml() {
    if (typeof window.playhtml !== 'undefined') {
      this._setupPlayhtml();
    } else {
      window.addEventListener('playhtml-ready', () => this._setupPlayhtml(), { once: true });
    }
  }

  _setupPlayhtml() {
    const ph = window.playhtml;
    if (!ph) {
      console.warn('[playhtml] window.playhtml chưa sẵn sàng.');
      return;
    }

    // Khởi tạo playhtml với room mặc định là "ott-lobby"
    // và đăng ký các event handler realtime
    ph.init({
      room: 'ott-lobby',
      events: {
        ott_move: {
          type: 'ott_move',
          onEvent: (payload) => this._onRemoteMove(payload),
        },
        ott_start: {
          type: 'ott_start',
          onEvent: (payload) => this._onRemoteStart(payload),
        },
        ott_chat: {
          type: 'ott_chat',
          onEvent: (payload) => this._onRemoteChat(payload),
        },
        ott_leave: {
          type: 'ott_leave',
          onEvent: (payload) => this._onOpponentLeft(payload),
        },
      },
      onError: () => {
        console.warn('[playhtml] Không kết nối được tới playhtml server.');
        this._setStatus('⚠️ Không kết nối được playhtml. Kiểm tra mạng.', 'error');
      },
    });

    this._playhtmlReady = true;
    console.log('[playhtml] Đã sẵn sàng.');

    // Mở kênh lobby để theo dõi danh sách phòng
    this._lobbyChannel = ph.createPageData('ott-lobby-rooms', { rooms: [] });
    this._lobbyChannel.onUpdate((data) => this._renderLobby(data.rooms));

    // Render lần đầu ngay khi có dữ liệu
    const initial = this._lobbyChannel.getData();
    if (initial) this._renderLobby(initial.rooms);
  }

  // ─── Lobby: danh sách phòng ──────────────────────────────────────────────

  _renderLobby(rooms) {
    const listEl = document.getElementById('lobbyRoomList');
    if (!listEl) return;

    if (!rooms || rooms.length === 0) {
      listEl.innerHTML = '<div class="lobby-empty">Chưa có phòng nào. Hãy tạo phòng mới!</div>';
      return;
    }

    listEl.innerHTML = rooms.map((r) => `
      <div class="lobby-room-item" data-code="${r.roomCode}">
        <div class="lobby-room-info">
          <span class="lobby-room-code">🎮 ${r.roomCode}</span>
          <span class="lobby-room-host">Host: ${r.hostName}</span>
          <span class="lobby-room-status ${r.status === 'waiting' ? 'waiting' : 'full'}">
            ${r.status === 'waiting' ? '⏳ Chờ người chơi' : '🔒 Đã đủ người'}
          </span>
        </div>
        ${r.status === 'waiting'
          ? `<button class="btn-primary btn-join-lobby" onclick="window.ottOnline.joinRoom('${r.roomCode}')">Vào phòng ⚔️</button>`
          : `<button class="btn-secondary" disabled>Đã đủ</button>`
        }
      </div>
    `).join('');
  }

  _addRoomToLobby(roomCode, hostName) {
    if (!this._lobbyChannel) return;
    this._lobbyChannel.setData((draft) => {
      // Tránh trùng
      draft.rooms = draft.rooms.filter(r => r.roomCode !== roomCode);
      draft.rooms.unshift({
        roomCode,
        hostName,
        createdAt: Date.now(),
        status: 'waiting',
      });
      // Giữ tối đa 20 phòng gần nhất
      if (draft.rooms.length > 20) draft.rooms = draft.rooms.slice(0, 20);
    });
  }

  _updateRoomLobbyStatus(roomCode, status) {
    if (!this._lobbyChannel) return;
    this._lobbyChannel.setData((draft) => {
      const room = draft.rooms.find(r => r.roomCode === roomCode);
      if (room) room.status = status;
    });
  }

  _removeRoomFromLobby(roomCode) {
    if (!this._lobbyChannel) return;
    this._lobbyChannel.setData((draft) => {
      draft.rooms = draft.rooms.filter(r => r.roomCode !== roomCode);
    });
  }

  // ─── Xử lý event từ đối thủ ─────────────────────────────────────────────

  _onRemoteMove(payload) {
    if (!payload || payload.roomCode !== this.roomCode) return;
    if (payload.role === this.myRole) return; // bỏ qua nước của mình bị echo

    this.game.executeMove(
      payload.fromCol, payload.fromRow,
      payload.toCol,   payload.toRow,
      true
    );
    this._lockBoardForRole();
  }

  _onRemoteStart(payload) {
    if (!payload || payload.roomCode !== this.roomCode) return;
    if (this.myRole === 2) {
      document.getElementById('onlineModal')?.classList.remove('show');
      this.game.restart();
      this._setStatus('🌐 Chế độ Online: Bạn là Người chơi 2 (Đỏ). Đang đợi P1 đi...');
      this._lockBoardForRole();
    }
  }

  _onRemoteChat(payload) {
    if (!payload || payload.roomCode !== this.roomCode) return;
    this._appendChat(`[${payload.senderName || 'Đối thủ'}]`, payload.text);
  }

  _onOpponentLeft(payload) {
    if (!payload || payload.roomCode !== this.roomCode) return;
    alert('Đối thủ đã ngắt kết nối!');
    this._setStatus('⚠️ Đối thủ đã rời phòng.');
    // Đưa phòng trở lại lobby nếu host vẫn còn
    if (this.isHost && this.roomCode) {
      this._updateRoomLobbyStatus(this.roomCode, 'waiting');
      this._openRoomChannel(this.roomCode); // reset channel phòng
    }
  }

  _onRoomStateUpdate(state) {
    if (!state) return;

    const createStatus = document.getElementById('createStatus');
    const joinStatus   = document.getElementById('joinStatus');

    if (this.isHost) {
      if (state.guestJoined && !state.started) {
        if (createStatus) createStatus.textContent = '✅ Đối thủ đã vào! Bắt đầu trận...';
        this._startGameAsHost();
      }
    } else {
      if (!state.hostJoined) {
        if (joinStatus) joinStatus.textContent = '⚠️ Host chưa sẵn sàng hoặc phòng đã đóng.';
      }
    }
  }

  // ─── Tạo / mở kênh phòng ────────────────────────────────────────────────

  _openRoomChannel(roomCode) {
    const ph = window.playhtml;
    if (!ph) return;

    if (this._roomChannel) {
      this._roomChannel.destroy();
      this._roomChannel = null;
    }

    this._roomChannel = ph.createPageData(`ott-room-${roomCode}`, {
      hostJoined:  false,
      guestJoined: false,
      started:     false,
    });
    this._roomChannel.onUpdate((state) => this._onRoomStateUpdate(state));
  }

  // ─── Giao diện người dùng ────────────────────────────────────────────────

  initUI() {
    const tabCreate    = document.getElementById('tabCreateRoom');
    const tabJoin      = document.getElementById('tabJoinRoom');
    const tabLobby     = document.getElementById('tabLobby');
    const createContent = document.getElementById('createRoomContent');
    const joinContent  = document.getElementById('joinRoomContent');
    const lobbyContent = document.getElementById('lobbyContent');
    const modal        = document.getElementById('onlineModal');
    const btnClose     = document.getElementById('btnCloseOnline');

    // Helper: switch tabs
    const showTab = (active, contentEl) => {
      [tabCreate, tabJoin, tabLobby].forEach(t => t?.classList.remove('active'));
      active?.classList.add('active');
      [createContent, joinContent, lobbyContent].forEach(c => {
        if (c) c.style.display = 'none';
      });
      if (contentEl) contentEl.style.display = 'block';
    };

    tabCreate?.addEventListener('click', () => showTab(tabCreate, createContent));
    tabJoin?.addEventListener('click',   () => showTab(tabJoin, joinContent));
    tabLobby?.addEventListener('click',  () => showTab(tabLobby, lobbyContent));

    btnClose?.addEventListener('click', () => modal?.classList.remove('show'));

    // Tạo phòng
    document.getElementById('btnDoCreateRoom')?.addEventListener('click', () => this.createRoom());

    // Tham gia bằng mã tay
    document.getElementById('btnDoJoinRoom')?.addEventListener('click', () => {
      const code = document.getElementById('inputJoinCode')?.value.trim();
      if (code) this.joinRoom(code);
      else alert('Vui lòng nhập mã phòng!');
    });

    // Copy mã phòng
    document.getElementById('btnCopyCode')?.addEventListener('click', () => {
      const input = document.getElementById('createdRoomCode');
      input?.select();
      navigator.clipboard.writeText(input?.value ?? '').then(() => {
        const btn = document.getElementById('btnCopyCode');
        btn.textContent = 'Đã chép! ✅';
        setTimeout(() => (btn.textContent = 'Sao chép'), 2000);
      });
    });

    // Callback nước đi từ game engine
    this.game.onMoveCallback = (moveData) => this.sendMove(moveData);
  }

  // ─── Tạo phòng (Host = P1 Xanh) ─────────────────────────────────────────

  createRoom() {
    if (!this._playhtmlReady) {
      alert('playhtml chưa sẵn sàng. Thử lại sau giây lát!');
      return;
    }

    const roomCode = 'ott-' + Math.floor(1000 + Math.random() * 9000);
    this.roomCode = roomCode;
    this.isHost   = true;
    this.myRole   = 1;

    // Cập nhật UI modal
    const shareBox    = document.getElementById('roomShareBox');
    const inputCode   = document.getElementById('createdRoomCode');
    const statusBox   = document.getElementById('createStatus');
    const btnDoCreate = document.getElementById('btnDoCreateRoom');

    if (shareBox)    shareBox.style.display = 'block';
    if (inputCode)   inputCode.value = roomCode;
    if (btnDoCreate) { btnDoCreate.disabled = true; btnDoCreate.textContent = 'Phòng đã tạo'; }
    if (statusBox)   statusBox.textContent = `⏳ Phòng [${roomCode}] đã tạo. Đang chờ đối thủ...`;

    // Cập nhật sidebar
    this._updateSidebar(roomCode, '👤 Người chơi 1 (Xanh) — Host');

    // Mở kênh phòng và đánh dấu host đã vào
    this._openRoomChannel(roomCode);
    this._roomChannel.setData((draft) => { draft.hostJoined = true; });

    // Đăng ký phòng vào lobby chung
    this._addRoomToLobby(roomCode, this.myName);
  }

  _startGameAsHost() {
    const ph = window.playhtml;
    if (!ph) return;

    this._roomChannel?.setData((draft) => { draft.started = true; });
    this._updateRoomLobbyStatus(this.roomCode, 'full');

    ph.dispatchPlayEvent({
      type: 'ott_start',
      eventPayload: { roomCode: this.roomCode },
    });

    setTimeout(() => {
      document.getElementById('onlineModal')?.classList.remove('show');
      this.game.restart();
      this._setStatus('🌐 Chế độ Online: Bạn là Người chơi 1 (Xanh). Lượt của bạn!');
      this._lockBoardForRole();
    }, 500);
  }

  // ─── Tham gia phòng (Guest = P2 Đỏ) ─────────────────────────────────────

  joinRoom(roomCode) {
    if (!this._playhtmlReady) {
      alert('playhtml chưa sẵn sàng. Thử lại sau giây lát!');
      return;
    }

    this.roomCode = roomCode;
    this.isHost   = false;
    this.myRole   = 2;

    const statusBox = document.getElementById('joinStatus');
    if (statusBox) statusBox.textContent = `⏳ Đang vào phòng ${roomCode}...`;

    // Mở kênh phòng
    this._openRoomChannel(roomCode);

    // Kiểm tra host đã tạo phòng chưa
    const state = this._roomChannel.getData();
    if (!state || !state.hostJoined) {
      if (statusBox) statusBox.textContent = '⚠️ Không tìm thấy phòng. Kiểm tra lại mã.';
      return;
    }
    if (state.guestJoined || state.started) {
      if (statusBox) statusBox.textContent = '🔒 Phòng này đã đủ người.';
      return;
    }

    // Đăng ký vào phòng
    this._roomChannel.setData((draft) => { draft.guestJoined = true; });

    if (statusBox) statusBox.textContent = '✅ Đã vào phòng! Đang chờ host bắt đầu...';
    this._updateSidebar(roomCode, '👤 Người chơi 2 (Đỏ) — Khách');
  }

  // ─── Gửi nước đi ─────────────────────────────────────────────────────────

  sendMove(moveData) {
    const ph = window.playhtml;
    if (!this._playhtmlReady || !this.roomCode || !ph) return;

    ph.dispatchPlayEvent({
      type: 'ott_move',
      eventPayload: { roomCode: this.roomCode, role: this.myRole, ...moveData },
    });

    this._lockBoardForRole();
  }

  // ─── Chat ────────────────────────────────────────────────────────────────

  sendChat(text) {
    const ph = window.playhtml;
    if (!this._playhtmlReady || !this.roomCode || !text || !ph) return;

    ph.dispatchPlayEvent({
      type: 'ott_chat',
      eventPayload: { roomCode: this.roomCode, senderName: this.myName, text },
    });
  }

  _appendChat(sender, text) {
    const chatList = document.getElementById('chatList');
    if (!chatList) return;
    chatList.querySelector('.empty-history')?.remove();
    const el = document.createElement('div');
    el.className = 'history-entry';
    el.textContent = `${sender}: ${text}`;
    chatList.appendChild(el);
    chatList.scrollTop = chatList.scrollHeight;
  }

  // ─── Khoá bảng khi không phải lượt ──────────────────────────────────────

  _lockBoardForRole() {
    if (this.game.mode !== 'online') return;
    const origClick = this.game.handleCellClick.bind(this.game);
    this.game.handleCellClick = (col, row) => {
      if (this.game.gameOver) return;
      if (this.game.currentTurn !== this.myRole) {
        this._setStatus(`⏳ Đang đợi ${this.game.getTurnName(this.game.currentTurn)} đi...`);
        return;
      }
      origClick(col, row);
    };
  }

  // ─── Rời phòng ───────────────────────────────────────────────────────────

  leaveRoom() {
    const ph = window.playhtml;
    if (this._playhtmlReady && this.roomCode && ph) {
      ph.dispatchPlayEvent({
        type: 'ott_leave',
        eventPayload: { roomCode: this.roomCode },
      });
    }
    if (this.isHost && this.roomCode) {
      this._removeRoomFromLobby(this.roomCode);
    }
    this._roomChannel?.destroy();
    this._roomChannel = null;
    this.roomCode = null;
    this.myRole   = null;
    this.isHost   = false;
  }

  // ─── Helpers UI ──────────────────────────────────────────────────────────

  _setStatus(msg) {
    const el = document.getElementById('gameStatusSummary');
    if (el) el.textContent = msg;
    if (this.game?.updateStatusSummary) this.game.updateStatusSummary(msg);
  }

  _updateSidebar(roomCode, roleText) {
    const roomDisplay = document.getElementById('activeRoomCodeDisplay');
    const roleDisplay = document.getElementById('myRoleDisplay');
    if (roomDisplay) roomDisplay.textContent = roomCode;
    if (roleDisplay) roleDisplay.textContent = roleText;
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.ottGame) {
      window.ottOnline = new OnlineManager(window.ottGame);

      // Chat handler
      const chatInput  = document.getElementById('chatInput');
      const btnSendChat = document.getElementById('btnSendChat');

      if (chatInput && btnSendChat) {
        const send = () => {
          const text = chatInput.value.trim();
          if (!text) return;
          window.ottOnline._appendChat('[Bạn]', text);
          window.ottOnline.sendChat(text);
          chatInput.value = '';
        };
        btnSendChat.addEventListener('click', send);
        chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      }
    }
  }, 150);
});
