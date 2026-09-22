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
    this.p1Time = 240;
    this.p2Time = 240;
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
   * Cột được đánh dấu từ a -> i (index 0 -> 8)
   * Hàng được đánh dấu từ 1 -> 9 (index 0 -> 8)
   */
  initBoard() {
    this.board = Array(9).fill(null).map(() => Array(9).fill(null));
    this.currentTurn = 1;
    this.selectedCell = null;
    this.validMoves = [];
    this.history = [];
    this.gameOver = false;
    this.lastMove = null;

    // Hàm tiện ích: Đặt quân cờ dựa trên tọa độ chuỗi (vd: '4b' hoặc 'b4')
    const placePiece = (player, type, pos) => {
      const colStr = pos.match(/[a-i]/i)[0].toLowerCase();
      const rowStr = pos.match(/[1-9]/)[0];
      
      const col = colStr.charCodeAt(0) - 'a'.charCodeAt(0);
      const row = parseInt(rowStr) - 1;
      
      this.board[row][col] = { player, type };
    };

    // ==========================================
    // THIẾT LẬP QUÂN CHO PLAYER 1 (Lùi về 1 ô)
    // ==========================================

    // 1. 3 quân Kéo (SCISSORS)
    ['5c', '4d', '3e'].forEach(pos => placePiece(1, 'SCISSORS', pos));

    // 2. 4 quân Giấy/Bao (PAPER)
    ['5b', '4c', '3d', '2e'].forEach(pos => placePiece(1, 'PAPER', pos));

    // 3. 3 quân Đá/Đấm (ROCK)
    ['4b', '3c', '2d'].forEach(pos => placePiece(1, 'ROCK', pos));


    // ==========================================
    // THIẾT LẬP QUÂN CHO PLAYER 2
    // (Đối xứng với P1 qua đường chéo 9a -> 1i)
    // ==========================================

    // 1. 3 quân Kéo (SCISSORS) - Đối xứng với (5c, 4d, 3e)
    ['7e', '6f', '5g'].forEach(pos => placePiece(2, 'SCISSORS', pos));

    // 2. 4 quân Giấy/Bao (PAPER) - Đối xứng với (5b, 4c, 3d, 2e)
    ['8e', '7f', '6g', '5h'].forEach(pos => placePiece(2, 'PAPER', pos));

    // 3. 3 quân Đá/Đấm (ROCK) - Đối xứng với (4b, 3c, 2d)
    ['8f', '7g', '6h'].forEach(pos => placePiece(2, 'ROCK', pos));
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
    
    this.p1Time = 240;
    this.p2Time = 240;
    this.initBoard();
    this.render();
    this.startTimer();
    this.updateStatusSummary('Ván đấu mới đã bắt đầu!');
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  startTimer() {
    clearInterval(this.timerInterval);
    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      if (this.gameOver) {
        clearInterval(this.timerInterval);
        return;
      }

      if (this.currentTurn === 1) {
        this.p1Time--;
        if (this.p1Time <= 0) {
          this.p1Time = 0;
          this.updateTimerDisplay();
          this.endGame(2, 'Người chơi 1 (Xanh) đã hết thời gian!');
          return;
        }
      } else {
        this.p2Time--;
        if (this.p2Time <= 0) {
          this.p2Time = 0;
          this.updateTimerDisplay();
          this.endGame(1, 'Người chơi 2 (Đỏ) đã hết thời gian!');
          return;
        }
      }

      this.updateTimerDisplay();
    }, 1000);
  }

  updateTimerDisplay() {
    const timerElem = document.getElementById('turnTimer');
    const p1TimerElem = document.getElementById('p1Timer');
    const p2TimerElem = document.getElementById('p2Timer');

    const p1Str = this.formatTime(this.p1Time);
    const p2Str = this.formatTime(this.p2Time);

    if (p1TimerElem) p1TimerElem.textContent = p1Str;
    if (p2TimerElem) p2TimerElem.textContent = p2Str;

    if (timerElem) {
      timerElem.textContent = `P1: ${p1Str} | P2: ${p2Str}`;
      const activeTime = this.currentTurn === 1 ? this.p1Time : this.p2Time;
      if (activeTime <= 30) {
        timerElem.style.color = '#ef4444';
      } else {
        timerElem.style.color = '#f0f6fc';
      }
    }
  }

  canCapture(attackerType, defenderType) {
    if (attackerType === defenderType) return false;
    return PIECE_TYPES[attackerType].beats === defenderType;
  }

  getValidMovesForPiece(col, row) {
    const piece = this.board[row][col];
    if (!piece) return [];

    const moves = [];
    for (const [dc, dr] of DIRECTIONS) {
      const tc = col + dc;
      const tr = row + dr;

      if (tc >= 0 && tc < 9 && tr >= 0 && tr < 9) {
        const target = this.board[tr][tc];

        if (!target) {
          moves.push({ col: tc, row: tr, isCapture: false });
        } else if (target.player !== piece.player) {
          if (this.canCapture(piece.type, target.type)) {
            moves.push({ col: tc, row: tr, isCapture: true });
          }
        }
      }
    }
    return moves;
  }

  handleCellClick(col, row) {
    if (this.gameOver) return;

    if (this.mode === 'ai' && this.currentTurn === 2) return;

    const clickedPiece = this.board[row][col];

    if (this.selectedCell) {
      const isTargetMove = this.validMoves.find(m => m.col === col && m.row === row);
      if (isTargetMove) {
        this.executeMove(this.selectedCell.col, this.selectedCell.row, col, row);
        return;
      }
    }

    if (clickedPiece && clickedPiece.player === this.currentTurn) {
      this.selectedCell = { col, row };
      this.validMoves = this.getValidMovesForPiece(col, row);
      this.render();
      return;
    }

    this.selectedCell = null;
    this.validMoves = [];
    this.render();
  }

  executeMove(fromCol, fromRow, toCol, toRow, isRemote = false) {
    const piece = this.board[fromRow][fromCol];
    const target = this.board[toRow][toCol];
    if (!piece) return;

    const isCapture = !!target;

    this.history.push({
      from: { col: fromCol, row: fromRow },
      to: { col: toCol, row: toRow },
      piece: { ...piece },
      captured: target ? { ...target } : null,
      turn: this.currentTurn
    });

    this.board[toRow][toCol] = piece;
    this.board[fromRow][fromCol] = null;
    this.lastMove = { from: { col: fromCol, row: fromRow }, to: { col: toCol, row: toRow } };
    this.selectedCell = null;
    this.validMoves = [];

    if (isCapture) {
      this.sounds.playCapture();
    } else {
      this.sounds.playMove();
    }

    this.logMove(piece, fromCol, fromRow, toCol, toRow, target);

    if (!isRemote && this.onMoveCallback) {
      this.onMoveCallback({ fromCol, fromRow, toCol, toRow });
    }

    const winResult = this.checkWinCondition(toCol, toRow, piece);
    if (winResult.won) {
      this.endGame(winResult.winner, winResult.reason);
      return;
    }

    this.switchTurn();

    if (!this.gameOver && this.mode === 'ai' && this.currentTurn === 2) {
      setTimeout(() => this.makeAIMove(), 500);
    }
  }

  switchTurn() {
    this.currentTurn = this.currentTurn === 1 ? 2 : 1;
    this.startTimer();
    this.render();
    this.updateStatusSummary(`Lượt của ${this.getTurnName(this.currentTurn)}.`);
  }

  getTurnName(player) {
    return player === 1 ? 'Người chơi 1 (Xanh)' : 'Người chơi 2 (Đỏ)';
  }

  checkWinCondition(toCol, toRow, movedPiece) {
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

    for (const [type, count] of Object.entries(counts[2])) {
      if (count === 0) {
        return {
          won: true,
          winner: 1,
          reason: `Người chơi 1 đã tiêu diệt hoàn toàn toàn bộ quân ${PIECE_TYPES[type].name} của đối phương!`
        };
      }
    }

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

    if (this.mode === 'ai' && this.history.length > 0 && last.turn === 2) {
      const prev = this.history.pop();
      this.board[prev.from.row][prev.from.col] = prev.piece;
      this.board[prev.to.row][prev.to.col] = prev.captured;
      this.currentTurn = 1;
    }

    this.startTimer();
    this.render();
  }

  makeAIMove() {
    if (this.gameOver || this.currentTurn !== 2) return;

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

    let bestMove = null;
    let maxScore = -999999;

    for (const move of allMoves) {
      let score = 0;

      if (move.toCol === 0 && move.toRow === 0) {
        score += 100000;
      }

      if (move.isCapture) {
        score += 120;
        const targetPiece = this.board[move.toRow][move.toCol];
        let remain = 0;
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const p = this.board[r][c];
            if (p && p.player === 1 && p.type === targetPiece.type) {
              remain++;
            }
          }
        }
        if (remain === 1) {
          score += 50000;
        }
      }

      const currentDist = Math.hypot(move.fromCol - 0, move.fromRow - 0);
      const newDist = Math.hypot(move.toCol - 0, move.toRow - 0);
      score += (currentDist - newDist) * 15;

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

  render() {
    const grid = document.getElementById('boardGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let r = 8; r >= 0; r--) {
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        if ((r + c) % 2 === 1) {
          cell.classList.add('alt-color');
        }

        if (c === 0 && r === 0) cell.classList.add('base-p1'); // a1
        if (c === 8 && r === 8) cell.classList.add('base-p2'); // i9

        if (this.selectedCell && this.selectedCell.col === c && this.selectedCell.row === r) {
          cell.classList.add('selected');
        }

        const validMove = this.validMoves.find(m => m.col === c && m.row === r);
        if (validMove) {
          if (validMove.isCapture) {
            cell.classList.add('valid-capture');
          } else {
            cell.classList.add('valid-move');
          }
        }

        if (this.lastMove) {
          if (this.lastMove.from.col === c && this.lastMove.from.row === r) {
            cell.classList.add('last-move-source');
          }
          if (this.lastMove.to.col === c && this.lastMove.to.row === r) {
            cell.classList.add('last-move-target');
          }
        }

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

  // ==========================================
  // ĐÃ SỬA: Hàm renderInventory mới (Fix lỗi 4/3 thành 4/4)
  // ==========================================
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

    // Khai báo tổng số quân tối đa
    const MAX_PIECES = {
      ROCK: 3,
      PAPER: 4, 
      SCISSORS: 3
    };

    // Hàm update nhận thêm tham số maxCount
    const updateBadge = (elemId, count, maxCount) => {
      const el = document.getElementById(elemId);
      if (!el) return;
      const numSpan = el.querySelector('.inv-num');
      // Gán linh hoạt theo maxCount thay vì /3 cứng
      if (numSpan) numSpan.textContent = `${count}/${maxCount}`;

      el.classList.remove('danger', 'extinct');
      if (count === 1) el.classList.add('danger');
      if (count === 0) el.classList.add('extinct');
    };

    // Truyền maxCount cho từng phe
    updateBadge('p1RockCount', counts[1].ROCK, MAX_PIECES.ROCK);
    updateBadge('p1PaperCount', counts[1].PAPER, MAX_PIECES.PAPER);
    updateBadge('p1ScissorsCount', counts[1].SCISSORS, MAX_PIECES.SCISSORS);

    updateBadge('p2RockCount', counts[2].ROCK, MAX_PIECES.ROCK);
    updateBadge('p2PaperCount', counts[2].PAPER, MAX_PIECES.PAPER);
    updateBadge('p2ScissorsCount', counts[2].SCISSORS, MAX_PIECES.SCISSORS);
  }
}

// Khởi tạo Game
window.addEventListener('DOMContentLoaded', () => {
  window.ottGame = new OTTGame();
});