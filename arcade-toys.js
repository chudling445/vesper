import { appStore } from './persistence.js';

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function fitCanvas(canvas, context, height, fallbackWidth) {
  const rect = canvas.getBoundingClientRect(); const width = rect.width || fallbackWidth; const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(width * ratio)); const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width, height, ratio };
}
const extensionGames = [
  ['koalas', 'Koala dots', '<h2>Koala dots <span class="jp">まるを割ろう</span></h2><p class="game-help">Hover across the big circles and watch them divide into smaller dots. A tiny procedural mosaic, made right here.</p><canvas id="koala-canvas" class="arcade-canvas koala-canvas" width="760" height="360" aria-label="Hover to divide mosaic circles"></canvas><p class="game-result">A little constellation appears beneath your pointer.</p>'],
  ['horse', 'Endless horse', '<h2>Endless horse <span class="jp">のびる馬</span></h2><p class="game-help">Scroll inside the field. The horse keeps stretching its legs for as long as you need a distraction.</p><div class="horse-scroll" id="horse-scroll" tabindex="0" aria-label="Scroll to extend the horse"><div class="horse-top">HORSE <span>keep going…</span></div><div class="horse-legs" id="horse-legs"></div></div><p class="game-result" id="horse-status" role="status">Leg length: 0 px</p>'],
  ['cat-bounce', 'Cat bounce', '<h2>Cat bounce <span class="jp">ねこポン</span></h2><p class="game-help">Add a few cats to the little room. They bounce off the edges and each other.</p><div class="cat-arena" id="cat-arena" aria-label="Bouncing cats"></div><div class="game-toolbar"><button class="primary-button" id="cat-add" type="button">ADD A CAT</button><button class="quiet-button" id="cat-clear" type="button">CLEAR ROOM</button><span class="game-counter">CATS <b id="cat-count">0</b></span></div>'],
  ['eel-slap', 'Eel slap', '<h2>Eel slap <span class="jp">ぺしっ</span></h2><p class="game-help">Drag quickly across the little stage. The eel needs a spirited swipe to take flight.</p><div class="eel-stage" id="eel-stage" aria-label="Drag quickly across this stage"><span id="eel-fish">EEL</span><i aria-hidden="true">↔ swipe fast</i></div><p id="eel-status" class="game-result" role="status">A dramatic little swipe, if you please.</p>'],
  ['stagger', 'Wiggle wings', '<h2>Wiggle wings <span class="jp">ふわふわ</span></h2><p class="game-help">Move the pointer faster to send this springy little moth into a happy flutter.</p><div class="stagger-stage" id="stagger-stage"><span id="stagger-moth" aria-label="A fluttering moth">WINGS</span></div><p id="stagger-status" class="game-result" role="status">A gentle flutter is enough.</p>'],
  ['zoom-quilt', 'Zoom quilt', '<h2>Infinite quilt <span class="jp">夢の中へ</span></h2><p class="game-help">A slow, local zoom loop made from layered geometry. Press pause when you want to stay in one layer.</p><div class="quilt-window"><div class="quilt-stack" id="quilt-stack" aria-hidden="true"><div>✦<i>◈</i></div><div>✦<i>◈</i></div><div>✦<i>◈</i></div><div>✦<i>◈</i></div></div></div><div class="game-toolbar"><button class="quiet-button" id="quilt-toggle" type="button">PAUSE ZOOM</button></div>'],
  ['dino', 'Dino dash', '<h2>Dino dash <span class="jp">恐竜ラン</span></h2><p class="game-help">Jump over the little cacti. Press Space, tap the field, or use the button.</p><div class="game-toolbar"><button class="primary-button" id="dino-start" type="button">START / JUMP</button><span class="game-counter">BEST <b id="dino-best">0</b></span></div><canvas id="dino-canvas" class="arcade-canvas dino-canvas" width="720" height="250" aria-label="Dino runner. Press space to jump"></canvas><p id="dino-status" class="game-result" role="status">A small runner awaits.</p>'],
  ['retro-desktop', 'Retro desktop', '<h2>Retro desktop <span class="jp">なつかしい</span></h2><p class="game-help">A tiny draggable desktop daydream. Open and move the pretend windows around.</p><div class="retro-screen"><div class="retro-icons"><button type="button" data-retro-open="notes"><span>Notes</span></button><button type="button" data-retro-open="computer"><span>My computer</span></button><button type="button" data-retro-open="paint"><span>Paint</span></button></div><div class="retro-window" hidden data-retro-window="notes"><header>Vesper Notes <button type="button" data-retro-close>×</button></header><p>Remember to take a little break.<br><br> You are doing fine.</p></div><div class="retro-window" hidden data-retro-window="computer"><header>My Computer <button type="button" data-retro-close>×</button></header><p>Local Disk (C:)<br>Offline and cozy.</p></div><div class="retro-window" hidden data-retro-window="paint"><header>Paint <button type="button" data-retro-close>×</button></header><p>Today&#39;s masterpiece: a very small star.</p></div><footer>Start <span>Vesper local desktop · 12:00</span></footer></div>'],
  ['wordle', 'Daily word', '<h2>Daily word <span class="jp">ことばパズル</span></h2><p class="game-help">Six tries to find today&#39;s five-letter word. The answer is chosen locally and the same on this device today.</p><div id="wordle-grid" class="wordle-grid" role="grid" aria-label="Word guess board"></div><div class="game-toolbar"><input id="wordle-input" maxlength="5" autocomplete="off" autocapitalize="characters" aria-label="Five letter guess" placeholder="GUESS"><button class="primary-button" id="wordle-submit" type="button">GUESS</button><button class="quiet-button" id="wordle-reset" type="button">RESET TODAY</button></div><p class="game-result" id="wordle-status" role="status">A new word every day, no network needed.</p>'],
  ['trivia', 'Tiny trivia', '<h2>Tiny trivia <span class="jp">クイズの時間</span></h2><p class="game-help">A little offline quiz hosted by Vesper. Questions are bundled with the app, so this works without a connection.</p><div class="trivia-card"><span id="trivia-count" class="eyebrow">QUESTION 1 / 5</span><h3 id="trivia-question"></h3><div id="trivia-options" class="trivia-options"></div><p id="trivia-feedback" class="game-result" role="status"></p></div><button id="trivia-next" class="quiet-button" type="button">NEXT QUESTION</button>'],
  ['planetarium', 'Pocket sky', '<h2>Pocket sky <span class="jp">星空</span></h2><p class="game-help">A generated star map with a few imagined constellations. Tap a star for a tiny note about it.</p><canvas id="planet-canvas" class="arcade-canvas planet-canvas" width="760" height="350" aria-label="Interactive procedurally generated star map"></canvas><p id="planet-status" class="game-result" role="status">A quiet sky, generated on your device.</p>'],
  ['connect-four', 'Connect Four', '<h2>Connect Four <span class="jp">四目並べ</span></h2><p class="game-help">Drop a disc into a column. Four in a row wins. Vesper will try to block you, senpai.</p><div class="game-toolbar"><button id="connect-reset" class="quiet-button" type="button">NEW GAME</button><span class="game-counter">WINS <b id="connect-wins">0</b></span></div><div id="connect-board" class="connect-board" role="grid" aria-label="Connect Four board"></div><p id="connect-status" class="game-result" role="status">You are pink. Make the first move.</p>'],
];

export function initializeArcadeToys(arcade) {
  const panels = new Map();
  for (const [id, title, markup] of extensionGames) {
    arcade.register({ id, title, mount(panel) { panel.insertAdjacentHTML('beforeend', markup); } });
    panels.set(id, document.querySelector('[data-panel="' + id + '"]'));
  }

  // Koala-style circles divide into smaller, colorful dots near the pointer.
  const koala = $('koala-canvas'); const koalaCtx = koala.getContext('2d'); let koalaPoint = null;
  const drawKoala = () => {
    const { width, height } = fitCanvas(koala, koalaCtx, 360, 760); koalaCtx.fillStyle = '#100d18'; koalaCtx.fillRect(0, 0, width, height);
    for (let y = 20; y < height; y += 38) for (let x = 20; x < width; x += 38) {
      const dx = koalaPoint ? x - koalaPoint.x : width / 2 - x; const dy = koalaPoint ? y - koalaPoint.y : height / 2 - y; const divided = koalaPoint && Math.hypot(dx, dy) < 112; const radius = divided ? 5 : 17;
      koalaCtx.fillStyle = 'hsl(' + ((x * .42 + y * .26 + (divided ? 35 : 280)) % 360) + ' 72% ' + (divided ? '74%' : '54%') + ')'; koalaCtx.shadowColor = koalaCtx.fillStyle; koalaCtx.shadowBlur = divided ? 9 : 3; koalaCtx.beginPath(); koalaCtx.arc(x, y, radius, 0, Math.PI * 2); koalaCtx.fill();
      if (divided) { koalaCtx.fillStyle = '#fff4d877'; koalaCtx.font = '9px sans-serif'; koalaCtx.fillText('✦', x - 3, y + 3); }
    }
    koalaCtx.shadowBlur = 0;
  };
  const koalaObserver = new ResizeObserver(drawKoala); koalaObserver.observe(koala);
  koala.addEventListener('pointermove', (event) => { const rect = koala.getBoundingClientRect(); koalaPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top }; drawKoala(); });
  koala.addEventListener('pointerleave', () => { koalaPoint = null; drawKoala(); });

  // Scroll inside the horse's column to extend its procedural striped legs.
  const horseScroll = $('horse-scroll'); const horseLegs = $('horse-legs'); let horseHeight = 180;
  const extendHorse = () => { horseHeight = Math.min(horseHeight + 260, 12000); horseLegs.style.height = horseHeight + 'px'; $('horse-status').textContent = 'Leg length: ' + Math.max(0, horseHeight - 180).toLocaleString() + ' px. Magnificent.'; };
  horseScroll.addEventListener('scroll', () => { if (horseScroll.scrollTop + horseScroll.clientHeight >= horseScroll.scrollHeight - 28) extendHorse(); });
  horseLegs.style.height = horseHeight + 'px';

  // Cats use one requestAnimationFrame loop and are capped at fourteen.
  const catArena = $('cat-arena'); const cats = []; let catFrameId = 0; let catLastFrame = 0;
  const drawCats = (now) => {
    if (arcade.activeId !== 'cat-bounce' || arcade.paused) { catFrameId = 0; catLastFrame = now; return; }
    const dt = Math.min((now - (catLastFrame || now)) / 1000, .04); catLastFrame = now; const bounds = catArena.getBoundingClientRect();
    for (const cat of cats) { cat.x += cat.vx * dt; cat.y += cat.vy * dt; if (cat.x < 0 || cat.x > bounds.width - 55) { cat.vx *= -1; cat.x = clamp(cat.x, 0, bounds.width - 55); } if (cat.y < 0 || cat.y > bounds.height - 55) { cat.vy *= -1; cat.y = clamp(cat.y, 0, bounds.height - 55); } cat.el.style.transform = 'translate(' + cat.x + 'px,' + cat.y + 'px) rotate(' + (Math.sin(now / 230 + cat.phase) * 8) + 'deg)'; }
    catFrameId = requestAnimationFrame(drawCats);
  };
  const syncCats = () => { const run = arcade.activeId === 'cat-bounce' && !arcade.paused; if (run && !catFrameId) { catLastFrame = 0; catFrameId = requestAnimationFrame(drawCats); } else if (!run && catFrameId) { cancelAnimationFrame(catFrameId); catFrameId = 0; } };
  $('cat-add').addEventListener('click', () => { if (cats.length >= 14) return; const el = document.createElement('span'); el.className = 'bounce-cat'; el.textContent = `CAT ${cats.length + 1}`; catArena.append(el); cats.push({ el, x: 16 + Math.random() * 90, y: 12 + Math.random() * 65, vx: (90 + Math.random() * 100) * (Math.random() < .5 ? -1 : 1), vy: (80 + Math.random() * 100) * (Math.random() < .5 ? -1 : 1), phase: Math.random() * 8 }); $('cat-count').textContent = String(cats.length); syncCats(); });
  $('cat-clear').addEventListener('click', () => { cats.splice(0).forEach((cat) => cat.el.remove()); $('cat-count').textContent = '0'; });

  // A quick pointer swipe launches the eel across its stage.
  let eelStart = null; const eelStage = $('eel-stage'); const eel = $('eel-fish');
  eelStage.addEventListener('pointerdown', (event) => { eelStart = { x: event.clientX, y: event.clientY, time: performance.now() }; eelStage.setPointerCapture(event.pointerId); });
  eelStage.addEventListener('pointerup', (event) => { if (!eelStart) return; const distance = Math.hypot(event.clientX - eelStart.x, event.clientY - eelStart.y); const speed = distance / Math.max(1, performance.now() - eelStart.time); eelStart = null; if (speed < .72) { $('eel-status').textContent = 'A little more gusto, please.'; return; } eel.classList.remove('eel-flight'); void eel.offsetWidth; eel.classList.add('eel-flight'); $('eel-status').textContent = 'PESHH! A truly theatrical swipe.'; });

  // Cursor velocity tightens the moth's springy flutter.
  let previousPointer = null; const moth = $('stagger-moth');
  $('stagger-stage').addEventListener('pointermove', (event) => { const now = performance.now(); const speed = previousPointer ? Math.hypot(event.clientX - previousPointer.x, event.clientY - previousPointer.y) / Math.max(1, now - previousPointer.time) : 0; previousPointer = { x: event.clientX, y: event.clientY, time: now }; const energy = clamp(speed / 1.2, 0, 1); moth.style.setProperty('--flutter', Math.max(.18, 1.1 - energy * .96) + 's'); moth.classList.toggle('flutter-fast', energy > .28); $('stagger-status').textContent = energy > .65 ? 'The wings are having a very good day!' : 'A little spring in every step.'; });

  // The infinite zoom quilt is CSS-only and can be paused by the user.
  $('quilt-toggle').addEventListener('click', (event) => { const paused = $('quilt-stack').classList.toggle('is-paused'); event.currentTarget.textContent = paused ? 'RESUME ZOOM' : 'PAUSE ZOOM'; });

  // Dino runner: capped update delta, pausable RAF, no external assets.
  const canvas = $('dino-canvas'); const ctx = canvas.getContext('2d'); let dinoRaf = 0; let dinoTime = 0; let dinoY = 0; let dinoVelocity = 0; let obstacleX = 630; let dinoBest = 0; let dinoRunning = false; let dinoLast = 0;
  const paintDino = () => {
    const { width, height } = fitCanvas(canvas, ctx, 250, 720);
    ctx.fillStyle = '#11101a';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#d7b3dc55';
    ctx.beginPath();
    ctx.moveTo(0, 208);
    ctx.lineTo(width, 208);
    ctx.stroke();
    const baseline = 203 - dinoY;
    ctx.fillStyle = '#8ee4b4';
    ctx.fillRect(48, baseline - 22, 25, 18);
    ctx.fillRect(64, baseline - 37, 19, 18);
    ctx.fillRect(69, baseline - 3, 6, 7);
    ctx.fillRect(52, baseline - 4, 6, 8);
    ctx.fillStyle = '#11101a';
    ctx.fillRect(77, baseline - 31, 3, 3);
    ctx.fillStyle = '#9ad787';
    ctx.fillRect(obstacleX + 8, 177, 9, 31);
    ctx.fillRect(obstacleX + 1, 188, 7, 6);
    ctx.fillRect(obstacleX + 1, 182, 5, 10);
    ctx.fillRect(obstacleX + 17, 194, 7, 6);
    ctx.fillRect(obstacleX + 19, 188, 5, 10);
    ctx.fillStyle = '#f1e4f0';
    ctx.font = '11px monospace';
    ctx.fillText('SCORE ' + Math.floor(dinoTime / 80), width - 105, 23);
  };
  const finishDino = () => { dinoRunning = false; const score = Math.floor(dinoTime / 80); if (score > dinoBest) { dinoBest = score; $('dino-best').textContent = String(score); arcade.reportScore('dino', score); arcade.react('joy', { game: 'dino', score }); saveToys(); } $('dino-status').textContent = 'Run over at ' + score + '. Want another go?'; };
  const dinoWidth = () => canvas.getBoundingClientRect().width || 720;
  const dinoFrame = (now) => { if (!dinoRunning || arcade.activeId !== 'dino' || arcade.paused) { dinoRaf = 0; dinoLast = now; return; } const dt = Math.min((now - (dinoLast || now)) / 16.67, 2); dinoLast = now; dinoTime += dt; dinoVelocity -= .62 * dt; dinoY = Math.max(0, dinoY + dinoVelocity * dt); if (dinoY === 0) dinoVelocity = 0; obstacleX -= (4.1 + Math.min(dinoTime / 800, 3)) * dt; if (obstacleX < -20) obstacleX = dinoWidth() + Math.random() * 180; if (obstacleX < 100 && obstacleX > 42 && dinoY < 25) finishDino(); paintDino(); dinoRaf = dinoRunning ? requestAnimationFrame(dinoFrame) : 0; };
  const jumpDino = () => { if (arcade.activeId !== 'dino' || arcade.paused) return; if (!dinoRunning) { dinoRunning = true; dinoTime = 0; obstacleX = dinoWidth() * .88; dinoLast = 0; $('dino-status').textContent = 'Off you go!'; dinoRaf = requestAnimationFrame(dinoFrame); } if (dinoY === 0) dinoVelocity = 11; };
  $('dino-start').addEventListener('click', jumpDino); canvas.addEventListener('pointerdown', jumpDino);
  window.addEventListener('keydown', (event) => { if (event.code === 'Space' && arcade.activeId === 'dino' && !arcade.paused) { event.preventDefault(); jumpDino(); } });
  const syncDino = () => { if (dinoRaf && (arcade.activeId !== 'dino' || arcade.paused)) { cancelAnimationFrame(dinoRaf); dinoRaf = 0; } else if (dinoRunning && arcade.activeId === 'dino' && !arcade.paused && !dinoRaf) { dinoLast = 0; dinoRaf = requestAnimationFrame(dinoFrame); } };
  paintDino();

  // Windows are draggable only inside the retro screen, never browser windows.
  panels.get('retro-desktop').querySelectorAll('[data-retro-open]').forEach((button) => button.addEventListener('click', () => { const win = panels.get('retro-desktop').querySelector('[data-retro-window="' + button.dataset.retroOpen + '"]'); if (win) win.hidden = false; }));
  panels.get('retro-desktop').querySelectorAll('[data-retro-close]').forEach((button) => button.addEventListener('click', () => { button.closest('.retro-window').hidden = true; }));
  panels.get('retro-desktop').querySelectorAll('.retro-window header').forEach((header) => { let drag = null; const win = header.closest('.retro-window'); header.addEventListener('pointerdown', (event) => { if (event.target.closest('button')) return; drag = { x: event.clientX - win.offsetLeft, y: event.clientY - win.offsetTop }; header.setPointerCapture(event.pointerId); }); header.addEventListener('pointermove', (event) => { if (!drag) return; const bounds = win.parentElement.getBoundingClientRect(); win.style.left = clamp(event.clientX - bounds.left - drag.x, 0, bounds.width - win.offsetWidth) + 'px'; win.style.top = clamp(event.clientY - bounds.top - drag.y, 0, bounds.height - win.offsetHeight - 28) + 'px'; }); const stop = () => { drag = null; }; header.addEventListener('pointerup', stop); header.addEventListener('pointercancel', stop); });

  // Small bundled Wordle-style word list; duplicate letters are marked correctly.
  const words = ['quiet', 'dream', 'piano', 'petal', 'cider', 'flute', 'smile', 'cloud', 'mango', 'shine', 'heart', 'cocoa', 'fairy', 'tulip', 'orbit', 'night'];
  const date = new Date().toISOString().slice(0, 10); let word = ''; let guesses = []; let wordDone = false;
  const getDailyWord = () => { let hash = 2166136261; for (const char of date) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return words[(hash >>> 0) % words.length]; };
  const marksFor = (guess) => { const marks = Array(5).fill('absent'); const remaining = word.split(''); for (let i = 0; i < 5; i += 1) if (guess[i] === word[i]) { marks[i] = 'correct'; remaining[i] = ''; } for (let i = 0; i < 5; i += 1) if (marks[i] !== 'correct') { const match = remaining.indexOf(guess[i]); if (match >= 0) { marks[i] = 'present'; remaining[match] = ''; } } return marks; };
  const paintWord = () => { $('wordle-grid').replaceChildren(...Array.from({ length: 6 }, (_, row) => { const line = document.createElement('div'); line.className = 'wordle-row'; line.setAttribute('role', 'row'); const guess = guesses[row] || ''; const marks = row < guesses.length ? marksFor(guess) : []; for (let i = 0; i < 5; i += 1) { const tile = document.createElement('span'); tile.className = 'wordle-tile' + (marks[i] ? ' ' + marks[i] : ''); tile.setAttribute('role', 'gridcell'); tile.textContent = guess[i] || ''; line.append(tile); } return line; })); };
  const resetWord = () => { word = getDailyWord(); guesses = []; wordDone = false; $('wordle-input').disabled = false; $('wordle-submit').disabled = false; $('wordle-status').textContent = 'A new word every day. Six guesses, right here offline.'; paintWord(); };
  const submitWord = () => { if (wordDone) return; const guess = $('wordle-input').value.trim().toLowerCase(); if (!/^[a-z]{5}$/.test(guess)) { $('wordle-status').textContent = 'Please enter exactly five letters.'; return; } if (!words.includes(guess)) { $('wordle-status').textContent = 'That word is not in the little local dictionary. Try a bundled word.'; return; } guesses.push(guess); $('wordle-input').value = ''; paintWord(); if (guess === word) { wordDone = true; $('wordle-status').textContent = 'Lovely! Solved in ' + guesses.length + ' tries.'; } else if (guesses.length === 6) { wordDone = true; $('wordle-status').textContent = 'Today’s word was ' + word.toUpperCase() + '. Tomorrow brings another.'; } else $('wordle-status').textContent = (6 - guesses.length) + ' guesses left. Green is just right; gold is in the word.'; };
  $('wordle-submit').addEventListener('click', submitWord); $('wordle-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') submitWord(); }); $('wordle-reset').addEventListener('click', resetWord); resetWord();

  // Local Connect Four opponent prefers wins, then blocks a player's immediate win.
  const connectBoard = $('connect-board'); const connectRows = 6; const connectColumns = 7; let connectCells = Array(connectRows * connectColumns).fill(0); let connectTurn = 1; let connectOver = false; let connectWins = 0;
  const connectAt = (row, column) => connectCells[row * connectColumns + column];
  const connectResult = (player) => {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let row = 0; row < connectRows; row += 1) for (let column = 0; column < connectColumns; column += 1) if (connectAt(row, column) === player) {
      for (const [dr, dc] of directions) {
        const line = [];
        for (let step = 0; step < 4; step += 1) { const r = row + dr * step; const c = column + dc * step; if (r < 0 || r >= connectRows || c < 0 || c >= connectColumns || connectAt(r, c) !== player) break; line.push(r * connectColumns + c); }
        if (line.length === 4) return line;
      }
    }
    return null;
  };
  const connectDrop = (column, player) => { for (let row = connectRows - 1; row >= 0; row -= 1) if (!connectAt(row, column)) { connectCells[row * connectColumns + column] = player; return row; } return -1; };
  const drawConnect = (winLine = []) => { connectBoard.replaceChildren(...Array.from({ length: connectRows }, (_, row) => Array.from({ length: connectColumns }, (_, column) => { const index = row * connectColumns + column; const button = document.createElement('button'); button.type = 'button'; button.className = 'connect-cell player-' + connectAt(row, column) + (winLine.includes(index) ? ' is-winning' : ''); button.setAttribute('role', 'gridcell'); button.setAttribute('aria-label', 'Row ' + (row + 1) + ', column ' + (column + 1) + ', ' + (connectAt(row, column) === 1 ? 'you' : connectAt(row, column) === 2 ? 'Vesper' : 'empty')); button.disabled = connectOver || Boolean(connectAt(row, column)); button.addEventListener('click', () => playConnect(column)); return button; })).flat()); };
  const finishConnect = (winner) => { connectOver = true; if (winner === 1) { connectWins += 1; $('connect-wins').textContent = String(connectWins); $('connect-status').textContent = 'Four in a row! You beat me, senpai.'; arcade.reportScore('connect-four', connectWins); arcade.react('joy', { game: 'connect-four', winner: 'user' }); } else if (winner === 2) { $('connect-status').textContent = 'I got four. You were close, though.'; arcade.react('happy', { game: 'connect-four', winner: 'vesper' }); } else $('connect-status').textContent = 'A full board and a draw. Rematch?'; drawConnect(winner ? connectResult(winner) || [] : []); };
  const chooseConnectMove = () => {
    const available = Array.from({ length: connectColumns }, (_, column) => column).filter((column) => connectAt(0, column) === 0);
    for (const player of [2, 1]) for (const column of available) { const row = connectRows - 1 - [...Array(connectRows)].findIndex((_, index) => connectAt(connectRows - 1 - index, column) === 0); if (row < 0) continue; connectCells[row * connectColumns + column] = player; const win = connectResult(player); connectCells[row * connectColumns + column] = 0; if (win) return column; }
    return available.includes(3) ? 3 : available[Math.floor(Math.random() * available.length)];
  };
  const playConnect = (column) => {
    if (connectOver || connectTurn !== 1) return; const row = connectDrop(column, 1); if (row < 0) return; let win = connectResult(1); if (win) { finishConnect(1); return; } if (connectCells.every(Boolean)) { finishConnect(0); return; }
    connectTurn = 2; $('connect-status').textContent = 'Vesper is considering the board…'; drawConnect();
    window.setTimeout(() => { if (connectOver || arcade.activeId !== 'connect-four') return; connectDrop(chooseConnectMove(), 2); win = connectResult(2); if (win) { finishConnect(2); return; } if (connectCells.every(Boolean)) { finishConnect(0); return; } connectTurn = 1; $('connect-status').textContent = 'Your move.'; drawConnect(); }, 260);
  };
  const resetConnect = () => { connectCells = Array(connectRows * connectColumns).fill(0); connectTurn = 1; connectOver = false; $('connect-status').textContent = 'You are pink. Make the first move.'; drawConnect(); };
  $('connect-reset').addEventListener('click', resetConnect); resetConnect();
  appStore.ready.then(() => { connectWins = Math.floor(clamp(Number(appStore.get('workspace.arcade.scores.connect-four', 0)) || 0, 0, 1e9)); $('connect-wins').textContent = String(connectWins); });

  // Five question local quiz; no remote content, search, or model calls.
  const questions = [['Which planet has the largest rings?', ['Saturn', 'Mars', 'Mercury'], 0], ['What is a pattern formed by stars called?', ['A nebula', 'A constellation', 'A comet'], 1], ['Which instrument usually has 88 keys?', ['Harp', 'Piano', 'Flute'], 1], ['What do bees collect from flowers?', ['Nectar', 'Pebbles', 'Dew only'], 0], ['Which is the largest ocean?', ['Arctic', 'Atlantic', 'Pacific'], 2], ['How many sides does a hexagon have?', ['Five', 'Six', 'Eight'], 1], ['Which animal has black-and-white stripes?', ['Zebra', 'Lemur', 'Otter'], 0]];
  let quizDeck = []; let quizIndex = 0; let quizScore = 0; let quizLocked = false;
  const beginQuiz = () => { quizDeck = [...questions.keys()].sort(() => Math.random() - .5).slice(0, 5); quizIndex = 0; quizScore = 0; drawQuestion(); };
  const drawQuestion = () => { const question = questions[quizDeck[quizIndex]]; $('trivia-count').textContent = 'QUESTION ' + (quizIndex + 1) + ' / 5 · ' + quizScore + ' RIGHT'; $('trivia-question').textContent = question[0]; $('trivia-feedback').textContent = 'Choose an answer.'; quizLocked = false; $('trivia-next').hidden = true; $('trivia-options').replaceChildren(...question[1].map((answer, index) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = answer; button.addEventListener('click', () => { if (quizLocked) return; quizLocked = true; const correct = index === question[2]; if (correct) { quizScore += 1; arcade.react('happy', { game: 'trivia', score: quizScore }); } $('trivia-feedback').textContent = correct ? 'That is right! Vesper is impressed.' : 'Not quite. The answer was ' + question[1][question[2]] + '.'; $('trivia-next').textContent = quizIndex === 4 ? 'PLAY AGAIN' : 'NEXT QUESTION'; $('trivia-next').hidden = false; }); return button; })); };
  $('trivia-next').addEventListener('click', () => { if (quizIndex >= 4) beginQuiz(); else { quizIndex += 1; drawQuestion(); } }); beginQuiz();

  // A generated star map with three local, imaginary constellations.
  const sky = $('planet-canvas'); const skyCtx = sky.getContext('2d'); let starPoints = [];
  const paintSky = () => { const { width, height } = fitCanvas(sky, skyCtx, 350, 760); const gradient = skyCtx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, '#0d1226'); gradient.addColorStop(1, '#26152d'); skyCtx.fillStyle = gradient; skyCtx.fillRect(0, 0, width, height); starPoints = Array.from({ length: 110 }, () => ({ x: Math.random() * width, y: Math.random() * height, radius: .6 + Math.random() * 1.8, name: ['Mira', 'Suzu', 'Nami', 'Aster', 'Hoshi'][Math.floor(Math.random() * 5)] })); skyCtx.strokeStyle = '#c8abff42'; [[4, 19, 30, 44, 71], [12, 36, 58, 80], [9, 24, 51, 95]].forEach((path) => { skyCtx.beginPath(); path.forEach((index, step) => { const star = starPoints[index]; if (step) skyCtx.lineTo(star.x, star.y); else skyCtx.moveTo(star.x, star.y); }); skyCtx.stroke(); }); for (const star of starPoints) { skyCtx.fillStyle = '#e8ddff'; skyCtx.shadowColor = '#c8abff'; skyCtx.shadowBlur = 8; skyCtx.beginPath(); skyCtx.arc(star.x, star.y, star.radius, 0, Math.PI * 2); skyCtx.fill(); } skyCtx.shadowBlur = 0; };
  const skyResize = new ResizeObserver(paintSky); skyResize.observe(sky);
  sky.addEventListener('pointerdown', (event) => { if (!starPoints.length) return; const rect = sky.getBoundingClientRect(); const x = (event.clientX - rect.left) * sky.width / rect.width / Math.min(devicePixelRatio || 1, 2); const y = (event.clientY - rect.top) * sky.height / rect.height / Math.min(devicePixelRatio || 1, 2); let nearest = starPoints[0]; for (const star of starPoints) if (Math.hypot(star.x - x, star.y - y) < Math.hypot(nearest.x - x, nearest.y - y)) nearest = star; $('planet-status').textContent = nearest.name + ': a small, imaginary star in Vesper’s pocket sky.'; });

  let toySaveTimer = 0;
  const persistToyBest = () => { const latest = appStore.get('workspace.arcade', {}) || {}; appStore.set('workspace.arcade', { ...latest, toys: { ...(latest.toys || {}), dinoBest } }); };
  const saveToys = () => { window.clearTimeout(toySaveTimer); toySaveTimer = window.setTimeout(persistToyBest, 180); };
  window.addEventListener('vesper:arcade-state', () => { syncCats(); syncDino(); });
  window.addEventListener('pagehide', () => { if (toySaveTimer) { window.clearTimeout(toySaveTimer); toySaveTimer = 0; persistToyBest(); } });
  appStore.ready.then(() => { dinoBest = Math.floor(clamp(Number(appStore.get('workspace.arcade.toys.dinoBest', 0)) || 0, 0, 1e9)); $('dino-best').textContent = String(dinoBest); });
}
