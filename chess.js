(() => {
  const boardElement = document.querySelector('#chess-board');
  if (!boardElement) return;

  const dialog = document.querySelector('#chess-dialog');
  const openButton = document.querySelector('#chess-open');
  const closeButton = document.querySelector('#chess-close');
  const statusElement = document.querySelector('#chess-status');
  const turnElement = document.querySelector('#chess-turn-label');
  const quipElement = document.querySelector('#chess-quip');
  const moveListElement = document.querySelector('#chess-move-list');
  const moveCountElement = document.querySelector('#chess-move-count');
  const playerColorSelect = document.querySelector('#chess-player-color');
  const strengthSelect = document.querySelector('#chess-strength');
  const promotionElement = document.querySelector('#chess-promotion');
  const STORAGE_KEY = 'vesper-chess-v1';
  const FILES = 'abcdefgh';
  const PIECES = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟', K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' };
  const PIECE_NAMES = { k: 'black king', q: 'black queen', r: 'black rook', b: 'black bishop', n: 'black knight', p: 'black pawn', K: 'white king', Q: 'white queen', R: 'white rook', B: 'white bishop', N: 'white knight', P: 'white pawn' };
  const VALUES = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000 };
  const KNIGHT_STEPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const STRAIGHTS = [[-1, 0], [0, -1], [0, 1], [1, 0]];
  const INITIAL_BOARD = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'.split('').map((piece) => piece === '.' ? null : piece);
  let game = loadGame();
  let selectedSquare = null;
  let legalForSelection = [];
  let pendingPromotion = [];
  let isThinking = false;
  let result = null;

  function freshState() {
    return { board: [...INITIAL_BOARD], turn: 'w', castling: 'KQkq', enPassant: -1, halfmove: 0, fullmove: 1 };
  }

  function loadGame() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.state?.board?.length === 64 && ['w', 'b'].includes(saved.state.turn)
        && Array.isArray(saved.moves) && ['w', 'b'].includes(saved.playerColor)) {
        playerColorSelect.value = saved.playerColor;
        const strength = ['1', '2', '3'].includes(String(saved.strength)) ? Number(saved.strength) : 2;
        strengthSelect.value = String(strength);
        return { state: saved.state, moves: saved.moves, playerColor: saved.playerColor, strength };
      }
    } catch { /* Start a fresh match if the saved game is damaged. */ }
    return { state: freshState(), moves: [], playerColor: 'w', strength: 2 };
  }

  function saveGame() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...game, strength: Number(strengthSelect.value) }));
    } catch { /* The current match remains playable if browser storage is unavailable. */ }
  }

  function colorOf(piece) { return !piece ? null : piece === piece.toUpperCase() ? 'w' : 'b'; }
  function typeOf(piece) { return piece?.toLowerCase(); }
  function inside(row, col) { return row >= 0 && row < 8 && col >= 0 && col < 8; }
  function squareName(index) { return `${FILES[index % 8]}${8 - Math.floor(index / 8)}`; }
  function sideName(side) { return side === 'w' ? 'White' : 'Black'; }
  function opposite(side) { return side === 'w' ? 'b' : 'w'; }
  function kingIndex(state, side) { return state.board.findIndex((piece) => piece === (side === 'w' ? 'K' : 'k')); }

  function attacked(state, target, bySide) {
    if (target < 0) return false;
    const row = Math.floor(target / 8);
    const col = target % 8;
    const pawnRow = row + (bySide === 'w' ? 1 : -1);
    for (const pawnCol of [col - 1, col + 1]) {
      if (inside(pawnRow, pawnCol) && state.board[pawnRow * 8 + pawnCol] === (bySide === 'w' ? 'P' : 'p')) return true;
    }
    for (const [dr, dc] of KNIGHT_STEPS) {
      const r = row + dr, c = col + dc;
      if (inside(r, c) && state.board[r * 8 + c] === (bySide === 'w' ? 'N' : 'n')) return true;
    }
    for (const [dr, dc] of KING_STEPS) {
      const r = row + dr, c = col + dc;
      if (inside(r, c) && state.board[r * 8 + c] === (bySide === 'w' ? 'K' : 'k')) return true;
    }
    for (const [dr, dc] of [...DIAGONALS, ...STRAIGHTS]) {
      let r = row + dr, c = col + dc, distance = 1;
      while (inside(r, c)) {
        const piece = state.board[r * 8 + c];
        if (piece) {
          if (colorOf(piece) === bySide) {
            const type = typeOf(piece);
            if (type === 'q' || (distance === 1 && type === 'k')
              || (dr !== 0 && dc !== 0 && type === 'b')
              || ((dr === 0 || dc === 0) && type === 'r')) return true;
          }
          break;
        }
        r += dr; c += dc; distance += 1;
      }
    }
    return false;
  }

  function pushPawnMove(moves, from, to, promotionRow, extra = {}) {
    if (Math.floor(to / 8) === promotionRow) {
      for (const promotion of ['q', 'r', 'b', 'n']) moves.push({ from, to, promotion, ...extra });
    } else moves.push({ from, to, ...extra });
  }

  function pseudoMoves(state) {
    const moves = [];
    for (let from = 0; from < 64; from += 1) {
      const piece = state.board[from];
      const side = colorOf(piece);
      if (!piece || side !== state.turn) continue;
      const type = typeOf(piece);
      const row = Math.floor(from / 8), col = from % 8;
      if (type === 'p') {
        const direction = side === 'w' ? -1 : 1;
        const startRow = side === 'w' ? 6 : 1;
        const promotionRow = side === 'w' ? 0 : 7;
        const oneRow = row + direction;
        if (inside(oneRow, col) && !state.board[oneRow * 8 + col]) {
          pushPawnMove(moves, from, oneRow * 8 + col, promotionRow);
          const twoRow = row + direction * 2;
          if (row === startRow && !state.board[twoRow * 8 + col]) moves.push({ from, to: twoRow * 8 + col });
        }
        for (const dc of [-1, 1]) {
          const captureCol = col + dc;
          if (!inside(oneRow, captureCol)) continue;
          const to = oneRow * 8 + captureCol;
          const target = state.board[to];
          if (target && colorOf(target) !== side && typeOf(target) !== 'k') pushPawnMove(moves, from, to, promotionRow, { capture: true });
          else if (to === state.enPassant) moves.push({ from, to, capture: true, enPassant: true });
        }
        continue;
      }

      const offsets = type === 'n' ? KNIGHT_STEPS : type === 'k' ? KING_STEPS : type === 'b' ? DIAGONALS : type === 'r' ? STRAIGHTS : [...DIAGONALS, ...STRAIGHTS];
      for (const [dr, dc] of offsets) {
        let r = row + dr, c = col + dc;
        while (inside(r, c)) {
          const to = r * 8 + c;
          const target = state.board[to];
          if (!target) moves.push({ from, to });
          else {
            if (colorOf(target) !== side && typeOf(target) !== 'k') moves.push({ from, to, capture: true });
            break;
          }
          if (type === 'n' || type === 'k') break;
          r += dr; c += dc;
        }
      }
    }

    const side = state.turn;
    const row = side === 'w' ? 7 : 0;
    const home = row * 8 + 4;
    const enemy = opposite(side);
    if (state.board[home] === (side === 'w' ? 'K' : 'k') && !attacked(state, home, enemy)) {
      const kingRight = side === 'w' ? 'K' : 'k';
      const queenRight = side === 'w' ? 'Q' : 'q';
      if (state.castling.includes(kingRight) && state.board[row * 8 + 7] === (side === 'w' ? 'R' : 'r')
        && !state.board[row * 8 + 5] && !state.board[row * 8 + 6]
        && !attacked(state, row * 8 + 5, enemy) && !attacked(state, row * 8 + 6, enemy)) {
        moves.push({ from: home, to: row * 8 + 6, castle: 'king' });
      }
      if (state.castling.includes(queenRight) && state.board[row * 8] === (side === 'w' ? 'R' : 'r')
        && !state.board[row * 8 + 1] && !state.board[row * 8 + 2] && !state.board[row * 8 + 3]
        && !attacked(state, row * 8 + 3, enemy) && !attacked(state, row * 8 + 2, enemy)) {
        moves.push({ from: home, to: row * 8 + 2, castle: 'queen' });
      }
    }
    return moves;
  }

  function applyMove(state, move) {
    const board = [...state.board];
    const piece = board[move.from];
    const side = colorOf(piece);
    const captured = move.enPassant ? board[move.to + (side === 'w' ? 8 : -8)] : board[move.to];
    board[move.from] = null;
    if (move.enPassant) board[move.to + (side === 'w' ? 8 : -8)] = null;
    board[move.to] = move.promotion ? (side === 'w' ? move.promotion.toUpperCase() : move.promotion) : piece;
    if (move.castle === 'king') {
      const row = side === 'w' ? 7 : 0;
      board[row * 8 + 5] = board[row * 8 + 7]; board[row * 8 + 7] = null;
    } else if (move.castle === 'queen') {
      const row = side === 'w' ? 7 : 0;
      board[row * 8 + 3] = board[row * 8]; board[row * 8] = null;
    }
    let castling = state.castling;
    const removeRights = (letters) => { for (const letter of letters) castling = castling.replace(letter, ''); };
    if (typeOf(piece) === 'k') removeRights(side === 'w' ? 'KQ' : 'kq');
    if (move.from === 63 || move.to === 63) removeRights('K');
    if (move.from === 56 || move.to === 56) removeRights('Q');
    if (move.from === 7 || move.to === 7) removeRights('k');
    if (move.from === 0 || move.to === 0) removeRights('q');
    const enPassant = typeOf(piece) === 'p' && Math.abs(move.to - move.from) === 16 ? (move.to + move.from) / 2 : -1;
    return {
      state: {
        board, turn: opposite(side), castling, enPassant,
        halfmove: typeOf(piece) === 'p' || captured ? 0 : state.halfmove + 1,
        fullmove: state.fullmove + (side === 'b' ? 1 : 0),
      },
      piece, captured,
    };
  }

  function legalMoves(state) {
    const side = state.turn;
    return pseudoMoves(state).filter((move) => {
      const next = applyMove(state, move).state;
      return !attacked(next, kingIndex(next, side), opposite(side));
    });
  }

  function insufficientMaterial(state) {
    const pieces = state.board.filter((piece) => piece && typeOf(piece) !== 'k');
    if (pieces.some((piece) => ['p', 'q', 'r'].includes(typeOf(piece)))) return false;
    if (pieces.length <= 1) return true;
    if (pieces.every((piece) => typeOf(piece) === 'b')) {
      const squareColors = state.board.flatMap((piece, index) => piece && typeOf(piece) === 'b' ? [(Math.floor(index / 8) + index % 8) % 2] : []);
      return squareColors.every((color) => color === squareColors[0]);
    }
    return false;
  }

  function terminalStatus(state, moves = legalMoves(state)) {
    if (!moves.length) return attacked(state, kingIndex(state, state.turn), opposite(state.turn))
      ? { type: 'mate', winner: opposite(state.turn) }
      : { type: 'draw', reason: 'stalemate' };
    if (state.halfmove >= 100) return { type: 'draw', reason: 'the fifty-move rule' };
    if (insufficientMaterial(state)) return { type: 'draw', reason: 'insufficient material' };
    return null;
  }

  function moveNotation(state, move, moves) {
    const piece = state.board[move.from];
    if (move.castle === 'king') return 'O-O';
    if (move.castle === 'queen') return 'O-O-O';
    const type = typeOf(piece);
    const captures = Boolean(move.capture || state.board[move.to]);
    let notation = type === 'p' ? '' : type.toUpperCase();
    if (type !== 'p') {
      const alternatives = moves.filter((other) => other.to === move.to && other.from !== move.from && typeOf(state.board[other.from]) === type);
      if (alternatives.length) {
        const sameFile = alternatives.some((other) => other.from % 8 === move.from % 8);
        const sameRank = alternatives.some((other) => Math.floor(other.from / 8) === Math.floor(move.from / 8));
        if (!sameFile) notation += FILES[move.from % 8];
        else if (!sameRank) notation += String(8 - Math.floor(move.from / 8));
        else notation += squareName(move.from);
      }
    } else if (captures) notation += FILES[move.from % 8];
    notation += captures ? 'x' : '';
    notation += squareName(move.to);
    if (move.promotion) notation += `=${move.promotion.toUpperCase()}`;
    const next = applyMove(state, move).state;
    if (attacked(next, kingIndex(next, next.turn), opposite(next.turn))) notation += legalMoves(next).length ? '+' : '#';
    return notation;
  }

  function evaluate(state, side) {
    let score = 0;
    for (let index = 0; index < 64; index += 1) {
      const piece = state.board[index];
      if (!piece) continue;
      const color = colorOf(piece), type = typeOf(piece);
      const row = Math.floor(index / 8), col = index % 8;
      const center = 3.5 - (Math.abs(3.5 - row) + Math.abs(3.5 - col)) / 2;
      const forward = color === 'w' ? 6 - row : row - 1;
      const positional = type === 'p' ? Math.max(0, forward) * 7 + center * 2 : ['n', 'b'].includes(type) ? center * 7 : type === 'q' ? center * 2 : 0;
      const value = VALUES[type] + positional;
      score += color === side ? value : -value;
    }
    return score;
  }

  function orderedMoves(state, moves) {
    return [...moves].sort((a, b) => {
      const capturedA = a.enPassant ? 100 : VALUES[typeOf(state.board[a.to])] || 0;
      const capturedB = b.enPassant ? 100 : VALUES[typeOf(state.board[b.to])] || 0;
      return capturedB - capturedA + (b.promotion ? 800 : 0) - (a.promotion ? 800 : 0);
    });
  }

  function search(state, depth, alpha, beta, computerSide) {
    const moves = legalMoves(state);
    const ended = terminalStatus(state, moves);
    if (ended?.type === 'mate') return state.turn === computerSide ? -100000 - depth : 100000 + depth;
    if (ended?.type === 'draw') return 0;
    if (depth <= 0) return evaluate(state, computerSide);
    const maximizing = state.turn === computerSide;
    let best = maximizing ? -Infinity : Infinity;
    for (const move of orderedMoves(state, moves)) {
      const next = applyMove(state, move).state;
      const score = search(next, depth - 1, alpha, beta, computerSide);
      if (maximizing) { best = Math.max(best, score); alpha = Math.max(alpha, best); }
      else { best = Math.min(best, score); beta = Math.min(beta, best); }
      if (beta <= alpha) break;
    }
    return best;
  }

  function chooseComputerMove(state, strength) {
    const computerSide = state.turn;
    const moves = orderedMoves(state, legalMoves(state));
    const depth = Math.max(1, Math.min(3, strength));
    let bestScore = -Infinity;
    let candidates = [];
    for (const move of moves) {
      const next = applyMove(state, move).state;
      const score = search(next, depth - 1, -Infinity, Infinity, computerSide);
      if (score > bestScore + 0.5) { bestScore = score; candidates = [move]; }
      else if (Math.abs(score - bestScore) < 0.5) candidates.push(move);
    }
    return candidates[Math.floor(Math.random() * candidates.length)] || moves[0] || null;
  }

  function randomLine(lines) { return lines[Math.floor(Math.random() * lines.length)]; }

  function setQuipForMove(record, state, isComputer) {
    const isCheck = attacked(state, kingIndex(state, state.turn), opposite(state.turn));
    if (isComputer) {
      if (result?.type === 'mate') quipElement.textContent = result.winner === game.aiColor ? 'Checkmate. You were magnificent right up until the end, darling.' : 'Checkmate? No, no. That was a very deliberate blunder.';
      else if (result?.type === 'draw') quipElement.textContent = 'A draw. I suppose neither of us has to admit defeat.';
      else if (isCheck) quipElement.textContent = 'Check. Consider that a philosophical question with a very short deadline.';
      else if (record.captured) quipElement.textContent = randomLine(['I’ll be keeping that piece, thank you.', 'A little sacrifice. How poetic of you.', 'I did warn you about that square. I think.']);
      else quipElement.textContent = randomLine(['I have a plan. It is a very good plan. Naturally.', 'Your move, darling. Try not to make it interesting.', 'The board is a small universe. You have just changed its stars.', 'I am being merciful. You should appreciate that.']);
    } else if (isCheck) quipElement.textContent = 'Check. There, now you have my full attention.';
    else if (record.captured) quipElement.textContent = 'Taking one of my pieces? Bold. I am almost impressed.';
    else quipElement.textContent = randomLine(['Interesting. I shall pretend I expected that.', 'Every move is a tiny argument about the future.', 'Go on, darling. I want to see where you take this.', 'A choice made under uncertainty is still a choice.']);
  }

  function setStatus(text, state = 'ready') {
    statusElement.textContent = text;
    statusElement.dataset.state = state;
  }

  function captureSummary(color) {
    const captured = game.moves.filter((record) => record.color === color && record.captured).map((record) => typeOf(record.captured));
    if (!captured.length) return '—';
    const order = ['q', 'r', 'b', 'n', 'p'];
    const counts = order.map((type) => [type, captured.filter((piece) => piece === type).length]).filter(([, count]) => count);
    return counts.map(([type, count]) => `${type.toUpperCase()}${count > 1 ? `×${count}` : ''}`).join(' · ');
  }

  function renderMoves() {
    moveListElement.replaceChildren();
    for (let index = 0; index < game.moves.length; index += 2) {
      const number = document.createElement('li');
      number.className = 'chess-move-number';
      number.textContent = `${Math.floor(index / 2) + 1}.`;
      const white = document.createElement('li');
      white.textContent = game.moves[index]?.san || '';
      const black = document.createElement('li');
      black.textContent = game.moves[index + 1]?.san || '';
      moveListElement.append(number, white, black);
    }
    moveCountElement.textContent = `${game.moves.length} ${game.moves.length === 1 ? 'PLY' : 'PLIES'}`;
    document.querySelector('#chess-captured-by-you').textContent = captureSummary(game.playerColor);
    document.querySelector('#chess-captured-by-vesper').textContent = captureSummary(game.aiColor);
    document.querySelector('#chess-you-color').textContent = sideName(game.playerColor).toUpperCase();
    document.querySelector('#chess-undo').disabled = !game.moves.some((record) => record.color === game.playerColor) || isThinking;
  }

  function renderBoard() {
    const keepFocus = boardElement.contains(document.activeElement);
    boardElement.replaceChildren();
    const orientation = game.playerColor;
    const moves = legalMoves(game.state);
    const checkedKing = attacked(game.state, kingIndex(game.state, game.state.turn), opposite(game.state.turn)) ? kingIndex(game.state, game.state.turn) : -1;
    const lastMove = game.moves.at(-1)?.move;
    for (let visual = 0; visual < 64; visual += 1) {
      const square = orientation === 'w' ? visual : 63 - visual;
      const row = Math.floor(square / 8), col = square % 8;
      const piece = game.state.board[square];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chess-square ${(row + col) % 2 ? 'dark' : 'light'}`;
      button.dataset.square = String(square);
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', `${PIECE_NAMES[piece] || 'empty square'}, ${squareName(square)}`);
      button.tabIndex = visual === 0 ? 0 : -1;
      if (piece) {
        button.textContent = PIECES[piece];
        button.classList.add(colorOf(piece) === 'w' ? 'white-piece' : 'black-piece');
      }
      if (square === selectedSquare) button.classList.add('selected');
      if (square === checkedKing) button.classList.add('king-check');
      if (lastMove && (square === lastMove.from || square === lastMove.to)) button.classList.add('last-move');
      const targetMoves = selectedSquare === null ? [] : legalForSelection.filter((move) => move.to === square);
      if (targetMoves.length) button.classList.add(piece ? 'legal-capture' : 'legal-target');
      if ((orientation === 'w' && row === 7) || (orientation === 'b' && row === 0)) {
        const coordinate = document.createElement('span');
        coordinate.className = 'chess-coordinate';
        coordinate.textContent = orientation === 'w' ? FILES[col] : FILES[7 - col];
        button.append(coordinate);
      }
      button.addEventListener('click', () => clickSquare(square));
      button.addEventListener('keydown', (event) => moveBoardFocus(event, square, orientation));
      boardElement.append(button);
    }
    if (keepFocus) {
      const focusSquare = selectedSquare ?? lastMove?.to ?? (orientation === 'w' ? 0 : 63);
      boardElement.querySelector(`[data-square="${focusSquare}"]`)?.focus();
    }
    playerColorSelect.value = game.playerColor;
    strengthSelect.value = String(game.strength);
    updateStatus(moves);
    renderMoves();
  }

  function moveBoardFocus(event, square, orientation) {
    const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const visual = orientation === 'w' ? square : 63 - square;
    const row = Math.floor(visual / 8) + delta[0], col = visual % 8 + delta[1];
    if (!inside(row, col)) return;
    const nextVisual = row * 8 + col;
    const nextSquare = orientation === 'w' ? nextVisual : 63 - nextVisual;
    boardElement.querySelector(`[data-square="${nextSquare}"]`)?.focus();
  }

  function updateStatus(moves = legalMoves(game.state)) {
    result = terminalStatus(game.state, moves);
    if (result?.type === 'mate') {
      const playerWon = result.winner === game.playerColor;
      setStatus(playerWon ? 'Checkmate · you win!' : 'Checkmate · Vesper wins.', 'over');
      turnElement.textContent = 'GAME OVER';
      return;
    }
    if (result?.type === 'draw') {
      setStatus(`Draw by ${result.reason}.`, 'over');
      turnElement.textContent = 'GAME OVER';
      return;
    }
    const check = attacked(game.state, kingIndex(game.state, game.state.turn), opposite(game.state.turn));
    if (isThinking) {
      setStatus('Vesper is considering the board…', 'thinking');
      turnElement.textContent = 'VESPER THINKS';
    } else if (game.state.turn === game.playerColor) {
      setStatus(check ? 'You are in check. Find a safe square.' : 'Your move.', check ? 'thinking' : 'ready');
      turnElement.textContent = check ? 'YOU ARE IN CHECK' : 'YOUR MOVE';
    } else {
      setStatus(check ? 'Vesper is in check.' : 'Vesper’s move.', check ? 'thinking' : 'ready');
      turnElement.textContent = 'VESPER TO MOVE';
    }
  }

  function clickSquare(square) {
    if (isThinking || result || game.state.turn !== game.playerColor || pendingPromotion.length) return;
    const piece = game.state.board[square];
    if (selectedSquare !== null) {
      const destinations = legalForSelection.filter((move) => move.to === square);
      if (destinations.length) {
        if (destinations.length > 1 && destinations.every((move) => move.promotion)) {
          pendingPromotion = destinations;
          promotionElement.hidden = false;
          setStatus('Choose what your pawn becomes.', 'thinking');
          return;
        }
        playMove(destinations[0], false);
        return;
      }
    }
    if (piece && colorOf(piece) === game.playerColor) {
      selectedSquare = square;
      legalForSelection = legalMoves(game.state).filter((move) => move.from === square);
      renderBoard();
      return;
    }
    selectedSquare = null;
    legalForSelection = [];
    renderBoard();
  }

  function playMove(move, isComputer) {
    const available = legalMoves(game.state);
    const legal = available.find((candidate) => candidate.from === move.from && candidate.to === move.to && candidate.promotion === move.promotion);
    if (!legal) return;
    const notation = moveNotation(game.state, legal, available);
    const { state, piece, captured } = applyMove(game.state, legal);
    const record = { move: legal, san: notation, color: colorOf(piece), piece, captured: captured || null };
    game.moves.push(record);
    game.state = state;
    selectedSquare = null;
    legalForSelection = [];
    pendingPromotion = [];
    promotionElement.hidden = true;
    saveGame();
    renderBoard();
    setQuipForMove(record, game.state, isComputer);
    if (!isComputer && !result && game.state.turn === game.aiColor) {
      isThinking = true;
      renderBoard();
      window.setTimeout(computerTurn, 90);
    }
  }

  function computerTurn() {
    if (result || game.state.turn !== game.aiColor) { isThinking = false; return; }
    const move = chooseComputerMove(game.state, game.strength);
    isThinking = false;
    if (move) playMove(move, true);
    else renderBoard();
  }

  function newGame() {
    stopPendingMove();
    game = { state: freshState(), moves: [], playerColor: playerColorSelect.value, aiColor: opposite(playerColorSelect.value), strength: Number(strengthSelect.value) || 2 };
    result = null;
    quipElement.textContent = game.playerColor === 'w' ? 'White moves first. Try not to look so confident, darling.' : 'I have the white pieces. A head start, because I am generous.';
    saveGame();
    renderBoard();
    if (game.aiColor === 'w') {
      isThinking = true;
      renderBoard();
      window.setTimeout(computerTurn, 100);
    }
  }

  function stopPendingMove() {
    isThinking = false;
    selectedSquare = null;
    legalForSelection = [];
    pendingPromotion = [];
    promotionElement.hidden = true;
  }

  function undoTurn() {
    stopPendingMove();
    if (!game.moves.some((record) => record.color === game.playerColor)) return;
    const last = game.moves.at(-1);
    const previous = game.moves.at(-2);
    let remove = 1;
    if (last?.color === game.aiColor && previous?.color === game.playerColor) remove = 2;
    game.moves.splice(-remove, remove);
    game.state = freshState();
    for (const record of game.moves) game.state = applyMove(game.state, record.move).state;
    result = null;
    quipElement.textContent = 'Second thoughts? That is a respectable strategy, actually.';
    saveGame();
    renderBoard();
  }

  function restoreIfNeeded() {
    if (!game.aiColor) game.aiColor = opposite(game.playerColor);
    if (!game.strength) game.strength = Number(strengthSelect.value) || 2;
    try {
      let state = freshState();
      for (const record of game.moves) {
        if (!record?.move || !Number.isInteger(record.move.from) || !Number.isInteger(record.move.to)) throw new Error('Invalid saved move.');
        const move = legalMoves(state).find((candidate) => candidate.from === record.move.from && candidate.to === record.move.to && candidate.promotion === record.move.promotion);
        if (!move || record.color !== state.turn) throw new Error('Invalid saved game sequence.');
        const applied = applyMove(state, move);
        record.move = move;
        record.piece = applied.piece;
        record.captured = applied.captured || null;
        state = applied.state;
      }
      const savedState = game.state;
      const matches = state.board.every((piece, index) => piece === savedState.board[index])
        && state.turn === savedState.turn && state.castling === savedState.castling
        && state.enPassant === savedState.enPassant && state.halfmove === savedState.halfmove
        && state.fullmove === savedState.fullmove;
      if (matches) game.state = state;
      else throw new Error('Saved board does not match its move record.');
    } catch { game = { state: freshState(), moves: [], playerColor: 'w', aiColor: 'b', strength: 2 }; }
  }

  function openDialog() {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    boardElement.querySelector('[tabindex="0"]')?.focus();
  }

  function closeDialog() {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    openButton.focus();
  }

  openButton.addEventListener('click', openDialog);
  closeButton.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
  document.querySelector('#chess-new').addEventListener('click', newGame);
  document.querySelector('#chess-undo').addEventListener('click', undoTurn);
  playerColorSelect.addEventListener('change', () => { quipElement.textContent = 'Choose New Game when you are ready to switch sides.'; });
  strengthSelect.addEventListener('change', () => { game.strength = Number(strengthSelect.value) || 2; saveGame(); });
  promotionElement.querySelectorAll('[data-promotion]').forEach((button) => button.addEventListener('click', () => {
    const move = pendingPromotion.find((candidate) => candidate.promotion === button.dataset.promotion);
    if (move) playMove(move, false);
  }));

  restoreIfNeeded();
  playerColorSelect.value = game.playerColor;
  strengthSelect.value = String(game.strength);
  renderBoard();
  if (game.state.turn === game.aiColor && !terminalStatus(game.state)) {
    isThinking = true;
    renderBoard();
    window.setTimeout(computerTurn, 100);
  }
})();
