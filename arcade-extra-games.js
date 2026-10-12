import { appStore } from './persistence.js';

const byId = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const GAME_NAMES = { '2048': '2048', mines: 'Minesweeper', snake: 'Moonlit Snake', dvd: 'Orbiting Logo', cow: 'Find the Cow', cookie: 'Cookie Garden', hacker: 'Hacker Typer', thoughts: 'Pixel Thoughts', silk: 'Silk Studio', doodle: 'Quick Doodle', pointer: 'Pointer Pals', 'text-toy': 'Little Text Spells', ambience: 'Ambient Room' };
const VALID_THEMES = ['sakura', 'retro', 'neon', 'pastel'];

function numberOr(value, fallback = 0) { return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback; }

export function initializeArcadeExtras(arcade) {
  const progress = { scores: {}, cookie: { count: 0, upgrades: {}, lastAt: Date.now() } };
  let saveTimer = 0;
  const state = () => ({ active: arcade.activeId, paused: arcade.paused });
  const writeState = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      const latest = appStore.get('workspace.arcade', {}) || {};
      appStore.set('workspace.arcade', {
        ...latest,
        theme: document.body.dataset.arcadeTheme || 'sakura',
        scores: { ...(latest.scores || {}), ...progress.scores },
        cookie: { ...progress.cookie, upgrades: { ...progress.cookie.upgrades }, lastAt: Date.now() },
      });
    }, 160);
  };
  const flushState = () => {
    window.clearTimeout(saveTimer);
    const latest = appStore.get('workspace.arcade', {}) || {};
    appStore.set('workspace.arcade', { ...latest, scores: { ...(latest.scores || {}), ...progress.scores }, cookie: { ...progress.cookie, upgrades: { ...progress.cookie.upgrades }, lastAt: Date.now() } });
  };
  const recordScore = (id, value, lowerIsBetter = false) => {
    const previous = progress.scores[id];
    if (previous == null || (lowerIsBetter ? value < previous : value > previous)) {
      progress.scores[id] = value;
      if (id === 'snake' && byId('snake-best')) byId('snake-best').textContent = String(value);
      if (id === 'cow' && byId('cow-best')) byId('cow-best').textContent = String(value);
      if (id === 'tetris' && byId('tetris-best')) byId('tetris-best').textContent = String(value);
      paintHall();
      writeState();
      return true;
    }
    return false;
  };
  const paintHall = () => {
    const hall = byId('arcade-hall');
    if (!hall) return;
    const classic = appStore.get('workspace.arcade.classic', {}) || {};
    const classicRows = [
      ['Rock-paper-scissors', classic.jkp?.best ? `${classic.jkp.best} streak` : '—'],
      ['Tic-Tac-Toe', classic.ttt?.w ? `${classic.ttt.w} wins` : '—'],
      ['Memory Match', classic.memory?.best ? `${classic.memory.best} moves` : '—'],
      ['Reflex Test', classic.reflex?.best ? `${classic.reflex.best} ms` : '—'],
      ['Star Catch', classic.starcatch?.best ? `${classic.starcatch.best} stars` : '—'],
      ['High-Low', classic.highlow?.best ? `${classic.highlow.best} guesses` : '—'],
    ];
    const extras = Object.entries(GAME_NAMES).map(([id, title]) => {
      const value = progress.scores[id];
      const suffix = id === 'mines' ? ' sec' : id === 'cow' ? ' moves' : id === '2048' ? ' tile' : id === 'dvd' ? ' corners' : id === 'snake' ? ' fruit' : '';
      return [title, value == null ? '—' : `${value}${suffix}`];
    });
    const extensionRows = arcade.list().filter(({ id }) => !Object.hasOwn(GAME_NAMES, id) && !['jkp', 'ttt', 'memory', 'omikuji', 'reflex', 'starcatch', 'highlow'].includes(id)).map(({ id, title }) => [title, progress.scores[id] == null ? '—' : String(progress.scores[id])]);
    hall.replaceChildren(...[...classicRows, ...extras, ...extensionRows].map(([label, value]) => {
      const row = document.createElement('div'); row.className = 'hall-row';
      const name = document.createElement('span'); name.textContent = label;
      const best = document.createElement('b'); best.textContent = String(value);
      row.append(name, best); return row;
    }));
  };

  // ---- 2048 ---------------------------------------------------------
  const grid2048 = byId('g2048-board');
  let tiles = Array(16).fill(0); let score2048 = 0; let ended2048 = false; let celebrated2048 = false;
  const addTile = () => {
    const empty = tiles.map((tile, index) => tile ? -1 : index).filter((index) => index >= 0);
    if (empty.length) tiles[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
  };
  const render2048 = () => {
    grid2048.replaceChildren(...tiles.map((value, index) => {
      const cell = document.createElement('div'); cell.className = `tile-2048${value ? ` tile-${Math.min(value, 2048)}` : ''}`;
      cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-label', `Row ${Math.floor(index / 4) + 1}, column ${index % 4 + 1}: ${value || 'empty'}`); cell.textContent = value ? String(value) : ''; return cell;
    }));
    byId('g2048-score').textContent = String(score2048);
    byId('g2048-best').textContent = String(Math.max(progress.scores['2048'] || 0, score2048));
  };
  const reset2048 = () => { tiles = Array(16).fill(0); score2048 = 0; ended2048 = false; celebrated2048 = false; addTile(); addTile(); byId('g2048-status').textContent = 'Make a move.'; render2048(); };
  const move2048 = (direction) => {
    if (ended2048 || arcade.activeId !== '2048' || arcade.paused) return;
    const old = tiles.join(',');
    for (let line = 0; line < 4; line += 1) {
      const indexes = Array.from({ length: 4 }, (_, offset) => {
        const step = direction === 'left' || direction === 'right' ? offset : offset;
        const pos = direction === 'left' || direction === 'right' ? line * 4 + step : step * 4 + line;
        return direction === 'right' || direction === 'down' ? (direction === 'right' ? line * 4 + 3 - offset : (3 - offset) * 4 + line) : pos;
      });
      const packed = indexes.map((index) => tiles[index]).filter(Boolean); const merged = [];
      for (let i = 0; i < packed.length; i += 1) {
        if (packed[i] === packed[i + 1]) { const value = packed[i] * 2; merged.push(value); score2048 += value; i += 1; }
        else merged.push(packed[i]);
      }
      while (merged.length < 4) merged.push(0);
      indexes.forEach((index, offset) => { tiles[index] = merged[offset]; });
    }
    if (old === tiles.join(',')) return;
    addTile();
    const maxTile = Math.max(...tiles); recordScore('2048', score2048);
    byId('g2048-status').textContent = maxTile >= 2048 ? '2048! You did it. That was beautiful.' : `${maxTile} tile. Keep going.`;
    if (maxTile >= 2048 && !celebrated2048) { celebrated2048 = true; arcade.react('joy', { game: '2048', score: score2048 }); }
    const canMove = tiles.includes(0) || tiles.some((value, index) => (index % 4 < 3 && value === tiles[index + 1]) || (index < 12 && value === tiles[index + 4]));
    if (!canMove) { ended2048 = true; byId('g2048-status').textContent = `No moves left. Final score: ${score2048}.`; }
    render2048();
  };
  byId('g2048-reset').addEventListener('click', reset2048);
  document.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => move2048(button.dataset.move)));
  window.addEventListener('keydown', (event) => {
    if (arcade.activeId !== '2048' || arcade.paused || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
    if (direction) { event.preventDefault(); move2048(direction); }
  });

  // ---- Minesweeper --------------------------------------------------
  const mineBoard = byId('mines-board'); let mineCells = []; let mineStarted = false; let mineOver = false; let mineSeconds = 0; let mineTicker = 0;
  const mineCount = 10; const side = 9;
  const syncMineTicker = () => {
    const shouldTick = mineStarted && !mineOver && arcade.activeId === 'mines' && !arcade.paused;
    if (shouldTick && !mineTicker) mineTicker = window.setInterval(() => { mineSeconds += 1; byId('mines-time').textContent = String(mineSeconds); }, 1000);
    if (!shouldTick && mineTicker) { window.clearInterval(mineTicker); mineTicker = 0; }
  };
  const mineReset = () => { window.clearInterval(mineTicker); mineTicker = 0; mineCells = Array.from({ length: side * side }, () => ({ mine: false, open: false, flag: false, count: 0 })); mineStarted = false; mineOver = false; mineSeconds = 0; byId('mines-time').textContent = '0'; byId('mines-left').textContent = '10'; byId('mines-status').textContent = 'Your first reveal is always safe.'; renderMines(); };
  const seedMines = (safeIndex) => {
    const candidates = mineCells.map((_, index) => index).filter((index) => index !== safeIndex);
    for (let i = candidates.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
    for (const index of candidates.slice(0, mineCount)) mineCells[index].mine = true;
    mineCells.forEach((cell, index) => { if (!cell.mine) cell.count = neighbors(index).filter((near) => mineCells[near].mine).length; });
  };
  const neighbors = (index) => { const row = Math.floor(index / side); const col = index % side; const result = []; for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) { const x = col + dx; const y = row + dy; if ((dx || dy) && x >= 0 && x < side && y >= 0 && y < side) result.push(y * side + x); } return result; };
  const finishMines = (won) => { mineOver = true; window.clearInterval(mineTicker); mineTicker = 0; byId('mines-status').textContent = won ? `All clear in ${mineSeconds} seconds. Nicely done.` : 'Boom. The little garden got you. Try a new board?'; arcade.react(won ? 'joy' : 'sad', { game: 'mines', time: mineSeconds }); if (won) recordScore('mines', mineSeconds || 1, true); };
  const openMine = (index) => {
    const cell = mineCells[index]; if (mineOver || cell.open || cell.flag) return;
    if (!mineStarted) { mineStarted = true; seedMines(index); syncMineTicker(); }
    cell.open = true;
    if (cell.mine) { mineCells.forEach((item) => { if (item.mine) item.open = true; }); finishMines(false); renderMines(); return; }
    if (!cell.count) for (const near of neighbors(index)) if (!mineCells[near].open) openMine(near);
    const safeOpened = mineCells.filter((item) => item.open && !item.mine).length;
    if (safeOpened === side * side - mineCount) finishMines(true);
    renderMines();
  };
  const toggleFlag = (index) => { const cell = mineCells[index]; if (mineOver || cell.open) return; cell.flag = !cell.flag; byId('mines-left').textContent = String(mineCount - mineCells.filter((item) => item.flag).length); renderMines(); };
  const renderMines = () => {
    if (!mineBoard) return;
    mineBoard.replaceChildren(...mineCells.map((cell, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `mine-cell${cell.open ? ' is-open' : ''}${cell.mine && cell.open ? ' is-mine' : ''}${cell.flag ? ' is-flag' : ''}`; button.setAttribute('role', 'gridcell');
      const label = cell.flag ? 'flagged' : cell.open ? cell.mine ? 'mine' : `${cell.count || 'empty'}` : 'covered'; button.setAttribute('aria-label', `Row ${Math.floor(index / side) + 1}, column ${index % side + 1}, ${label}`);
      button.textContent = cell.flag ? '⚑' : cell.open ? cell.mine ? '✹' : cell.count ? String(cell.count) : '' : '';
      button.addEventListener('click', () => byId('mines-flag-mode').checked ? toggleFlag(index) : openMine(index));
      button.addEventListener('contextmenu', (event) => { event.preventDefault(); toggleFlag(index); });
      return button;
    }));
  };
  byId('mines-reset').addEventListener('click', mineReset);

  // ---- Snake --------------------------------------------------------
  const snakeCanvas = byId('snake-canvas'); const snakeContext = snakeCanvas.getContext('2d'); const cellSize = 20; const cols = snakeCanvas.width / cellSize; const rows = snakeCanvas.height / cellSize;
  let snake = []; let fruit = { x: 8, y: 8 }; let snakeDirection = { x: 1, y: 0 }; let nextDirection = { ...snakeDirection }; let snakeScore = 0; let snakeRunning = false; let snakeTimer = 0;
  const drawSnake = () => {
    snakeContext.fillStyle = '#11131c'; snakeContext.fillRect(0, 0, snakeCanvas.width, snakeCanvas.height);
    snakeContext.strokeStyle = '#ffffff08'; snakeContext.lineWidth = 1;
    for (let x = 0; x <= cols; x += 1) { snakeContext.beginPath(); snakeContext.moveTo(x * cellSize, 0); snakeContext.lineTo(x * cellSize, snakeCanvas.height); snakeContext.stroke(); }
    for (let y = 0; y <= rows; y += 1) { snakeContext.beginPath(); snakeContext.moveTo(0, y * cellSize); snakeContext.lineTo(snakeCanvas.width, y * cellSize); snakeContext.stroke(); }
    snakeContext.fillStyle = '#f5b6df'; snakeContext.shadowColor = '#f5b6df'; snakeContext.shadowBlur = 14; snakeContext.beginPath(); snakeContext.arc(fruit.x * cellSize + 10, fruit.y * cellSize + 10, 7, 0, Math.PI * 2); snakeContext.fill();
    snakeContext.shadowBlur = 8; snake.forEach((part, index) => { snakeContext.fillStyle = index ? '#a5a2e8' : '#d6b6f0'; snakeContext.fillRect(part.x * cellSize + 2, part.y * cellSize + 2, 16, 16); }); snakeContext.shadowBlur = 0;
  };
  const placeFruit = () => { let attempts = 0; do { fruit = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) }; attempts += 1; } while (snake.some((part) => part.x === fruit.x && part.y === fruit.y) && attempts < 100); };
  const stopSnake = (message) => { snakeRunning = false; window.clearInterval(snakeTimer); snakeTimer = 0; byId('snake-status').textContent = message; if (snakeScore > 0) arcade.react('happy', { game: 'snake', score: snakeScore }); recordScore('snake', snakeScore); };
  const stepSnake = () => {
    if (arcade.activeId !== 'snake' || arcade.paused || !snakeRunning) return;
    snakeDirection = nextDirection;
    const head = { x: snake[0].x + snakeDirection.x, y: snake[0].y + snakeDirection.y };
    const eating = head.x === fruit.x && head.y === fruit.y;
    if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows || snake.slice(0, eating ? undefined : -1).some((part) => part.x === head.x && part.y === head.y)) { stopSnake(`Moon fruit collected: ${snakeScore}. One more round?`); return; }
    snake.unshift(head); if (eating) { snakeScore += 1; byId('snake-score').textContent = String(snakeScore); placeFruit(); } else snake.pop(); drawSnake();
  };
  const syncSnake = () => {
    const shouldRun = snakeRunning && arcade.activeId === 'snake' && !arcade.paused;
    if (shouldRun && !snakeTimer) snakeTimer = window.setInterval(stepSnake, 125);
    if (!shouldRun && snakeTimer) { window.clearInterval(snakeTimer); snakeTimer = 0; }
  };
  const startSnake = () => { snake = [{ x: 6, y: 9 }, { x: 5, y: 9 }, { x: 4, y: 9 }]; snakeDirection = { x: 1, y: 0 }; nextDirection = { ...snakeDirection }; snakeScore = 0; snakeRunning = true; byId('snake-score').textContent = '0'; byId('snake-status').textContent = 'Collect the moon fruit.'; placeFruit(); drawSnake(); syncSnake(); };
  const steerSnake = (direction) => { const candidate = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[direction]; if (candidate && !(candidate.x === -snakeDirection.x && candidate.y === -snakeDirection.y)) nextDirection = candidate; };
  byId('snake-start').addEventListener('click', startSnake);
  document.querySelectorAll('[data-snake]').forEach((button) => button.addEventListener('click', () => steerSnake(button.dataset.snake)));
  window.addEventListener('keydown', (event) => { if (arcade.activeId !== 'snake' || arcade.paused) return; const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key]; if (direction) { event.preventDefault(); steerSnake(direction); } });
  drawSnake();

  // ---- DVD logo bounce ---------------------------------------------
  const dvdArena = byId('dvd-arena'); const dvdLogo = byId('dvd-logo'); let dvdFrame = 0; let dvdRunning = false; let dvdLast = 0; let dvdX = 24; let dvdY = 22; let dvdVX = 105; let dvdVY = 84; let dvdCorners = 0;
  const drawDvd = (now = 0) => {
    if (!dvdRunning || arcade.activeId !== 'dvd' || arcade.paused) { dvdFrame = 0; dvdLast = now; return; }
    const rect = dvdArena.getBoundingClientRect(); const width = dvdLogo.offsetWidth; const height = dvdLogo.offsetHeight;
    if (rect.width > width && rect.height > height) {
      const dt = Math.min((now - (dvdLast || now)) / 1000, 0.04); dvdLast = now;
      dvdX += dvdVX * dt; dvdY += dvdVY * dt;
      let hitX = false; let hitY = false;
      if (dvdX <= 0 || dvdX + width >= rect.width) { dvdVX *= -1; dvdX = clamp(dvdX, 0, rect.width - width); hitX = true; }
      if (dvdY <= 0 || dvdY + height >= rect.height) { dvdVY *= -1; dvdY = clamp(dvdY, 0, rect.height - height); hitY = true; }
      if (hitX && hitY) { dvdCorners += 1; byId('dvd-hits').textContent = String(dvdCorners); recordScore('dvd', dvdCorners); }
      dvdLogo.style.transform = `translate(${dvdX}px, ${dvdY}px)`;
    }
    dvdFrame = requestAnimationFrame(drawDvd);
  };
  const syncDvd = () => { if (dvdRunning && arcade.activeId === 'dvd' && !arcade.paused && !dvdFrame) { dvdLast = 0; dvdFrame = requestAnimationFrame(drawDvd); } else if ((arcade.activeId !== 'dvd' || arcade.paused) && dvdFrame) { cancelAnimationFrame(dvdFrame); dvdFrame = 0; } };
  byId('dvd-toggle').addEventListener('click', () => { dvdRunning = !dvdRunning; byId('dvd-toggle').textContent = dvdRunning ? 'PAUSE DRIFT' : 'RESUME DRIFT'; byId('dvd-status').textContent = dvdRunning ? 'Drifting through the little universe…' : 'Paused in a very stylish spot.'; syncDvd(); });
  byId('dvd-reset').addEventListener('click', () => { dvdRunning = false; syncDvd(); dvdX = 24; dvdY = 22; dvdVX = 105; dvdVY = 84; dvdCorners = 0; byId('dvd-hits').textContent = '0'; byId('dvd-logo').style.transform = 'translate(24px, 22px)'; byId('dvd-toggle').textContent = 'START DRIFT'; byId('dvd-status').textContent = 'A tiny screen saver for your tiny break.'; });

  // ---- Find the cow -------------------------------------------------
  const cowField = byId('cow-field'); let cowTarget = { x: 0.5, y: 0.5 }; let cowMoves = 0; let cowLastBell = 0; let cowAudio = null; let cowFound = false;
  const hideCow = () => { cowTarget = { x: 0.08 + Math.random() * 0.84, y: 0.1 + Math.random() * 0.8 }; cowMoves = 0; cowFound = false; cowField.querySelector('.cow-hint').textContent = 'Somewhere in this field…'; byId('cow-status').textContent = 'Closer means louder. Click when you hear it.'; };
  const bell = (proximity) => {
    if (!cowAudio || cowAudio.state !== 'running') return;
    const now = performance.now(); const cooldown = 1500 - proximity * 1180;
    if (now - cowLastBell < cooldown) return; cowLastBell = now;
    const oscillator = cowAudio.createOscillator(); const gain = cowAudio.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = 440 + proximity * 420;
    gain.gain.setValueAtTime(0.0001, cowAudio.currentTime); gain.gain.exponentialRampToValueAtTime(0.075 + proximity * 0.12, cowAudio.currentTime + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, cowAudio.currentTime + 0.18);
    oscillator.connect(gain); gain.connect(cowAudio.destination); oscillator.start(); oscillator.stop(cowAudio.currentTime + 0.2);
  };
  const startCowAudio = async () => { const AudioCtx = window.AudioContext || window.webkitAudioContext; if (!AudioCtx) { byId('cow-status').textContent = 'This browser does not have Web Audio support.'; return; } cowAudio ||= new AudioCtx(); if (cowAudio.state === 'suspended') await cowAudio.resume(); };
  cowField.addEventListener('pointerdown', () => { startCowAudio().catch(() => {}); });
  cowField.addEventListener('pointermove', (event) => {
    const rect = cowField.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width; const y = (event.clientY - rect.top) / rect.height; const dx = x - cowTarget.x; const dy = y - cowTarget.y;
    const distance = Math.hypot(dx * rect.width, dy * rect.height); const maximum = Math.hypot(rect.width, rect.height); const proximity = 1 - clamp(distance / maximum, 0, 1); const cursor = byId('cow-cursor'); cursor.style.left = `${x * 100}%`; cursor.style.top = `${y * 100}%`;
    if (!cowFound) { cowMoves += 1; bell(proximity); byId('cow-status').textContent = proximity > 0.82 ? 'Warmer… warmer…' : proximity > 0.52 ? 'Getting warmer.' : proximity < 0.2 ? 'Cold. Wander a little.' : 'A little closer…'; }
  });
  cowField.addEventListener('click', (event) => {
    void startCowAudio(); const rect = cowField.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width; const y = (event.clientY - rect.top) / rect.height;
    if (Math.hypot((x - cowTarget.x) * rect.width, (y - cowTarget.y) * rect.height) < 42) { cowFound = true; cowField.querySelector('.cow-hint').textContent = 'Moo! You found me!'; byId('cow-status').textContent = `Found in ${cowMoves} little moves. Lovely listening.`; recordScore('cow', Math.max(cowMoves, 1), true); }
  });
  byId('cow-new').addEventListener('click', hideCow); hideCow();

  // ---- Cookie garden -----------------------------------------------
  const upgradeCatalog = [
    { id: 'baker', name: 'Helpful baker', icon: 'BAKE', base: 15, rate: 0.2 },
    { id: 'oven', name: 'Little oven', icon: 'HEAT', base: 80, rate: 1.5 },
    { id: 'orchard', name: 'Cookie orchard', icon: 'GROW', base: 360, rate: 8 },
  ];
  const cookieState = progress.cookie;
  const cookieRate = () => upgradeCatalog.reduce((total, item) => total + (cookieState.upgrades[item.id] || 0) * item.rate, 0);
  const formatCookies = (count) => count >= 1e9 ? `${(count / 1e9).toFixed(2)}b` : count >= 1e6 ? `${(count / 1e6).toFixed(2)}m` : count >= 1e4 ? `${(count / 1e3).toFixed(1)}k` : Math.floor(count).toLocaleString();
  const renderCookie = () => {
    byId('cookie-count').textContent = formatCookies(cookieState.count); byId('cookie-rate').textContent = `${cookieRate().toFixed(cookieRate() % 1 ? 1 : 0)} cookies / second`;
    const list = byId('cookie-upgrades');
    list.replaceChildren(...upgradeCatalog.map((item) => {
      const owned = cookieState.upgrades[item.id] || 0; const cost = Math.ceil(item.base * (1.42 ** owned)); const button = document.createElement('button'); button.type = 'button'; button.className = 'cookie-upgrade'; button.disabled = cookieState.count < cost; button.setAttribute('aria-label', `${item.name}; costs ${formatCookies(cost)} cookies; owned ${owned}`);
      const name = document.createElement('span'); name.textContent = `${item.icon} ${item.name}`; const detail = document.createElement('small'); detail.textContent = `${formatCookies(cost)} cookies · +${item.rate} / sec · owned ${owned}`; button.append(name, detail);
      button.addEventListener('click', () => { if (cookieState.count < cost) return; cookieState.count -= cost; cookieState.upgrades[item.id] = owned + 1; byId('cookie-status').textContent = `${item.name} joined your garden.`; renderCookie(); writeState(); });
      return button;
    }));
  };
  byId('cookie-click').addEventListener('click', () => { cookieState.count += 1; renderCookie(); writeState(); });
  let cookieSeconds = 0;
  const cookieTicker = window.setInterval(() => {
    const rate = cookieRate();
    if (!rate) return;
    cookieState.count = Math.min(Number.MAX_SAFE_INTEGER, cookieState.count + rate);
    renderCookie();
    cookieSeconds += 1;
    if (cookieSeconds % 15 === 0) writeState();
  }, 1000);

  // ---- Hacker typer -------------------------------------------------
  const codeLines = ['const vesper = await awaken({ local: true, telemetry: false });', 'memory.index({ source: "this device", trust: "private" });', 'for (const star of sky) await mapOrbit(star);', 'if (kindness > 0) return { status: "ready" };', 'springBones.update(deltaTime); // a little bounce', 'const promise = dreams.resolve({ offline: true });', 'while (curious) { await explore(); }', 'signal.emit("senpai:noticed", { affection: 0.99 });', 'await vault.write({ encrypted: true, localOnly: true });', 'renderer.setPixelRatio(Math.min(devicePixelRatio, 2));'];
  let hackerText = 'VESPER LOCAL TERMINAL · READY\nPRESS ANY KEY TO BEGIN_';
  const hackerOutput = byId('hacker-output');
  const resetHacker = () => { hackerText = 'VESPER LOCAL TERMINAL · READY\nPRESS ANY KEY TO BEGIN_'; hackerOutput.textContent = hackerText; };
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (arcade.activeId !== 'hacker' || arcade.paused || event.ctrlKey || event.metaKey || event.altKey || ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape'].includes(event.key) || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    const line = codeLines[Math.floor(Math.random() * codeLines.length)]; hackerText = `${hackerText.replace(/_$/, '')}\n${line.slice(0, Math.max(4, Math.ceil(Math.random() * line.length))) }_`.slice(-4000); hackerOutput.textContent = hackerText; byId('hacker-terminal').scrollTop = byId('hacker-terminal').scrollHeight;
  });
  byId('hacker-reset').addEventListener('click', resetHacker);

  // ---- Pixel Thoughts ----------------------------------------------
  const thoughtForm = byId('thoughts-form'); const thoughtSky = byId('thoughts-sky'); let thoughtRemaining = 60; let thoughtLast = 0; let thoughtTimer = 0;
  const endThought = () => { window.clearInterval(thoughtTimer); thoughtTimer = 0; thoughtSky.hidden = true; thoughtForm.hidden = false; byId('thoughts-input').value = ''; byId('thoughts-status').textContent = 'A little more room to breathe. Your words have been cleared.'; thoughtRemaining = 60; };
  thoughtForm.addEventListener('submit', (event) => { event.preventDefault(); if (!byId('thoughts-input').value.trim()) return; thoughtForm.hidden = true; thoughtSky.hidden = false; byId('thoughts-countdown').textContent = '60'; byId('thoughts-status').textContent = 'Breathe in… and let the thought drift.'; thoughtRemaining = 60; thoughtLast = performance.now(); window.clearInterval(thoughtTimer); thoughtTimer = window.setInterval(() => { const now = performance.now(); const current = state(); if (current.active !== 'thoughts' || current.paused) { thoughtLast = now; return; } thoughtRemaining -= (now - thoughtLast) / 1000; thoughtLast = now; byId('thoughts-countdown').textContent = String(Math.max(0, Math.ceil(thoughtRemaining))); if (thoughtRemaining <= 0) endThought(); }, 250); });

  // ---- Symmetric silk canvas ---------------------------------------
  const silk = byId('silk-canvas'); const silkContext = silk.getContext('2d'); let silkDrawing = false; let silkLast = null;
  const silkPoint = (event) => { const rect = silk.getBoundingClientRect(); return { x: (event.clientX - rect.left) * silk.width / rect.width, y: (event.clientY - rect.top) * silk.height / rect.height }; };
  const silkStroke = (from, to) => {
    const color = byId('silk-color').value; const draw = (start, end) => { silkContext.beginPath(); silkContext.moveTo(start.x, start.y); silkContext.lineTo(end.x, end.y); silkContext.strokeStyle = color; silkContext.lineWidth = 3.2; silkContext.lineCap = 'round'; silkContext.lineJoin = 'round'; silkContext.shadowColor = color; silkContext.shadowBlur = 16; silkContext.stroke(); };
    draw(from, to); draw({ x: silk.width - from.x, y: from.y }, { x: silk.width - to.x, y: to.y });
  };
  silk.addEventListener('pointerdown', (event) => { silkDrawing = true; silk.setPointerCapture(event.pointerId); silkLast = silkPoint(event); });
  silk.addEventListener('pointermove', (event) => { if (!silkDrawing || !silkLast) return; const next = silkPoint(event); silkStroke(silkLast, next); silkLast = next; });
  const stopSilk = () => { silkDrawing = false; silkLast = null; };
  silk.addEventListener('pointerup', stopSilk); silk.addEventListener('pointercancel', stopSilk);
  byId('silk-clear').addEventListener('click', () => silkContext.clearRect(0, 0, silk.width, silk.height));

  // ---- Quick doodle heuristic --------------------------------------
  const doodle = byId('doodle-canvas'); const doodleContext = doodle.getContext('2d'); let doodleDrawing = false; let doodleStrokes = []; let doodleCurrent = [];
  const doodlePoint = (event) => { const rect = doodle.getBoundingClientRect(); return { x: (event.clientX - rect.left) * doodle.width / rect.width, y: (event.clientY - rect.top) * doodle.height / rect.height }; };
  doodle.addEventListener('pointerdown', (event) => { doodleDrawing = true; doodle.setPointerCapture(event.pointerId); doodleCurrent = [doodlePoint(event)]; doodleContext.beginPath(); doodleContext.moveTo(doodleCurrent[0].x, doodleCurrent[0].y); });
  doodle.addEventListener('pointermove', (event) => { if (!doodleDrawing) return; const point = doodlePoint(event); doodleCurrent.push(point); doodleContext.lineTo(point.x, point.y); doodleContext.strokeStyle = '#f2c7e8'; doodleContext.lineWidth = 5; doodleContext.lineCap = 'round'; doodleContext.stroke(); });
  const endDoodleStroke = () => { if (doodleDrawing && doodleCurrent.length) doodleStrokes.push(doodleCurrent); doodleDrawing = false; doodleCurrent = []; };
  doodle.addEventListener('pointerup', endDoodleStroke); doodle.addEventListener('pointercancel', endDoodleStroke);
  byId('doodle-clear').addEventListener('click', () => { doodleContext.clearRect(0, 0, doodle.width, doodle.height); doodleStrokes = []; byId('doodle-status').textContent = 'I wonder what you will draw.'; });
  byId('doodle-guess').addEventListener('click', () => {
    if (!doodleStrokes.length) { byId('doodle-status').textContent = 'Draw a little something first, senpai.'; return; }
    const points = doodleStrokes.flat(); const xs = points.map((point) => point.x); const ys = points.map((point) => point.y); const width = Math.max(...xs) - Math.min(...xs); const height = Math.max(...ys) - Math.min(...ys); const first = points[0]; const last = points.at(-1); const closed = Math.hypot(first.x - last.x, first.y - last.y) < Math.max(width, height) * 0.22; const round = width && height ? Math.min(width, height) / Math.max(width, height) : 0;
    const guess = doodleStrokes.length >= 4 ? 'a very determined kitty' : closed && round > 0.72 ? 'a moon (or a brave little potato)' : closed ? 'a cloud floating by' : width > height * 1.5 ? 'a tiny landscape' : 'a shooting star in a hurry';
    byId('doodle-status').textContent = `My local guess: ${guess}. Was I close?`;
  });

  // ---- Pointer pals -------------------------------------------------
  const pointerField = byId('pointer-field');
  pointerField.addEventListener('pointermove', (event) => {
    const rect = pointerField.getBoundingClientRect();
    pointerField.querySelectorAll('span').forEach((pal) => {
      const palRect = pal.getBoundingClientRect(); const angle = Math.atan2(event.clientY - (palRect.top + palRect.height / 2), event.clientX - (palRect.left + palRect.width / 2));
      pal.style.setProperty('--look-x', `${Math.cos(angle) * 4}px`); pal.style.setProperty('--look-y', `${Math.sin(angle) * 4}px`); pal.style.setProperty('--look-angle', `${angle * 180 / Math.PI}deg`);
    });
    pointerField.style.setProperty('--pointer-x', `${(event.clientX - rect.left) / rect.width * 100}%`); pointerField.style.setProperty('--pointer-y', `${(event.clientY - rect.top) / rect.height * 100}%`);
  });

  // ---- Little text spells ------------------------------------------
  const inputText = byId('text-toy-input'); const outputText = byId('text-toy-output'); const spell = byId('text-toy-style');
  const transformWord = (word, mode) => {
    if (mode === 'pig') { const match = word.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/); if (!match) return word; const [, before, core, after] = match; const vowel = core.search(/[aeiou]/i); const shift = vowel <= 0 ? `${core}way` : `${core.slice(vowel)}${core.slice(0, vowel)}ay`; return `${before}${/^[A-Z]/.test(core) ? shift[0].toUpperCase() + shift.slice(1).toLowerCase() : shift}${after}`; }
    if (mode === 'leet') return word.replace(/[aAeEiIlLoOsStT]/g, (char) => ({ a: '4', A: '4', e: '3', E: '3', i: '1', I: '1', l: '1', L: '1', o: '0', O: '0', s: '5', S: '5', t: '7', T: '7' })[char]);
    if (mode === 'pirate') return word.replace(/\bhello\b/gi, 'ahoy').replace(/\bfriend\b/gi, 'matey').replace(/\bmy\b/gi, 'me').replace(/\byou\b/gi, 'ye').replace(/\bthe\b/gi, 'th\'');
    if (mode !== 'mood') return word;
    const moodWords = { love: '[affection]', happy: '[cheerful]', sad: '[rainy]', star: '[star]', cat: '[curious]', hello: '[greeting]', dream: '[dreaming]', magic: '[wonder]', coffee: '[cozy]', moon: '[night]' };
    return word.replace(/\b[a-z]+\b/gi, (token) => moodWords[token.toLowerCase()] || token);
  };
  const updateTextSpell = () => { const mode = spell.value; outputText.textContent = mode === 'pirate' ? `${transformWord(inputText.value, mode)} Arrr!` : transformWord(inputText.value, mode); };
  inputText.addEventListener('input', updateTextSpell); spell.addEventListener('change', updateTextSpell);
  byId('text-toy-copy').addEventListener('click', async () => { if (!outputText.textContent) return; try { await navigator.clipboard.writeText(outputText.textContent); byId('text-toy-copy').textContent = 'COPIED'; window.setTimeout(() => { byId('text-toy-copy').textContent = 'COPY'; }, 1000); } catch { outputText.focus(); } });

  // ---- Ambient Web Audio -------------------------------------------
  let ambientContext = null; let ambientChannels = {};
  const stopAmbience = async () => { if (!ambientContext) return; const context = ambientContext; ambientContext = null; ambientChannels = {}; await context.close().catch(() => {}); byId('ambience-toggle').textContent = 'START SOUND'; byId('ambience-status').textContent = 'Sound stopped.'; };
  const startAmbience = async () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { byId('ambience-status').textContent = 'Web Audio is unavailable in this browser.'; return; }
    ambientContext ||= new AudioCtx(); await ambientContext.resume();
    if (Object.keys(ambientChannels).length) return;
    const master = ambientContext.createGain(); master.gain.value = 0.22; master.connect(ambientContext.destination);
    const noiseBuffer = ambientContext.createBuffer(1, ambientContext.sampleRate * 2, ambientContext.sampleRate); const data = noiseBuffer.getChannelData(0); for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    for (const type of ['rain', 'fire']) {
      const source = ambientContext.createBufferSource(); source.buffer = noiseBuffer; source.loop = true; const filter = ambientContext.createBiquadFilter(); filter.type = type === 'rain' ? 'lowpass' : 'bandpass'; filter.frequency.value = type === 'rain' ? 1400 : 360; filter.Q.value = type === 'fire' ? 0.65 : 0.2; const gain = ambientContext.createGain(); gain.gain.value = 0; source.connect(filter); filter.connect(gain); gain.connect(master); source.start(); ambientChannels[type] = { gain, source };
    }
    const oscillator = ambientContext.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = 110; const spaceGain = ambientContext.createGain(); spaceGain.gain.value = 0; const spaceFilter = ambientContext.createBiquadFilter(); spaceFilter.type = 'lowpass'; spaceFilter.frequency.value = 240; oscillator.connect(spaceFilter); spaceFilter.connect(spaceGain); spaceGain.connect(master); oscillator.start(); ambientChannels.space = { gain: spaceGain, source: oscillator };
    document.querySelectorAll('[data-ambience]').forEach((slider) => { const channel = ambientChannels[slider.dataset.ambience]; if (channel) channel.gain.gain.setTargetAtTime(Number(slider.value) / 100 * (slider.dataset.ambience === 'space' ? 0.035 : 0.22), ambientContext.currentTime, 0.12); });
    byId('ambience-toggle').textContent = 'SOUND IS ON'; byId('ambience-status').textContent = 'Your soundscape is running locally.';
  };
  document.querySelectorAll('[data-ambience]').forEach((slider) => slider.addEventListener('input', () => {
    const channel = ambientChannels[slider.dataset.ambience]; if (channel && ambientContext) channel.gain.gain.setTargetAtTime(Number(slider.value) / 100 * (slider.dataset.ambience === 'space' ? 0.035 : 0.22), ambientContext.currentTime, 0.12);
  }));
  byId('ambience-toggle').addEventListener('click', () => { startAmbience().catch(() => { byId('ambience-status').textContent = 'Could not start audio. Try pressing play again.'; }); });
  byId('ambience-stop').addEventListener('click', () => { void stopAmbience(); });

  // Lifecycle events stop animation/audio while a different game is open.
  window.addEventListener('vesper:arcade-state', (event) => {
    const { activeId, paused } = event.detail;
    syncSnake(); syncDvd();
    syncMineTicker();
    if ((activeId !== 'ambience' || paused) && ambientContext) void stopAmbience();
    const thoughtStar = byId('thoughts-star'); if (thoughtStar) thoughtStar.classList.toggle('is-paused', activeId !== 'thoughts' || paused);
  });
  window.addEventListener('vesper:arcade-theme', (event) => { const latest = appStore.get('workspace.arcade', {}) || {}; appStore.set('workspace.arcade', { ...latest, theme: event.detail.theme }); });
  window.addEventListener('vesper:arcade-score', paintHall);
  window.addEventListener('vesper:arcade-report-score', (event) => {
    const { id, value, lowerIsBetter } = event.detail || {};
    if (typeof id === 'string' && arcade.list().some((game) => game.id === id) && Number.isFinite(value) && value >= 0) recordScore(id, value, lowerIsBetter);
  });
  window.addEventListener('pagehide', flushState);
  window.addEventListener('pagehide', () => window.clearInterval(cookieTicker), { once: true });

  const idleSuggestion = byId('arcade-idle-suggestion'); let idleTimer = 0;
  const scheduleIdleSuggestion = () => { window.clearTimeout(idleTimer); if (document.hidden) return; idleTimer = window.setTimeout(() => { if (arcade.activeId && !arcade.paused && idleSuggestion) idleSuggestion.hidden = false; }, 90000); };
  const dismissIdleSuggestion = () => { if (idleSuggestion) idleSuggestion.hidden = true; scheduleIdleSuggestion(); };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((type) => document.addEventListener(type, dismissIdleSuggestion, { passive: true }));
  window.addEventListener('vesper:arcade-state', scheduleIdleSuggestion);
  document.querySelectorAll('[data-idle-launch]').forEach((button) => button.addEventListener('click', () => { if (idleSuggestion) idleSuggestion.hidden = true; arcade.launch(button.dataset.idleLaunch); }));
  byId('arcade-idle-dismiss')?.addEventListener('click', dismissIdleSuggestion);
  scheduleIdleSuggestion();

  arcade.register({ id: '2048', tab: byId('g2048-board').closest('.arcade-layout').querySelector('[data-game="2048"]'), panel: document.querySelector('[data-panel="2048"]') });
  for (const id of Object.keys(GAME_NAMES).filter((game) => game !== '2048')) arcade.register({ id, tab: document.querySelector(`[data-game="${id}"]`), panel: document.querySelector(`[data-panel="${id}"]`) });

  appStore.ready.then(() => {
    const stored = appStore.get('workspace.arcade', {}) || {};
    const registeredIds = new Set(arcade.list().map((game) => game.id));
    progress.scores = Object.fromEntries(Object.entries(stored.scores || {}).filter(([id, value]) => registeredIds.has(id) && Number.isFinite(value) && value >= 0));
    const cookie = stored.cookie || {};
    cookieState.count = numberOr(cookie.count);
    cookieState.upgrades = Object.fromEntries(upgradeCatalog.map((item) => [item.id, Math.floor(clamp(numberOr(cookie.upgrades?.[item.id]), 0, 100000))]));
    const elapsed = clamp((Date.now() - numberOr(cookie.lastAt, Date.now())) / 1000, 0, 8 * 60 * 60);
    cookieState.count += cookieRate() * elapsed;
    cookieState.lastAt = Date.now();
    const theme = VALID_THEMES.includes(stored.theme) ? stored.theme : null;
    if (theme) { document.body.dataset.arcadeTheme = theme; const select = byId('arcade-theme'); if (select) select.value = theme; }
    renderCookie(); render2048(); paintHall(); writeState();
  }).catch(() => { renderCookie(); paintHall(); });

  reset2048(); mineReset();
  byId('snake-best').textContent = String(progress.scores.snake || 0);
  byId('cow-best').textContent = progress.scores.cow == null ? '—' : String(progress.scores.cow);
  renderCookie(); paintHall();
}
