/**
 * Oẳn Tù Tì v2 (OTTv2) - Game Logic & Board Engine
 * Nhóm tác giả: Đồ án bài tập nhóm môn Phát triển Ứng dụng Web
 */

// Định nghĩa các loại quân
const PIECE_TYPES = {
  ROCK: { id: 'ROCK', name: 'Đấm', icon: '✊', beats: 'SCISSORS' },
  PAPER: { id: 'PAPER', name: 'Lá', icon: '✋', beats: 'ROCK' },
  SCISSORS: { id: 'SCISSORS', name: 'Kéo', icon: '✌️', beats: 'PAPER' }
};

const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// 8 hướng di chuyển như quân Vua trong cờ vua
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

class SoundController {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playMove() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(480, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playCapture() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.18);
  }

  playVictory() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const notes = [440, 554, 659, 880];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const startTime = this.ctx.currentTime + idx * 0.12;
      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  }
}

class OTTGame {
  constructor() {
    this.board = Array(9).fill(null).map(() => Array(9).fill(null));
    this.currentTurn = 1; // 1: Player 1 (Blue), 2: Player 2 (Red)
    this.selectedCell = null; // { col, row }
    this.validMoves = []; // Array of { col, row, isCapture }
    this.history = [];
    this.gameOver = false;
    this.mode = 'local'; // 'local' | 'ai' | 'online'
    this.sounds = new SoundController();
    this.timerSeconds = 30;
    this.timerInterval = null;
    this.lastMove = null; // { from: {col, row}, to: {col, row} }

    // Callback khi chơi online
    this.onMoveCallback = null;

    this.initBoard();
    this.bindEvents();
    this.render();
    this.startTimer();
  }

  /**
   * Khởi tạo quân cờ ban đầu trên bàn cờ 9x9:
   * Hàng 2 (row index 1): 9 quân của Người chơi 1 (3 Đấm, 3 Lá, 3 Kéo xen kẽ đối xứng)
   * Hàng 8 (row index 7): 9 quân của Người chơi 2 (3 Đấm, 3 Lá, 3 Kéo)
   * Ô a1 (0, 0): Căn cứ mục tiêu của P1 (đối thủ P2 cần xâm nhập để thắng)
   * Ô i9 (8, 8): Căn cứ mục tiêu của P2 (đối thủ P1 cần xâm nhập để thắng)
   */
  initBoard() {
    this.board = Array(9).fill(null).map(() => Array(9).fill(null));
    this.currentTurn = 1;
    this.selectedCell = null;
    this.validMoves = [];
    this.history = [];
    this.gameOver = false;
    this.lastMove = null;

    const p1Pattern = [
      'ROCK', 'PAPER', 'SCISSORS',
      'ROCK', 'PAPER', 'SCISSORS',
      'ROCK', 'PAPER', 'SCISSORS'
    ];

    const p2Pattern = [
      'SCISSORS', 'PAPER', 'ROCK',
      'SCISSORS', 'PAPER', 'ROCK',
      'SCISSORS', 'PAPER', 'ROCK'
    ];

    // Xếp quân Player 1 ở hàng 2 (index 1)
    for (let c = 0; c < 9; c++) {
      this.board[1][c] = {
        player: 1,
        type: p1Pattern[c]
      };
    }

    // Xếp quân Player 2 ở hàng 8 (index 7)
    for (let c = 0; c < 9; c++) {
      this.board[7][c] = {
        player: 2,
        type: p2Pattern[c]
      };
    }
  }

  bindEvents() {
    // Nút chế độ chơi
    document.getElementById('btnModeLocal').addEventListener('click', () => this.setMode('local'));
    document.getElementById('btnModeAI').addEventListener('click', () => this.setMode('ai'));
    document.getElementById('btnModeOnline').addEventListener('click', () => this.setMode('online'));

    // Tiện ích
    document.getElementById('btnRestart').addEventListener('click', () => this.restart());
    document.getElementById('btnUndo').addEventListener('click', () => this.undo());
    document.getElementById('btnPlayAgain').addEventListener('click', () => {
      document.getElementById('victoryModal').classList.remove('show');
      this.restart();
    });

    const soundBtn = document.getElementById('btnSoundToggle');
    soundBtn.addEventListener('click', () => {
      const state = this.sounds.toggle();
      soundBtn.textContent = state ? '🔊' : '🔇';
    });

    // Modal luật chơi
    const rulesModal = document.getElementById('rulesModal');
    document.getElementById('btnRules').addEventListener('click', () => rulesModal.classList.add('show'));
    document.getElementById('btnCloseRules').addEventListener('click', () => rulesModal.classList.remove('show'));
    document.getElementById('btnUnderstand').addEventListener('click', () => rulesModal.classList.remove('show'));
  }

  setMode(newMode) {
    if (newMode === 'online') {
      document.getElementById('onlineModal').classList.add('show');
    }
    this.mode = newMode;
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    if (newMode === 'local') document.getElementById('btnModeLocal').classList.add('active');
    if (newMode === 'ai') document.getElementById('btnModeAI').classList.add('active');
    if (newMode === 'online') document.getElementById('btnModeOnline').classList.add('active');
    this.restart();
  }

  restart() {
    clearInterval(this.timerInterval);
    this.initBoard();
    this.render();
    this.startTimer();
    this.updateStatusSummary('Ván đấu mới đã bắt đầu!');
  }

  startTimer() {
    clearInterval(this.timerInterval);
    this.timerSeconds = 30;
    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      if (this.gameOver) {
        clearInterval(this.timerInterval);
        return;
      }
      this.timerSeconds--;
      this.updateTimerDisplay();

      if (this.timerSeconds <= 0) {
        // Hết giờ lượt đi: Chuyển lượt hoặc xử thua
        this.switchTurn(true);
      }
    }, 1000);
  }

  updateTimerDisplay() {
    const timerElem = document.getElementById('turnTimer');
    if (timerElem) {
      timerElem.textContent = `${this.timerSeconds}s`;
      if (this.timerSeconds <= 5) {
        timerElem.style.color = '#ef4444';
      } else {
        timerElem.style.color = '#f0f6fc';
      }
    }
  }

  /**
   * Kiểm tra khả năng ăn quân theo chuẩn luật Oẳn tù tì:
   * - Đấm ăn Kéo
   * - Kéo ăn Lá
   * - Lá ăn Đấm
   * - Cùng loại: đứng chặn đường, KHÔNG ăn được (return false)
   * - Yếu hơn: KHÔNG ăn được (return false)
   */
  canCapture(attackerType, defenderType) {
    if (attackerType === defenderType) return false;
    return PIECE_TYPES[attackerType].beats === defenderType;
  }

  /**
   * Tính các nước đi hợp lệ cho quân ở (col, row):
   * Đi 1 ô theo 8 hướng (như quân Vua trong cờ vua)
   */
  getValidMovesForPiece(col, row) {
    const piece = this.board[row][col];
    if (!piece) return [];

    const moves = [];
    for (const [dc, dr] of DIRECTIONS) {
      const tc = col + dc;
      const tr = row + dr;

      // Nằm trong bàn cờ 9x9
      if (tc >= 0 && tc < 9 && tr >= 0 && tr < 9) {
        const target = this.board[tr][tc];

        if (!target) {
          // Ô trống: Luôn đi được
          moves.push({ col: tc, row: tr, isCapture: false });
        } else if (target.player !== piece.player) {
          // Ô có quân đối phương: Áp dụng luật ăn quân Oẳn tù tì
          if (this.canCapture(piece.type, target.type)) {
            moves.push({ col: tc, row: tr, isCapture: true });
          }
          // Chú ý: Nếu cùng loại quân hoặc yếu hơn -> bị chặn (không thể đi vào)
        }
      }
    }
    return moves;
  }

  /**
   * Xử lý khi người chơi bấm vào 1 ô trên bàn cờ
   */
  handleCellClick(col, row) {
    if (this.gameOver) return;

    // Trong chế độ AI, nếu đang là lượt của máy (Player 2) thì người chơi không thể bấm
    if (this.mode === 'ai' && this.currentTurn === 2) return;

    const clickedPiece = this.board[row][col];

    // Nếu đã chọn 1 quân trước đó và bấm vào ô hợp lệ để di chuyển
    if (this.selectedCell) {
      const isTargetMove = this.validMoves.find(m => m.col === col && m.row === row);
      if (isTargetMove) {
        this.executeMove(this.selectedCell.col, this.selectedCell.row, col, row);
        return;
      }
    }

    // Chọn quân cờ của phe hiện tại
    if (clickedPiece && clickedPiece.player === this.currentTurn) {
      this.selectedCell = { col, row };
      this.validMoves = this.getValidMovesForPiece(col, row);
      this.render();
      return;
    }

    // Bấm ra ngoài ô hợp lệ -> Hủy chọn
    this.selectedCell = null;
    this.validMoves = [];
    this.render();
  }

  /**
   * Thực hiện nước đi từ (fromCol, fromRow) tới (toCol, toRow)
   */
  executeMove(fromCol, fromRow, toCol, toRow, isRemote = false) {
    const piece = this.board[fromRow][fromCol];
    const target = this.board[toRow][toCol];
    if (!piece) return;

    const isCapture = !!target;

    // Lưu lại lịch sử để hỗ trợ Undo
    this.history.push({
      from: { col: fromCol, row: fromRow },
      to: { col: toCol, row: toRow },
      piece: { ...piece },
      captured: target ? { ...target } : null,
      turn: this.currentTurn
    });

    // Cập nhật vị trí trên bàn cờ
    this.board[toRow][toCol] = piece;
    this.board[fromRow][fromCol] = null;
    this.lastMove = { from: { col: fromCol, row: fromRow }, to: { col: toCol, row: toRow } };
    this.selectedCell = null;
    this.validMoves = [];

    // Âm thanh
    if (isCapture) {
      this.sounds.playCapture();
    } else {
      this.sounds.playMove();
    }

    // Ghi log nước đi
    this.logMove(piece, fromCol, fromRow, toCol, toRow, target);

    // Gửi nước đi sang máy khác nếu đang chơi Online
    if (!isRemote && this.onMoveCallback) {
      this.onMoveCallback({ fromCol, fromRow, toCol, toRow });
    }

    // Kiểm tra điều kiện thắng
    const winResult = this.checkWinCondition(toCol, toRow, piece);
    if (winResult.won) {
      this.endGame(winResult.winner, winResult.reason);
      return;
    }

    // Chuyển lượt
    this.switchTurn();

    // Nếu chơi với AI và đến lượt AI
    if (!this.gameOver && this.mode === 'ai' && this.currentTurn === 2) {
      setTimeout(() => this.makeAIMove(), 500);
    }
  }

  switchTurn(isTimeout = false) {
    this.currentTurn = this.currentTurn === 1 ? 2 : 1;
    this.startTimer();
    this.render();

    if (isTimeout) {
      this.updateStatusSummary(`Hết thời gian! Lượt đi chuyển sang ${this.getTurnName(this.currentTurn)}.`);
    } else {
      this.updateStatusSummary(`Lượt của ${this.getTurnName(this.currentTurn)}.`);
    }
  }

  getTurnName(player) {
    return player === 1 ? 'Người chơi 1 (Xanh)' : 'Người chơi 2 (Đỏ)';
  }

  /**
   * KIỂM TRA ĐIỀU KIỆN THẮNG THEO ĐÚNG ĐỀ BÀI:
   * 1. Đưa quân vào ô a1 / i9:
   *    - P1 đưa quân vào ô i9 (Căn cứ P2) -> P1 THẮNG!
   *    - P2 đưa quân vào ô a1 (Căn cứ P1) -> P2 THẮNG!
   * 2. Ăn hết sạch hoàn toàn 1 loại quân của đối phương:
   *    - P2 hết sạch Đấm hoặc Lá hoặc Kéo -> P1 THẮNG!
   *    - P1 hết sạch Đấm hoặc Lá hoặc Kéo -> P2 THẮNG!
   */
  checkWinCondition(toCol, toRow, movedPiece) {
    // 1. Kiểm tra chiếm căn cứ mục tiêu
    // Ô a1 có tọa độ col: 0, row: 0
    // Ô i9 có tọa độ col: 8, row: 8
    if (movedPiece.player === 1 && toCol === 8 && toRow === 8) {
      return {
        won: true,
        winner: 1,
        reason: `Người chơi 1 (Xanh) đã đưa quân ${PIECE_TYPES[movedPiece.type].name} chiếm lĩnh thành công căn cứ i9!`
      };
    }

    if (movedPiece.player === 2 && toCol === 0 && toRow === 0) {
      return {
        won: true,
        winner: 2,
        reason: `Người chơi 2 (Đỏ) đã đưa quân ${PIECE_TYPES[movedPiece.type].name} chiếm lĩnh thành công căn cứ a1!`
      };
    }

    // 2. Đếm số lượng quân của mỗi loại cho 2 người chơi
    const counts = {
      1: { ROCK: 0, PAPER: 0, SCISSORS: 0 },
      2: { ROCK: 0, PAPER: 0, SCISSORS: 0 }
    };

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.board[r][c];
        if (p) {
          counts[p.player][p.type]++;
        }
      }
    }

    // Kiểm tra P2 có bị diệt sạch 1 loại quân nào không
    for (const [type, count] of Object.entries(counts[2])) {
      if (count === 0) {
        return {
          won: true,
          winner: 1,
          reason: `Người chơi 1 đã tiêu diệt hoàn toàn toàn bộ quân ${PIECE_TYPES[type].name} của đối phương!`
        };
      }
    }

    // Kiểm tra P1 có bị diệt sạch 1 loại quân nào không
    for (const [type, count] of Object.entries(counts[1])) {
      if (count === 0) {
        return {
          won: true,
          winner: 2,
          reason: `Người chơi 2 đã tiêu diệt hoàn toàn toàn bộ quân ${PIECE_TYPES[type].name} của đối phương!`
        };
      }
    }

    return { won: false };
  }

  endGame(winner, reason) {
    this.gameOver = true;
    clearInterval(this.timerInterval);
    this.sounds.playVictory();

    const victoryModal = document.getElementById('victoryModal');
    const title = document.getElementById('victoryTitle');
    const reasonText = document.getElementById('victoryReason');
    const icon = document.getElementById('victoryIcon');

    title.textContent = winner === 1 ? '🎉 NGƯỜI CHƠI 1 (XANH) THẮNG!' : '🎉 NGƯỜI CHƠI 2 (ĐỎ) THẮNG!';
    title.style.color = winner === 1 ? '#38bdf8' : '#f87171';
    icon.textContent = winner === 1 ? '👑' : '🏆';
    reasonText.textContent = reason;

    victoryModal.classList.add('show');
    this.updateStatusSummary(`🏆 Ván đấu kết thúc: ${reason}`);
    this.render();
  }

  logMove(piece, fromCol, fromRow, toCol, toRow, captured) {
    const list = document.getElementById('historyList');
    if (!list) return;

    if (this.history.length === 1) {
      list.innerHTML = '';
    }

    const fromCoord = `${COLS[fromCol]}${ROWS[fromRow]}`;
    const toCoord = `${COLS[toCol]}${ROWS[toRow]}`;
    const pieceInfo = PIECE_TYPES[piece.type];

    const entry = document.createElement('div');
    entry.className = `history-entry p${piece.player}-entry`;

    let text = `#${this.history.length} [P${piece.player}] ${pieceInfo.icon} ${fromCoord} ➔ ${toCoord}`;
    if (captured) {
      text += ` <span class="capture-tag">⚔️ Ăn ${PIECE_TYPES[captured.type].icon}</span>`;
    }

    entry.innerHTML = text;
    list.prepend(entry);

    const countElem = document.getElementById('moveCountText');
    if (countElem) countElem.textContent = `${this.history.length} nước`;
  }

  updateStatusSummary(msg) {
    const sum = document.getElementById('gameStatusSummary');
    if (sum) sum.textContent = msg;
  }

  undo() {
    if (this.gameOver || this.history.length === 0) return;
    if (this.mode === 'online') {
      alert('Không thể đi lại khi đang chơi trực tuyến.');
      return;
    }

    const last = this.history.pop();
    this.board[last.from.row][last.from.col] = last.piece;
    this.board[last.to.row][last.to.col] = last.captured;
    this.currentTurn = last.turn;
    this.selectedCell = null;
    this.validMoves = [];
    this.lastMove = null;

    // Nếu đấu với AI và lùi lại, nên lùi luôn 2 nước để về lại lượt người chơi
    if (this.mode === 'ai' && this.history.length > 0 && last.turn === 2) {
      const prev = this.history.pop();
      this.board[prev.from.row][prev.from.col] = prev.piece;
      this.board[prev.to.row][prev.to.col] = prev.captured;
      this.currentTurn = 1;
    }

    this.startTimer();
    this.render();
  }

  /**
   * Trí tuệ nhân tạo (AI Bot - Player 2)
   */
  makeAIMove() {
    if (this.gameOver || this.currentTurn !== 2) return;

    // Tìm tất cả các nước đi có thể của Player 2
    const allMoves = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const piece = this.board[r][c];
        if (piece && piece.player === 2) {
          const moves = this.getValidMovesForPiece(c, r);
          for (const m of moves) {
            allMoves.push({
              fromCol: c,
              fromRow: r,
              toCol: m.col,
              toRow: m.row,
              isCapture: m.isCapture,
              piece: piece
            });
          }
        }
      }
    }

    if (allMoves.length === 0) {
      this.endGame(1, 'Người chơi 2 (AI) không còn nước đi hợp lệ!');
      return;
    }

    // Đánh giá điểm chiến thuật cho mỗi nước đi
    let bestMove = null;
    let maxScore = -999999;

    for (const move of allMoves) {
      let score = 0;

      // 1. Chiếm ô căn cứ a1 (0, 0): Thắng ngay lập tức!
      if (move.toCol === 0 && move.toRow === 0) {
        score += 100000;
      }

      // 2. Ăn quân đối phương
      if (move.isCapture) {
        score += 120;
        const targetPiece = this.board[move.toRow][move.toCol];
        // Đếm xem đối phương còn bao nhiêu quân loại này
        let remain = 0;
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const p = this.board[r][c];
            if (p && p.player === 1 && p.type === targetPiece.type) {
              remain++;
            }
          }
        }
        // Nếu đây là quân cuối cùng của loại đó -> Thắng ngay!
        if (remain === 1) {
          score += 50000;
        }
      }

      // 3. Tiến gần về căn cứ a1 (0, 0)
      const currentDist = Math.hypot(move.fromCol - 0, move.fromRow - 0);
      const newDist = Math.hypot(move.toCol - 0, move.toRow - 0);
      score += (currentDist - newDist) * 15;

      // 4. Tránh bị ăn ở lượt tiếp theo
      // Kiểm tra sơ bộ xem ô đích có đang bị quân P1 đe dọa không
      let inDanger = false;
      for (const [dc, dr] of DIRECTIONS) {
        const nc = move.toCol + dc;
        const nr = move.toRow + dr;
        if (nc >= 0 && nc < 9 && nr >= 0 && nr < 9) {
          const enemy = this.board[nr][nc];
          if (enemy && enemy.player === 1 && this.canCapture(enemy.type, move.piece.type)) {
            inDanger = true;
            break;
          }
        }
      }
      if (inDanger) {
        score -= 80;
      }

      // Thêm chút ngẫu nhiên nhỏ để các trận đấu không bị rập khuôn
      score += Math.random() * 5;

      if (score > maxScore) {
        maxScore = score;
        bestMove = move;
      }
    }

    if (bestMove) {
      this.executeMove(bestMove.fromCol, bestMove.fromRow, bestMove.toCol, bestMove.toRow);
    }
  }

  /**
   * RENDER BÀN CỜ VÀ GIAO DIỆN
   */
  render() {
    const grid = document.getElementById('boardGrid');
    if (!grid) return;
    grid.innerHTML = '';

    // Bàn cờ hiển thị từ hàng 9 xuống hàng 1 (row index 8 xuống 0)
    for (let r = 8; r >= 0; r--) {
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        if ((r + c) % 2 === 1) {
          cell.classList.add('alt-color');
        }

        // Đánh dấu ô Căn Cứ Chiến Lược
        if (c === 0 && r === 0) cell.classList.add('base-p1'); // a1
        if (c === 8 && r === 8) cell.classList.add('base-p2'); // i9

        // Highlight ô đang chọn
        if (this.selectedCell && this.selectedCell.col === c && this.selectedCell.row === r) {
          cell.classList.add('selected');
        }

        // Highlight nước đi hợp lệ
        const validMove = this.validMoves.find(m => m.col === c && m.row === r);
        if (validMove) {
          if (validMove.isCapture) {
            cell.classList.add('valid-capture');
          } else {
            cell.classList.add('valid-move');
          }
        }

        // Highlight nước đi trước
        if (this.lastMove) {
          if (this.lastMove.from.col === c && this.lastMove.from.row === r) {
            cell.classList.add('last-move-source');
          }
          if (this.lastMove.to.col === c && this.lastMove.to.row === r) {
            cell.classList.add('last-move-target');
          }
        }

        // Vẽ quân cờ nếu có
        const pieceData = this.board[r][c];
        if (pieceData) {
          const pieceElem = document.createElement('div');
          pieceElem.className = `piece p${pieceData.player}-piece`;
          const pInfo = PIECE_TYPES[pieceData.type];

          pieceElem.innerHTML = `
            <span class="piece-icon">${pInfo.icon}</span>
            <span class="piece-label">${pInfo.name}</span>
          `;
          cell.appendChild(pieceElem);
        }

        cell.addEventListener('click', () => this.handleCellClick(c, r));
        grid.appendChild(cell);
      }
    }

    this.renderInventory();
    this.renderTurnIndicators();
  }

  renderTurnIndicators() {
    const p1Badge = document.getElementById('p1TurnBadge');
    const p2Badge = document.getElementById('p2TurnBadge');
    const turnText = document.getElementById('currentTurnText');

    if (this.currentTurn === 1) {
      if (p1Badge) p1Badge.classList.add('active');
      if (p2Badge) p2Badge.classList.remove('active');
      if (turnText) {
        turnText.textContent = 'Người chơi 1 (Xanh)';
        turnText.style.color = 'var(--p1-color)';
      }
    } else {
      if (p2Badge) p2Badge.classList.add('active');
      if (p1Badge) p1Badge.classList.remove('active');
      if (turnText) {
        turnText.textContent = this.mode === 'ai' ? '🤖 Máy AI (Đỏ)' : 'Người chơi 2 (Đỏ)';
        turnText.style.color = 'var(--p2-color)';
      }
    }
  }

  renderInventory() {
    const counts = {
      1: { ROCK: 0, PAPER: 0, SCISSORS: 0 },
      2: { ROCK: 0, PAPER: 0, SCISSORS: 0 }
    };

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.board[r][c];
        if (p) {
          counts[p.player][p.type]++;
        }
      }
    }

    const updateBadge = (elemId, count) => {
      const el = document.getElementById(elemId);
      if (!el) return;
      const numSpan = el.querySelector('.inv-num');
      if (numSpan) numSpan.textContent = `${count}/3`;

      el.classList.remove('danger', 'extinct');
      if (count === 1) el.classList.add('danger');
      if (count === 0) el.classList.add('extinct');
    };

    updateBadge('p1RockCount', counts[1].ROCK);
    updateBadge('p1PaperCount', counts[1].PAPER);
    updateBadge('p1ScissorsCount', counts[1].SCISSORS);

    updateBadge('p2RockCount', counts[2].ROCK);
    updateBadge('p2PaperCount', counts[2].PAPER);
    updateBadge('p2ScissorsCount', counts[2].SCISSORS);
  }
}

// Khởi tạo Game
window.addEventListener('DOMContentLoaded', () => {
  window.ottGame = new OTTGame();
});
