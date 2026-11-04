/**
 * arcade-expansion-pack.js — 30 original, fully offline arcade modules.
 *
 * These push the registry past the 80-module vision using only the arcade
 * lifecycle API from arcade-framework.js. Every game is implemented here in
 * plain DOM or canvas: no network, no assets, no third-party embeds.
 *
 * Each module gets a small context object that owns its timers, key handlers,
 * animation frame and score reporting, so pausing or exiting a game always
 * stops its work — the same lifecycle discipline the other arcade packs use.
 */

const mk = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
};

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const shuffle = (list) => {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function fitCanvas(canvas, context, height, fallbackWidth) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || fallbackWidth;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width, height, ratio };
}

/** Build a panel scaffold: title, help, a body, a toolbar and a status line. */
function scaffold(panel, title, jp, help) {
  const heading = mk('h2', null, title);
  heading.append(mk('span', 'jp', jp));
  panel.append(heading);
  panel.append(mk('p', 'game-help', help));
  const body = mk('div', 'exp-body');
  const toolbar = mk('div', 'game-toolbar');
  const status = mk('p', 'game-result', 'Ready when you are.');
  status.setAttribute('role', 'status');
  panel.append(body, toolbar, status);
  return { body, toolbar, status };
}

function button(label, onClick, kind = 'primary-button') {
  const node = mk('button', kind, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** A clickable grid helper used by most of the puzzle modules. */
function grid(body, cells, columns, onCell) {
  const wrap = mk('div', 'exp-grid');
  wrap.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  for (let i = 0; i < cells; i += 1) {
    const cell = mk('button', 'exp-cell', '');
    cell.type = 'button';
    cell.dataset.index = String(i);
    cell.addEventListener('click', () => onCell(i, cell));
    wrap.append(cell);
  }
  body.append(wrap);
  return wrap;
}

const WORDS = {
  short: ['STAR', 'MOON', 'CLOUD', 'BLOOM', 'NEON', 'PIXEL', 'WAVE', 'EMBER', 'FROST', 'ORBIT', 'PLUME', 'QUARTZ', 'RIVER', 'SPARK', 'TIGER', 'VELOC'],
  long: ['ASTERISM', 'BASEMENT', 'COMPASS', 'DRAGONFLY', 'EMBERFALL', 'FOOTHILL', 'GLACIER', 'HARBORWAY', 'INKSTONE', 'JUNCTION', 'KEYSTONE', 'LANTERNS', 'MOSAIC', 'NIMBUS', 'OBSIDIAN', 'PENDULUM'],
};

/* ================================================================== *
 *  Module definitions
 * ================================================================== */

const MODULES = [
  {
    id: 'lights-out', title: 'Lights out', jp: '消灯ゲーム', help: 'Switch every light off. Each click flips the tile and its four neighbours.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Lights out', '消灯ゲーム', 'Switch every light off. Each click flips the tile and its four neighbours.');
      const SIZE = 5;
      let moves = 0;
      const cells = grid(body, SIZE * SIZE, SIZE, (index) => {
        toggle(index % SIZE, Math.floor(index / SIZE));
        moves += 1;
        const left = cells.querySelectorAll('.is-on').length;
        status.textContent = `${moves} move(s) · ${left} light(s) left`;
        if (!left) {
          status.textContent = `Every light is out in ${moves} moves.`;
          ctx.score(moves, { lowerIsBetter: true });
          ctx.arcade.react('happy', { game: 'lights-out' });
        }
      });
      const toggle = (x, y) => {
        [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) return;
          cells.children[ny * SIZE + nx].classList.toggle('is-on');
        });
      };
      const reset = () => {
        moves = 0;
        [...cells.children].forEach((cell) => cell.classList.remove('is-on'));
        // Only legal moves are applied, so the board is always solvable.
        for (let i = 0; i < SIZE * SIZE; i += 1) if (Math.random() < 0.4) toggle(i % SIZE, Math.floor(i / SIZE));
        status.textContent = `${cells.querySelectorAll('.is-on').length} light(s) to clear.`;
      };
      toolbar.append(button('NEW BOARD', reset), button('HINT', () => {
        const on = cells.querySelectorAll('.is-on').length;
        status.textContent = on ? `Still ${on} light(s) lit. Try a corner tile that is on.` : 'Already solved.';
      }, 'quiet-button'));
      ctx.enter = reset;
    },
  },
  {
    id: 'simon-says', title: 'Pad echo', jp: 'お手本おぼえ', help: 'Watch the pads, then repeat the pattern. It grows by one each round.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Pad echo', 'お手本おぼえ', 'Watch the pads, then repeat the pattern. It grows by one each round.');
      const pads = [];
      const wrap = mk('div', 'exp-pads');
      for (let i = 0; i < 4; i += 1) {
        const pad = mk('button', 'exp-pad', String(i + 1));
        pad.type = 'button';
        pad.style.setProperty('--pad-hue', String(i * 90));
        pad.addEventListener('click', () => press(i));
        pads.push(pad);
        wrap.append(pad);
      }
      body.append(wrap);
      let sequence = []; let step = 0; let accepting = false; let best = 0;
      const flash = (index) => {
        pads[index].classList.add('is-lit');
        ctx.after(320, () => pads[index].classList.remove('is-lit'));
      };
      const playSequence = () => {
        accepting = false;
        status.textContent = 'Watch…';
        sequence.forEach((value, i) => ctx.after(600 + i * 560, () => flash(value)));
        ctx.after(600 + sequence.length * 560, () => { accepting = true; step = 0; status.textContent = `Your turn — ${sequence.length} step(s).`; });
      };
      const nextRound = () => { sequence.push(randomInt(0, 3)); playSequence(); };
      const press = (index) => {
        if (!accepting) return;
        flash(index);
        if (sequence[step] === index) {
          step += 1;
          if (step === sequence.length) {
            best = Math.max(best, sequence.length);
            status.textContent = `Round complete — ${sequence.length} steps. Best ${best}.`;
            ctx.score(best);
            accepting = false;
            ctx.after(900, nextRound);
          }
        } else {
          accepting = false;
          status.textContent = `Wrong pad. You reached ${sequence.length - 1} steps.`;
          ctx.arcade.react('sad', { game: 'simon-says' });
          sequence = []; best = 0;
          ctx.after(1200, nextRound);
        }
      };
      toolbar.append(button('START', () => { sequence = []; best = 0; nextRound(); }));
      ctx.enter = () => { sequence = []; best = 0; status.textContent = 'Press start to begin.'; };
      ctx.exit = () => { accepting = false; };
    },
  },
  {
    id: 'quick-math', title: 'Quick math', jp: '計算ドリル', help: 'Thirty seconds of arithmetic. Pick the right answer as fast as you can.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Quick math', '計算ドリル', 'Thirty seconds of arithmetic. Pick the right answer as fast as you can.');
      const question = mk('div', 'exp-question', '—');
      const answers = mk('div', 'exp-answers');
      body.append(question, answers);
      let score = 0; let timeLeft = 30; let correct = 0;
      const newQuestion = () => {
        const a = randomInt(2, 12); const b = randomInt(2, 12);
        const ops = ['+', '−', '×'];
        const op = ops[randomInt(0, 2)];
        const value = op === '+' ? a + b : op === '−' ? a - b : a * b;
        question.textContent = `${a} ${op} ${b}`;
        const options = new Set([value]);
        while (options.size < 4) options.add(value + randomInt(-6, 6));
        answers.replaceChildren(...shuffle([...options]).map((option) => button(String(option), () => {
          if (option === value) { score += 1; correct += 1; ctx.arcade.react('happy', { game: 'quick-math' }); } else { score = Math.max(0, score - 1); }
          status.textContent = `${score} point(s) · ${correct} correct`;
          newQuestion();
        }, 'quiet-button')));
      };
      toolbar.append(button('START 30s', () => {
        score = 0; correct = 0; timeLeft = 30;
        newQuestion();
        status.textContent = '30 seconds on the clock.';
        ctx.every(1000, () => {
          timeLeft -= 1;
          status.textContent = `${timeLeft}s · ${score} point(s)`;
          if (timeLeft <= 0) {
            ctx.clearIntervals();
            question.textContent = 'Time!';
            answers.replaceChildren();
            status.textContent = `Score ${score} with ${correct} correct.`;
            ctx.score(score);
          }
        });
      }));
      ctx.enter = () => { question.textContent = '—'; answers.replaceChildren(); status.textContent = 'Press start.'; };
      ctx.exit = () => { ctx.clearIntervals(); };
    },
  },
  {
    id: 'breakout', title: 'Brick breaker', jp: 'れんがくずし', help: 'Move the paddle with the pointer or arrow keys and clear the wall.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Brick breaker', 'れんがくずし', 'Move the paddle with the pointer or arrow keys and clear the wall.');
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Brick breaker canvas');
      body.append(canvas);
      const context = canvas.getContext('2d');
      const state = { paddle: 60, ballX: 0, ballY: 0, vx: 3.2, vy: -3.2, bricks: [], lives: 3, score: 0, running: false };
      const resetBall = () => { state.ballX = state.paddle; state.ballY = 210; state.vy = -3.2; state.vx = Math.random() < 0.5 ? -3.2 : 3.2; };
      const buildWall = () => {
        state.bricks = [];
        for (let row = 0; row < 4; row += 1) for (let col = 0; col < 9; col += 1) state.bricks.push({ x: 12 + col * 78, y: 26 + row * 20, alive: true, hue: row * 40 });
      };
      const draw = ({ width, height }) => {
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, width, height);
        state.bricks.forEach((brick) => {
          if (!brick.alive) return;
          context.fillStyle = `hsl(${brick.hue + 200} 70% 62%)`;
          context.fillRect(brick.x, brick.y, 70, 13);
        });
        context.fillStyle = '#e8ecf5'; context.fillRect(state.paddle - 34, height - 18, 68, 8);
        context.beginPath(); context.arc(state.ballX, state.ballY, 6, 0, Math.PI * 2); context.fillStyle = '#f0c274'; context.fill();
      };
      ctx.onFrame(() => {
        const { width, height } = fitCanvas(canvas, context, 300, 720);
        if (state.running) {
          state.ballX += state.vx; state.ballY += state.vy;
          if (state.ballX < 8 || state.ballX > width - 8) state.vx *= -1;
          if (state.ballY < 8) state.vy *= -1;
          if (state.ballY > height - 26 && state.ballY < height - 10 && Math.abs(state.ballX - state.paddle) < 38 && state.vy > 0) {
          // Paddle contact: bounce, and steer by where the ball landed on it.
            state.vy *= -1;
            state.vx += (state.ballX - state.paddle) * 0.08;
            state.vx = Math.max(-5.5, Math.min(5.5, state.vx));
          }
          state.bricks.forEach((brick) => {
            if (!brick.alive) return;
            if (state.ballX > brick.x - 6 && state.ballX < brick.x + 76 && state.ballY > brick.y - 6 && state.ballY < brick.y + 19) {
              brick.alive = false; state.vy *= -1; state.score += 10;
              status.textContent = `${state.score} point(s) · ${state.lives} life(s)`;
            }
          });
          if (state.bricks.every((brick) => !brick.alive)) {
            state.running = false;
            status.textContent = `Wall cleared with ${state.score} points.`;
            ctx.score(state.score);
            ctx.arcade.react('happy', { game: 'breakout' });
          }
          if (state.ballY > height + 10) {
            state.lives -= 1;
            if (state.lives <= 0) {
              state.running = false;
              status.textContent = `Out of lives at ${state.score} points.`;
              ctx.score(state.score);
            } else resetBall();
          }
        }
        draw({ width, height });
      });
      const move = (delta) => {
        const width = canvas.clientWidth || 720;
        state.paddle = Math.max(40, Math.min(width - 40, state.paddle + delta));
      };
      ctx.onKey((event) => {
        if (event.key === 'ArrowLeft') { move(-26); event.preventDefault(); }
        if (event.key === 'ArrowRight') { move(26); event.preventDefault(); }
        if (event.key === ' ' && !state.running) { resetBall(); state.running = true; event.preventDefault(); }
      });
      canvas.addEventListener('pointermove', (event) => {
        const rect = canvas.getBoundingClientRect();
        state.paddle = Math.max(40, Math.min(rect.width - 40, event.clientX - rect.left));
      });
      toolbar.append(button('LAUNCH', () => { state.lives = 3; state.score = 0; buildWall(); resetBall(); state.running = true; status.textContent = 'Three lives. Clear the wall.'; }));
      ctx.enter = () => { buildWall(); resetBall(); };
      ctx.exit = () => { state.running = false; };
    },
  },
  {
    id: 'flappy-orb', title: 'Flappy orb', jp: 'そらとぶオーブ', help: 'Tap, click, or press Space to flap between the pillars.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Flappy orb', 'そらとぶオーブ', 'Tap, click, or press Space to flap between the pillars.');
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Flappy orb canvas');
      body.append(canvas);
      const context = canvas.getContext('2d');
      const state = { y: 0, vy: 0, pipes: [], score: 0, running: false, best: 0 };
      const flap = () => { if (!state.running) return; state.vy = -5.4; };
      canvas.addEventListener('pointerdown', flap);
      ctx.onKey((event) => { if (event.code === 'Space') { flap(); event.preventDefault(); } });
      ctx.onFrame(() => {
        const { width, height } = fitCanvas(canvas, context, 260, 720);
        if (!state.running) state.y = height / 2;
        if (state.running) {
          state.vy += 0.26; state.y += state.vy;
          state.pipes.forEach((pipe) => { pipe.x -= 2.4; });
          if (state.pipes.length && state.pipes[0].x < -50) {
            state.pipes.shift();
            state.score += 1;
            status.textContent = `${state.score} pillar(s) cleared · best ${state.best}`;
          }
          if (!state.pipes.length || state.pipes.at(-1).x < width - 200) {
            const gapY = randomInt(60, height - 130);
            state.pipes.push({ x: width + 20, gapY, gap: 92 });
          }
          for (const pipe of state.pipes) {
            if (pipe.x < 40 && pipe.x + 44 > 12 && (state.y < pipe.gapY || state.y > pipe.gapY + pipe.gap)) {
              state.running = false;
              state.best = Math.max(state.best, state.score);
              status.textContent = `Crashed at ${state.score}. Best ${state.best}.`;
              ctx.score(state.best);
            }
          }
          if (state.y > height - 8 || state.y < 8) {
            state.running = false;
            state.best = Math.max(state.best, state.score);
            status.textContent = `Out of sky at ${state.score}. Best ${state.best}.`;
            ctx.score(state.best);
          }
        }
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, width, height);
        state.pipes.forEach((pipe) => {
          context.fillStyle = '#3f7d5a';
          context.fillRect(pipe.x, 0, 44, pipe.gapY);
          context.fillRect(pipe.x, pipe.gapY + pipe.gap, 44, height);
        });
        context.beginPath(); context.arc(26, state.y, 11, 0, Math.PI * 2);
        context.fillStyle = '#f0c274'; context.fill();
      });
      toolbar.append(button('FLY', () => { state.pipes = []; state.score = 0; state.vy = -4; state.running = true; status.textContent = 'Flap between the pillars.'; }));
      ctx.enter = () => { state.pipes = []; state.running = false; };
      ctx.exit = () => { state.running = false; };
    },
  },
  {
    id: 'hangman', title: 'Word rescue', jp: 'なぞなぞ', help: 'Guess the hidden word one letter at a time before the drawing completes.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Word rescue', 'なぞなぞ', 'Guess the hidden word one letter at a time before the drawing completes.');
      const board = mk('div', 'exp-word');
      const drawing = mk('div', 'exp-drawing', '');
      const keys = mk('div', 'exp-keys');
      body.append(drawing, board, keys);
      drawing.style.whiteSpace = 'pre';
      const hangmanFrame = (...lines) => lines.join('\n');
      const GALLOWS = [
        '',
        hangmanFrame('  ┌─┐', '  │', '  │', '  │', '  │'),
        hangmanFrame('  ┌─┐', '  │  O', '  │', '  │', '  │'),
        hangmanFrame('  ┌─┐', '  │  O', '  │ /|', '  │', '  │'),
        hangmanFrame('  ┌─┐', '  │  O', '  │ /|╱', '  │', '  │'),
        hangmanFrame('  ┌─┐', '  │  O', '  │ /|╱', '  │ ╲ ╱', '  │'),
        hangmanFrame('  ┌─┐', '  │  O', '  │ /|╱', '  │ ╲ ╱', '  └────'),
      ];
      let word = ''; let guessed = new Set(); let wrong = 0;
      const reveal = () => [...word].map((letter) => (guessed.has(letter) ? letter : '_')).join(' ');
      const draw = () => { drawing.textContent = GALLOWS[Math.min(wrong, 6)]; };
      const won = () => [...word].every((letter) => guessed.has(letter));
      const guess = (letter) => {
        if (guessed.has(letter) || won() || wrong >= 6) return;
        guessed.add(letter);
        if (!word.includes(letter)) wrong += 1;
        board.textContent = reveal();
        draw();
        if (won()) {
          status.textContent = `You rescued “${word}” with ${6 - wrong} mistakes to spare.`;
          ctx.score(6 - wrong);
          keys.replaceChildren();
          ctx.arcade.react('happy', { game: 'hangman' });
        } else if (wrong >= 6) {
          status.textContent = `The word was “${word}”.`;
          keys.replaceChildren();
        }
      };
      keys.replaceChildren(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => button(letter, () => guess(letter), 'quiet-button')));
      toolbar.append(button('NEW WORD', () => {
        word = Math.random() < 0.5 ? shuffle(WORDS.short)[0] : shuffle(WORDS.long)[0];
        guessed = new Set(); wrong = 0;
        board.textContent = reveal(); draw();
        status.textContent = `${word.length} letters to rescue.`;
        keys.replaceChildren(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => button(letter, () => guess(letter), 'quiet-button')));
      }));
      ctx.enter = () => { board.textContent = 'Press new word.'; drawing.textContent = ''; };
    },
  },
  {
    id: 'mastermind', title: 'Code breaker', jp: 'コードブレイカー', help: 'Crack the four-colour code. Feedback shows exact and misplaced pegs.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Code breaker', 'コードブレイカー', 'Crack the four-colour code. Feedback shows exact and misplaced pegs.');
      const palette = ['#e06c75', '#98c379', '#61afef', '#c678dd', '#e5c07b', '#56b6c2'];
      const historyNode = mk('div', 'exp-history');
      const picker = mk('div', 'exp-pads');
      body.append(historyNode, picker);
      let secret = []; let guess = [0, 0, 0, 0]; let tries = 0;
      const renderPicker = () => {
        picker.replaceChildren(...guess.map((value, index) => {
          const peg = mk('button', 'exp-peg', '');
          peg.type = 'button';
          peg.style.background = palette[value];
          peg.addEventListener('click', () => { guess[index] = (value + 1) % palette.length; renderPicker(); });
          return peg;
        }));
      };
      const judge = () => {
        const copy = secret.slice();
        let exact = 0; let partial = 0;
        guess.forEach((value, index) => { if (copy[index] === value) { exact += 1; copy[index] = null; } });
        guess.forEach((value) => { const at = copy.indexOf(value); if (at !== -1) { partial += 1; copy[at] = null; } });
        return { exact, partial };
      };
      toolbar.append(button('GUESS', () => {
        tries += 1;
        const { exact, partial } = judge();
        const row = mk('div', 'exp-history-row');
        guess.forEach((value) => { const peg = mk('span', 'exp-peg'); peg.style.background = palette[value]; row.append(peg); });
        row.append(mk('span', 'exp-feedback', `${exact}● ${partial}◐ · try ${tries}`));
        historyNode.prepend(row);
        if (exact === 4) {
          status.textContent = `Code broken in ${tries} tries.`;
          ctx.score(tries, { lowerIsBetter: true });
          ctx.arcade.react('happy', { game: 'mastermind' });
        } else status.textContent = `${exact} exact, ${partial} misplaced.`;
      }));
      ctx.enter = () => {
        secret = [0, 1, 2, 3].map(() => randomInt(0, palette.length - 1));
        tries = 0; guess = [0, 0, 0, 0];
        historyNode.replaceChildren(); renderPicker();
        status.textContent = 'Four pegs, six colours. Start guessing.';
      };
    },
  },
  {
    id: 'word-search', title: 'Word hunt', jp: 'ことばさがし', help: 'Find the hidden words in the letter grid by clicking the first and last letter.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Word hunt', 'ことばさがし', 'Find the hidden words in the letter grid by clicking the first and last letter.');
      const SIZE = 8;
      const listNode = mk('div', 'exp-wordlist');
      body.append(listNode);
      let board = []; let words = []; let found = []; let firstPick = null;
      const cells = grid(body, SIZE * SIZE, SIZE, (index, cell) => {
        const x = index % SIZE; const y = Math.floor(index / SIZE);
        if (!firstPick) {
          firstPick = { x, y };
          cell.classList.add('is-picked');
          status.textContent = 'Now pick the last letter of the word.';
          return;
        }
        const dx = x - firstPick.x; const dy = y - firstPick.y;
        if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) { resetPicks(); status.textContent = 'Words run in a straight line.'; return; }
        const length = Math.max(Math.abs(dx), Math.abs(dy)) + 1;
        const picked = [...Array(length)].map((_, i) => ({ x: firstPick.x + Math.sign(dx) * i, y: firstPick.y + Math.sign(dy) * i }));
        const text = picked.map((point) => board[point.y][point.x]).join('');
        const match = words.find((word) => (word === text || word === [...text].reverse().join('')) && !found.includes(word));
        if (match) {
          found.push(match);
          picked.forEach((point) => cells.children[point.y * SIZE + point.x].classList.add('is-found'));
          listNode.querySelector(`[data-word="${match}"]`)?.classList.add('is-found');
          status.textContent = found.length === words.length ? `All ${words.length} words found.` : `${found.length} of ${words.length} found.`;
          if (found.length === words.length) ctx.score(words.length);
        } else status.textContent = 'Not a hidden word there.';
        resetPicks();
      });
      const resetPicks = () => { firstPick = null; [...cells.children].forEach((cell) => cell.classList.remove('is-picked')); };
      const plant = () => {
        board = [...Array(SIZE)].map(() => Array(SIZE).fill(null));
        words = shuffle(WORDS.short).slice(0, 4);
        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        words.forEach((word) => {
          for (let attempt = 0; attempt < 200; attempt += 1) {
            const [dx, dy] = directions[randomInt(0, directions.length - 1)];
            const startX = randomInt(0, SIZE - 1); const startY = randomInt(0, SIZE - 1);
            const endX = startX + dx * (word.length - 1); const endY = startY + dy * (word.length - 1);
            if (endX < 0 || endY < 0 || endX >= SIZE || endY >= SIZE) continue;
            let ok = true;
            [...word].forEach((letter, i) => {
              const current = board[startY + dy * i][startX + dx * i];
              if (current && current !== letter) ok = false;
            });
            if (!ok) continue;
            [...word].forEach((letter, i) => { board[startY + dy * i][startX + dx * i] = letter; });
            break;
          }
        });
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) if (!board[y][x]) board[y][x] = alphabet[randomInt(0, 25)];
        [...cells.children].forEach((cell, i) => {
          cell.textContent = board[Math.floor(i / SIZE)][i % SIZE];
          cell.classList.remove('is-found', 'is-picked');
        });
        found = [];
        listNode.replaceChildren(...words.map((word) => mk('span', 'exp-word-chip', word)));
        [...listNode.children].forEach((chip, i) => chip.dataset.word = words[i]);
        status.textContent = `${words.length} words hidden in the grid.`;
      };
      toolbar.append(button('NEW GRID', plant));
      ctx.enter = () => { status.textContent = 'Press new grid to start.'; };
    },
  },
  {
    id: 'fifteen', title: 'Fifteen puzzle', jp: 'スライドパズル', help: 'Slide the tiles into order. Only the tile beside the gap can move.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Fifteen puzzle', 'スライドパズル', 'Slide the tiles into order. Only the tile beside the gap can move.');
      let tiles = []; let moves = 0;
      const cells = grid(body, 16, 4, (index) => {
        const gap = tiles.indexOf(0);
        const dx = Math.abs((index % 4) - (gap % 4));
        const dy = Math.abs(Math.floor(index / 4) - Math.floor(gap / 4));
        if (dx + dy !== 1) return;
        [tiles[index], tiles[gap]] = [tiles[gap], tiles[index]];
        moves += 1;
        paint();
        if (tiles.every((value, i) => value === (i + 1) % 16)) {
          status.textContent = `Solved in ${moves} moves.`;
          ctx.score(moves, { lowerIsBetter: true });
          ctx.arcade.react('happy', { game: 'fifteen' });
        }
      });
      const paint = () => {
        [...cells.children].forEach((cell, i) => {
          const value = tiles[i];
          cell.textContent = value ? String(value) : '';
          cell.classList.toggle('is-empty', !value);
        });
      };
      toolbar.append(button('SHUFFLE', () => {
        tiles = [...Array(16)].map((_, i) => (i + 1) % 16);
        moves = 0;
        for (let i = 0; i < 260; i += 1) {
          const gap = tiles.indexOf(0);
          const gx = gap % 4; const gy = Math.floor(gap / 4);
          const options = [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]].filter(([x, y]) => x >= 0 && y >= 0 && x < 4 && y < 4);
          const [nx, ny] = options[randomInt(0, options.length - 1)];
          [tiles[gap], tiles[ny * 4 + nx]] = [tiles[ny * 4 + nx], tiles[gap]];
        }
        paint();
        status.textContent = 'Tiles shuffled.';
      }));
      ctx.enter = () => { tiles = [...Array(16)].map((_, i) => (i + 1) % 16); paint(); status.textContent = 'Press shuffle to start.'; };
    },
  },
  {
    id: 'sokoban-lite', title: 'Box pusher', jp: 'はこ押し', help: 'Push every crate onto a target. Boxes never pull back.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Box pusher', 'はこ押し', 'Push every crate onto a target. Boxes never pull back.');
      // Each level is small, hand-checked and solvable: targets sit directly
      // above or beside the crates, and the player can always walk around them.
      const LEVELS = [
        ['#######', '#     #', '# .$. #', '#  $  #', '#  @  #', '#######'],
        ['#######', '#  .  #', '#  $  #', '#  .  #', '#  $  #', '#  @  #', '#######'],
        ['########', '#  ... #', '#  $$$ #', '#   @  #', '########'],
      ];
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Box pusher grid');
      body.append(canvas);
      const context = canvas.getContext('2d');
      let levelIndex = 0; let map = []; let moves = 0; let pushes = 0;
      const CELL = 34;
      const load = (index) => {
        map = LEVELS[index % LEVELS.length].map((row) => row.split(''));
        moves = 0; pushes = 0;
        status.textContent = `Level ${index + 1} — push every crate onto a target.`;
        draw();
      };
      const find = (char) => {
        for (let y = 0; y < map.length; y += 1) for (let x = 0; x < map[y].length; x += 1) if (map[y][x] === char) return { x, y };
        return null;
      };
      const draw = () => {
        const width = Math.max(...map.map((row) => row.length)) * CELL;
        const height = map.length * CELL;
        const { width: w, height: h } = fitCanvas(canvas, context, height, width);
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, w, h);
        map.forEach((row, y) => {
          [...row].forEach((tile, x) => {
            const px = x * CELL; const py = y * CELL;
            if (tile === '#') { context.fillStyle = '#2a3140'; context.fillRect(px, py, CELL - 1, CELL - 1); }
            else {
              context.fillStyle = '#141926'; context.fillRect(px, py, CELL - 1, CELL - 1);
              if (tile === '.' || tile === '*' || tile === '+') { context.strokeStyle = '#f0c274'; context.strokeRect(px + 7, py + 7, CELL - 15, CELL - 15); }
              if (tile === '@' || tile === '$') { context.fillStyle = '#61afef'; context.fillRect(px + 5, py + 5, CELL - 11, CELL - 11); }
              if (tile === '*' || tile === '+') { context.fillStyle = '#98c379'; context.fillRect(px + 9, py + 9, CELL - 19, CELL - 19); }
            }
          });
        });
      };
      const move = (dx, dy) => {
        const player = find('@') || find('+');
        if (!player) return;
        const nx = player.x + dx; const ny = player.y + dy;
        const target = map[ny]?.[nx];
        if (target === undefined || target === '#') return;
        if (target === '$' || target === '*') {
          const bx = nx + dx; const by = ny + dy;
          const beyond = map[by]?.[bx];
          if (beyond === undefined || beyond === '#' || beyond === '$' || beyond === '*') return;
          map[by][bx] = beyond === '.' ? '*' : '$';
          pushes += 1;
        }
        // Landing on a target leaves a marked crate, landing on floor does not.
        map[ny][nx] = (target === '*' ? '+' : '@');
        map[player.y][player.x] = (map[player.y][player.x] === '+') ? '.' : ' ';
        moves += 1;
        draw();
        const crates = map.flat().filter((tile) => tile === '$').length;
        const boxesOnTargets = map.flat().filter((tile) => tile === '*' || tile === '+').length;
        status.textContent = `${moves} moves · ${pushes} pushes · ${boxesOnTargets} crate(s) placed, ${crates} to go`;
        if (!crates) {
          status.textContent = `Level cleared in ${moves} moves.`;
          ctx.score(moves, { lowerIsBetter: true });
          levelIndex += 1;
          ctx.after(1200, () => load(levelIndex));
        }
      };
      ctx.onKey((event) => {
        const delta = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
        if (delta) { move(delta[0], delta[1]); event.preventDefault(); }
      });
      toolbar.append(button('RESTART LEVEL', () => load(levelIndex)));
      ctx.enter = () => load(levelIndex);
    },
  },
  {
    id: 'typist', title: 'Word fall', jp: 'タイピング', help: 'Type the falling words and press Enter. Let three through and it ends.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Word fall', 'タイピング', 'Type the falling words and press Enter. Let three through and it ends.');
      const field = mk('div', 'exp-field');
      const input = mk('input', 'exp-input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.placeholder = 'type the word, press enter';
      body.append(field, input);
      let falling = []; let score = 0; let missed = 0; let spawnTimer = 0;
      const spawn = () => {
        falling.push({ word: shuffle(Math.random() < 0.5 ? WORDS.short : WORDS.long)[0], x: randomInt(6, 70), y: 0, node: mk('div', 'exp-word-chip') });
        const item = falling.at(-1);
        item.node.textContent = item.word;
        item.node.style.left = `${item.x}%`;
        field.append(item.node);
      };
      ctx.onFrame(() => {
        falling.forEach((item) => {
          item.y += 0.35;
          item.node.style.top = `${item.y}%`;
        });
        const escaped = falling.filter((item) => item.y > 82);
        escaped.forEach((item) => item.node.remove());
        falling = falling.filter((item) => item.y <= 82);
        missed += escaped.length;
        if (missed >= 3) {
          ctx.clearIntervals();
          falling.forEach((item) => item.node.remove());
          falling = [];
          status.textContent = `Three words landed. You cleared ${score}.`;
          ctx.score(score);
          input.disabled = true;
        }
      });
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const value = input.value.trim().toUpperCase();
        input.value = '';
        const index = falling.findIndex((item) => item.word === value);
        if (index === -1) { status.textContent = `“${value}” is not on screen.`; return; }
        falling[index].node.remove();
        falling.splice(index, 1);
        score += 1;
        status.textContent = `${score} cleared · ${missed} escaped`;
        ctx.score(score);
      });
      toolbar.append(button('START', () => {
        input.disabled = false; input.focus();
        score = 0; missed = 0;
        spawnTimer = window.setInterval(() => { if (falling.length < 6) spawn(); }, 1800);
        ctx.timers.add(spawnTimer);
        status.textContent = 'Type what you see. Enter submits.';
      }));
      ctx.enter = () => { status.textContent = 'Press start. The field keeps only what is on screen.'; };
      ctx.exit = () => { window.clearInterval(spawnTimer); falling.forEach((item) => item.node.remove()); falling = []; input.disabled = true; };
    },
  },
  {
    id: 'rhythm-tap', title: 'Rhythm lanes', jp: 'リズム', help: 'Notes fall down four lanes. Tap D, F, J or K as they cross the line.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Rhythm lanes', 'リズム', 'Notes fall down four lanes. Tap D, F, J or K as they cross the line.');
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Rhythm lanes canvas');
      body.append(canvas);
      const context = canvas.getContext('2d');
      const KEYS = ['d', 'f', 'j', 'k'];
      let notes = []; let score = 0; let combo = 0; let running = false; let nextAt = 0;
      ctx.onFrame(({ now }) => {
        const { width, height } = fitCanvas(canvas, context, 260, 720);
        const laneWidth = width / 4;
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, width, height);
        context.strokeStyle = '#2a3140';
        for (let lane = 1; lane < 4; lane += 1) { context.beginPath(); context.moveTo(lane * laneWidth, 0); context.lineTo(lane * laneWidth, height); context.stroke(); }
        context.fillStyle = '#f0c274'; context.fillRect(0, height - 26, width, 3);
        if (running) {
          if (now > nextAt) { notes.push({ lane: randomInt(0, 3), y: -20, hit: false }); nextAt = now + randomInt(500, 1100); }
          notes.forEach((note) => { note.y += 3.4; });
          const escaped = notes.filter((note) => note.y > height + 20);
          if (escaped.length) { combo = 0; }
          notes = notes.filter((note) => note.y <= height + 20);
          escaped.forEach(() => { score = Math.max(0, score - 1); });
        }
        notes.forEach((note) => {
          context.fillStyle = note.hit ? '#3f7d5a' : '#61afef';
          context.fillRect(note.lane * laneWidth + 8, note.y, laneWidth - 16, 16);
        });
        KEYS.forEach((key, i) => {
          context.fillStyle = '#8a93a6';
          context.font = '11px monospace';
          context.fillText(key.toUpperCase(), i * laneWidth + laneWidth / 2 - 5, height - 8);
        });
      });
      ctx.onKey((event) => {
        const lane = KEYS.indexOf(event.key.toLowerCase());
        if (lane === -1) return;
        const { height } = fitCanvas(canvas, context, 260, 720);
        const target = notes.find((note) => note.lane === lane && Math.abs(note.y - (height - 30)) < 30 && !note.hit);
        if (target) { target.hit = true; score += 1; combo += 1; status.textContent = `${score} hit(s) · combo ${combo}`; ctx.score(score); }
        else { combo = 0; status.textContent = 'Miss — that lane was empty.'; }
      });
      toolbar.append(button('START', () => { notes = []; score = 0; combo = 0; running = true; nextAt = 0; status.textContent = 'D F J K — hit the line.'; }));
      ctx.enter = () => { running = false; notes = []; status.textContent = 'Press start.'; };
      ctx.exit = () => { running = false; notes = []; };
    },
  },
  {
    id: 'stroop', title: 'Colour call', jp: 'いろあわせ', help: 'Pick the ink colour, not the word. Thirty seconds on the clock.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Colour call', 'いろあわせ', 'Pick the ink colour, not the word. Thirty seconds on the clock.');
      const palette = ['#e06c75', '#98c379', '#61afef', '#e5c07b'];
      const names = ['RED', 'GREEN', 'BLUE', 'YELLOW'];
      const prompt = mk('div', 'exp-stroop', 'READY');
      const answers = mk('div', 'exp-answers');
      body.append(prompt, answers);
      let score = 0; let timeLeft = 30; let ink = 0; let running = false;
      const next = () => {
        ink = randomInt(0, palette.length - 1);
        const word = randomInt(0, palette.length - 1);
        prompt.textContent = names[word];
        prompt.style.color = palette[ink];
      };
      answers.replaceChildren(...palette.map((color, index) => {
        const chip = button(names[index], () => {
          if (!running) return;
          if (index === ink) { score += 1; next(); } else { score = Math.max(0, score - 2); }
          status.textContent = `${score} point(s) · ${timeLeft}s left`;
        }, 'quiet-button');
        chip.style.borderBottom = `3px solid ${color}`;
        return chip;
      }));
      toolbar.append(button('START 30s', () => {
        score = 0; timeLeft = 30; running = true;
        next(); status.textContent = 'Name the ink, not the word.';
        ctx.clearIntervals();
        ctx.every(1000, () => {
          timeLeft -= 1;
          status.textContent = `${timeLeft}s · ${score} point(s)`;
          if (timeLeft <= 0) {
            running = false;
            ctx.clearIntervals();
            prompt.textContent = 'TIME';
            prompt.style.color = '';
            status.textContent = `Final score ${score}.`;
            ctx.score(score);
          }
        });
      }));
      ctx.enter = () => { prompt.textContent = 'READY'; prompt.style.color = ''; status.textContent = 'Press start.'; };
      ctx.exit = () => { running = false; ctx.clearIntervals(); };
    },
  },
  {
    id: 'reversi-lite', title: 'Reversi', jp: 'リバーシ', help: 'Trap the opponent’s discs between yours. The greedy rival plays locally.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Reversi', 'リバーシ', 'Trap the opponent’s discs between yours. The greedy rival plays locally.');
      const SIZE = 6;
      let board = []; let turn = 1; let over = false;
      const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      const cells = grid(body, SIZE * SIZE, SIZE, (index) => play(index % SIZE, Math.floor(index / SIZE)));
      const flipsFor = (x, y, player) => {
        if (board[y][x] !== 0) return [];
        const flips = [];
        DIRS.forEach(([dx, dy]) => {
          const line = [];
          let cx = x + dx; let cy = y + dy;
          while (board[cy]?.[cx] !== undefined && board[cy][cx] === -player) { line.push({ x: cx, y: cy }); cx += dx; cy += dy; }
          if (line.length && board[cy]?.[cx] === player) flips.push(...line);
        });
        return flips;
      };
      const paint = () => {
        [...cells.children].forEach((cell, i) => {
          const value = board[Math.floor(i / SIZE)][i % SIZE];
          cell.textContent = value === 0 ? '' : value === 1 ? '●' : '○';
          cell.style.color = value === 1 ? '#98c379' : value === -1 ? '#e06c75' : '';
        });
      };
      const legalMoves = (player) => {
        const moves = [];
        for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) if (flipsFor(x, y, player).length) moves.push({ x, y });
        return moves;
      };
      const finish = () => {
        over = true;
        const count = board.flat().filter((value) => value === 1).length;
        const total = board.flat().filter((value) => value !== 0).length;
        status.textContent = `Game over — you hold ${count} of ${total}.`;
        ctx.score(count);
      };
      const passOrFinish = (player) => {
        if (legalMoves(player).length) return false;
        if (legalMoves(-player).length) {
          status.textContent = player === 1 ? 'No move for you. Rival plays on.' : 'Rival has no move. Your turn.';
          if (player === -1) { turn = 1; aiMove(); }
          return true;
        }
        finish();
        return true;
      };
      const aiMove = () => {
        if (over || turn !== -1) return;
        const moves = legalMoves(-1);
        if (!moves.length) { passOrFinish(-1); return; }
        const best = moves.map((move) => ({ move, gained: flipsFor(move.x, move.y, -1).length })).sort((a, b) => b.gained - a.gained)[0];
        board[best.move.y][best.move.x] = -1;
        flipsFor(best.move.x, best.move.y, -1).forEach((point) => { board[point.y][point.x] = -1; });
        paint();
        turn = 1;
        if (!passOrFinish(1)) status.textContent = 'Your turn.';
      };
      const play = (x, y) => {
        if (over || turn !== 1) return;
        const flips = flipsFor(x, y, 1);
        if (!flips.length) { status.textContent = 'That move traps nothing.'; return; }
        board[y][x] = 1;
        flips.forEach((point) => { board[point.y][point.x] = 1; });
        paint();
        turn = -1;
        ctx.after(520, aiMove);
      };
      ctx.enter = () => {
        board = [...Array(SIZE)].map(() => Array(SIZE).fill(0));
        board[2][2] = -1; board[2][3] = 1; board[3][2] = 1; board[3][3] = -1;
        over = false; turn = 1; paint();
        status.textContent = 'You are green. Make a move.';
      };
    },
  },
  {
    id: 'nim', title: 'Nim', jp: '石取りゲーム', help: 'Take one, two or three stones. Whoever takes the last one loses.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Nim', '石取りゲーム', 'Take one, two or three stones. Whoever takes the last one loses.');
      const pile = mk('div', 'exp-pile');
      body.append(pile);
      let stones = 13; let over = false;
      const paint = () => {
        pile.replaceChildren(...[...Array(stones)].map(() => mk('span', 'exp-peg')));
        pile.style.setProperty('--stones', String(stones));
      };
      const take = (count) => {
        if (over || count > stones) return;
        stones -= count;
        paint();
        if (stones === 0) { over = true; status.textContent = 'You took the last stone. Vesper wins.'; ctx.arcade.react('happy', { game: 'nim' }); return; }
        // Perfect play in misère Nim: leave a multiple of four when possible.
        const reply = stones % 4 === 0 ? 0 : stones % 4;
        if (reply) {
          stones -= reply;
          paint();
          status.textContent = `Vesper took ${reply}. ${stones} stone(s) remain.`;
        } else status.textContent = `${stones} stone(s) remain. Vesper passes.`;
        if (stones === 0) { over = true; status.textContent = 'Vesper took the last stone. You win.'; ctx.score(1); }
      };
      toolbar.append(...[1, 2, 3].map((count) => button(`TAKE ${count}`, () => take(count), 'quiet-button')));
      toolbar.append(button('NEW PILE', () => { stones = 13; over = false; paint(); status.textContent = 'Thirteen stones. You start.'; }));
      ctx.enter = () => { stones = 13; over = false; paint(); status.textContent = 'Thirteen stones. You start.'; };
    },
  },
  {
    id: 'peg-solitaire', title: 'Peg solitaire', jp: '一石跳ね', help: 'Jump one peg over another into an empty hole. Leave as few pegs as you can.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Peg solitaire', '一石跳ね', 'Jump one peg over another into an empty hole. Leave as few pegs as you can.');
      const SHAPE = ['.XX.', 'XXXX', 'XXXXXX', 'XXXX', '.XX.'];
      let board = []; let selected = null;
      const cells = grid(body, 24, 6, (index, cell) => {
        const x = index % 6; const y = Math.floor(index / 6);
        if (SHAPE[y]?.[x] !== 'X') return;
        const peg = board[y][x];
        if (selected && Math.abs(x - selected.x) === 2 && Math.abs(y - selected.y) === 2) {
          const midX = (x + selected.x) / 2; const midY = (y + selected.y) / 2;
          if (board[y][x] === 0 && board[midY][midX] === 1) {
            board[y][x] = 1; board[selected.y][selected.x] = 0; board[midY][midX] = 0;
            selected = null;
            paint();
            const left = board.flat().filter((value) => value === 1).length;
            status.textContent = `${left} peg(s) left.`;
            if (left <= 2) { status.textContent = `Down to ${left} peg(s).`; ctx.score(24 - left); }
            return;
          }
        }
        selected = peg === 1 ? { x, y } : null;
        paint();
        status.textContent = peg === 1 ? 'Pick an empty hole two steps away.' : 'Select a peg first.';
      });
      const paint = () => {
        [...cells.children].forEach((cell, index) => {
          const x = index % 6; const y = Math.floor(index / 6);
          const valid = SHAPE[y]?.[x] === 'X';
          cell.textContent = '';
          cell.classList.toggle('is-empty', !valid);
          cell.classList.toggle('is-picked', Boolean(selected && selected.x === x && selected.y === y));
          if (valid && board[y]?.[x] === 1) cell.textContent = '●';
        });
      };
      toolbar.append(button('RESET', () => {
        board = [...Array(5)].map((_, y) => [...Array(6)].map((_, x) => (SHAPE[y][x] === 'X' ? 1 : null)));
        board[2][2] = 0;
        selected = null; paint();
        status.textContent = '23 pegs. Jumps must land two squares away.';
      }));
      ctx.enter = () => {
        board = [...Array(5)].map((_, y) => [...Array(6)].map((_, x) => (SHAPE[y][x] === 'X' ? 1 : null)));
        board[2][2] = 0;
        selected = null; paint();
        status.textContent = '23 pegs. Jumps must land two squares away.';
      };
    },
  },
  {
    id: 'sudoku-lite', title: 'Mini sudoku', jp: '数独', help: 'Fill a four-by-four grid so no row, column or block repeats a number.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Mini sudoku', '数独', 'Fill a four-by-four grid so no row, column or block repeats a number.');
      let solution = []; let puzzle = []; let selected = null; let errors = 0;
      const cells = grid(body, 16, 4, (index, cell) => {
        if (puzzle[index]) return;
        selected = index;
        [...cells.children].forEach((node) => node.classList.remove('is-picked'));
        cell.classList.add('is-picked');
        status.textContent = 'Pick a number below.';
      });
      const paint = () => {
        [...cells.children].forEach((cell, i) => {
          cell.textContent = puzzle[i] ? String(puzzle[i]) : '';
          cell.classList.toggle('is-fixed', Boolean(puzzle[i]));
          cell.classList.toggle('is-wrong', !puzzle[i] && cell.dataset.wrong === '1');
        });
      };
      const digits = mk('div', 'exp-answers');
      body.append(digits);
      digits.replaceChildren(...[1, 2, 3, 4].map((value) => button(String(value), () => {
        if (selected == null) return;
        puzzle[selected] = value;
        const correct = value === solution[selected];
        cells.children[selected].dataset.wrong = correct ? '0' : '1';
        if (!correct) errors += 1;
        paint();
        if (puzzle.every((entry, i) => entry === solution[i])) {
          status.textContent = `Grid filled with ${errors} mistake(s).`;
          ctx.score(Math.max(1, 10 - errors));
          ctx.arcade.react('happy', { game: 'sudoku-lite' });
        } else status.textContent = correct ? 'That one fits.' : 'That clashes with a neighbour.';
      }, 'quiet-button')));
      const build = () => {
        // A fixed valid pattern, then digit and row-pair permutations keep every
        // row, column and 2×2 block legal while producing a fresh puzzle.
        const pattern = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
        const digits = shuffle([1, 2, 3, 4]);
        solution = pattern.map((value) => digits[value - 1]);
        if (Math.random() < 0.5) {
          for (let col = 0; col < 4; col += 1) {
            const a = solution[col]; solution[col] = solution[4 + col]; solution[4 + col] = a;
          }
        }
        puzzle = solution.slice();
        let hidden = 0;
        while (hidden < 8) {
          const index = randomInt(0, 15);
          if (puzzle[index]) { puzzle[index] = 0; hidden += 1; }
        }
        errors = 0; selected = null;
        paint();
        status.textContent = 'Numbers are hidden. Fill them in.';
      };
      toolbar.append(button('NEW GRID', build));
      ctx.enter = () => { status.textContent = 'Press new grid to start.'; };
    },
  },
  {
    id: 'nonogram-lite', title: 'Picture grid', jp: 'ピクロス', help: 'Fill cells to match the row and column counts and reveal the picture.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Picture grid', 'ピクロス', 'Fill cells to match the row and column counts and reveal the picture.');
      const SIZE = 5;
      let solution = []; let filled = []; let solved = false;
      const cells = grid(body, SIZE * SIZE, SIZE, (index) => {
        if (solved) return;
        filled[index] = !filled[index];
        cells.children[index].classList.toggle('is-on', filled[index]);
        // A nonogram is solved only when every cell matches the picture exactly.
        if (filled.every((value, i) => value === solution[i])) {
          solved = true;
          status.textContent = 'Picture complete.';
          ctx.score(1);
          ctx.arcade.react('happy', { game: 'nonogram-lite' });
        }
      });
      const clues = mk('div', 'exp-clues');
      body.append(clues);
      const describe = (line) => {
        const groups = [];
        let run = 0;
        line.forEach((value) => { if (value) run += 1; else if (run) { groups.push(run); run = 0; } });
        if (run) groups.push(run);
        return groups.length ? groups.join(' ') : '0';
      };
      toolbar.append(button('NEW PICTURE', () => {
        solution = [...Array(SIZE * SIZE)].map(() => Math.random() < 0.45);
        filled = [...Array(SIZE * SIZE)].map(() => false);
        solved = false;
        [...cells.children].forEach((cell) => cell.classList.remove('is-on'));
        const rows = [...Array(SIZE)].map((_, y) => describe(solution.slice(y * SIZE, y * SIZE + SIZE)));
        const cols = [...Array(SIZE)].map((_, x) => describe([...Array(SIZE)].map((_, y) => solution[y * SIZE + x])));
        clues.replaceChildren(
          mk('div', 'exp-clue-row', `rows: ${rows.join(' | ')}`),
          mk('div', 'exp-clue-row', `cols: ${cols.join(' | ')}`),
        );
        status.textContent = 'Fill the cells that belong in the picture.';
      }));
      ctx.enter = () => { status.textContent = 'Press new picture to start.'; };
    },
  },
  {
    id: 'maze-runner', title: 'Maze runner', jp: 'メイズ', help: 'A fresh maze every time. Arrow keys move; reach the golden exit.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Maze runner', 'メイズ', 'A fresh maze every time. Arrow keys move; reach the golden exit.');
      const SIZE = 15;
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Maze canvas');
      body.append(canvas);
      const context = canvas.getContext('2d');
      let walls = []; let player = { x: 0, y: 0 }; let steps = 0; let best = 0;
      const carve = () => {
        walls = [...Array(SIZE)].map(() => Array(SIZE).fill(true));
        const stack = [{ x: 0, y: 0 }];
        walls[0][0] = false;
        while (stack.length) {
          const current = stack.at(-1);
          const options = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .map(([dx, dy]) => ({ x: current.x + dx, y: current.y + dy, dx, dy }))
            .filter((next) => next.x >= 0 && next.y >= 0 && next.x < SIZE && next.y < SIZE && walls[next.y][next.x]);
          if (!options.length) { stack.pop(); continue; }
          const next = options[randomInt(0, options.length - 1)];
          walls[next.y][next.x] = false;
          stack.push({ x: next.x, y: next.y });
        }
        player = { x: 0, y: 0 }; steps = 0;
        draw();
        status.textContent = 'Reach the bottom-right corner.';
      };
      const draw = () => {
        const cellSize = 20;
        const { width, height } = fitCanvas(canvas, context, SIZE * cellSize, SIZE * cellSize);
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, width, height);
        walls.forEach((row, y) => row.forEach((wall, x) => {
          if (wall) { context.fillStyle = '#2a3140'; context.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1); }
        }));
        context.fillStyle = '#f0c274'; context.fillRect((SIZE - 1) * cellSize + 3, (SIZE - 1) * cellSize + 3, cellSize - 7, cellSize - 7);
        context.fillStyle = '#61afef'; context.beginPath(); context.arc(player.x * cellSize + cellSize / 2, player.y * cellSize + cellSize / 2, 6, 0, Math.PI * 2); context.fill();
      };
      ctx.onKey((event) => {
        const delta = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const nx = player.x + delta[0]; const ny = player.y + delta[1];
        if (walls[ny]?.[nx]) return;
        player = { x: nx, y: ny }; steps += 1;
        draw();
        if (player.x === SIZE - 1 && player.y === SIZE - 1) {
          best = best ? Math.min(best, steps) : steps;
          status.textContent = `Exit reached in ${steps} steps. Best ${best}.`;
          ctx.score(steps, { lowerIsBetter: true });
          ctx.arcade.react('happy', { game: 'maze-runner' });
        }
      });
      toolbar.append(button('NEW MAZE', carve));
      ctx.enter = carve;
    },
  },
  {
    id: 'space-drift', title: 'Space drift', jp: '宇宙ドリフト', help: 'Steer the little ship between the falling rocks for as long as you can.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Space drift', '宇宙ドリフト', 'Steer the little ship between the falling rocks for as long as you can.');
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Space drift canvas');
      body.append(canvas);
      const context = canvas.getContext('2d');
      let ship = { x: 60, y: 0 }; let rocks = []; let score = 0; let running = false; let spawnAt = 0; let startedAt = 0;
      ctx.onFrame(({ now }) => {
        const { width, height } = fitCanvas(canvas, context, 300, 720);
        if (!running) ship.y = height / 2;
        if (running) {
          if (now > spawnAt) { rocks.push({ x: width + 20, y: randomInt(10, height - 10), r: randomInt(8, 20), speed: randomInt(2, 5) }); spawnAt = now + randomInt(320, 780); }
          rocks.forEach((rock) => { rock.x -= rock.speed; });
          rocks = rocks.filter((rock) => rock.x > -30);
          // Survival is scored in whole seconds aloft.
          score = Math.floor((now - startedAt) / 1000);
          status.textContent = `${score}s aloft · ${rocks.length} rock(s)`;
          rocks.forEach((rock) => {
            if (Math.hypot(rock.x - ship.x, rock.y - ship.y) < rock.r + 9) {
              running = false;
              status.textContent = `Hull breached at ${score} seconds.`;
              ctx.score(score);
              ctx.arcade.react('sad', { game: 'space-drift' });
            }
          });
        }
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, width, height);
        context.fillStyle = '#2a3140';
        for (let i = 0; i < 26; i += 1) context.fillRect((i * 97) % width, (i * 53) % height, 1, 1);
        rocks.forEach((rock) => { context.beginPath(); context.arc(rock.x, rock.y, rock.r, 0, Math.PI * 2); context.fillStyle = '#5a4a52'; context.fill(); });
        context.beginPath(); context.moveTo(ship.x + 10, ship.y); context.lineTo(ship.x - 8, ship.y - 7); context.lineTo(ship.x - 8, ship.y + 7); context.closePath();
        context.fillStyle = '#61afef'; context.fill();
      });
      const setTarget = (clientY, rect) => { if (running) ship.y = Math.max(10, Math.min(rect.height - 10, clientY - rect.top)); };
      canvas.addEventListener('pointermove', (event) => setTarget(event.clientY, canvas.getBoundingClientRect()));
      ctx.onKey((event) => {
        if (event.key === 'ArrowUp') { ship.y = Math.max(10, ship.y - 22); event.preventDefault(); }
        if (event.key === 'ArrowDown') { ship.y += 22; event.preventDefault(); }
      });
      toolbar.append(button('LAUNCH', () => { rocks = []; score = 0; running = true; startedAt = performance.now(); status.textContent = 'Dodge the rocks.'; }));
      ctx.enter = () => { running = false; rocks = []; status.textContent = 'Press launch.'; };
      ctx.exit = () => { running = false; };
    },
  },
  {
    id: 'pong-ai', title: 'Pong rival', jp: 'ポンぐみ', help: 'First to five. The rival paddle reads your returns, not your future.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Pong rival', 'ポンぐみ', 'First to five. The rival paddle reads your returns, not your future.');
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Pong canvas');
      body.append(canvas);
      const context = canvas.getContext('2d');
      const state = { playerY: 100, aiY: 100, ballX: 0, ballY: 0, vx: 4, vy: 3, playerScore: 0, aiScore: 0, running: false };
      const serve = () => { state.ballX = 180; state.ballY = 110; state.vx = Math.random() < 0.5 ? -4 : 4; state.vy = (Math.random() < 0.5 ? -1 : 1) * 3; };
      ctx.onFrame(() => {
        const { width, height } = fitCanvas(canvas, context, 220, 720);
        if (state.running) {
          state.ballX += state.vx; state.ballY += state.vy;
          if (state.ballY < 8 || state.ballY > height - 8) state.vy *= -1;
          state.aiY += Math.sign(state.ballY - state.aiY) * Math.min(3.6, Math.abs(state.ballY - state.aiY));
          if (state.ballX < 22 && state.ballX > 12 && state.ballY > state.playerY - 26 && state.ballY < state.playerY + 26) state.vx *= -1;
          if (state.ballX > width - 22 && state.ballX < width - 12 && state.ballY > state.aiY - 26 && state.ballY < state.aiY + 26) state.vx *= -1;
          if (state.ballX < -10) { state.aiScore += 1; serve(); }
          if (state.ballX > width + 10) { state.playerScore += 1; serve(); }
          if (state.playerScore >= 5 || state.aiScore >= 5) {
            state.running = false;
            const won = state.playerScore > state.aiScore;
            status.textContent = won ? 'You took the match 5–' + state.aiScore : `The rival took it ${state.aiScore}–${state.playerScore}.`;
            if (won) { ctx.score(1); ctx.arcade.react('happy', { game: 'pong-ai' }); }
            state.playerScore = 0; state.aiScore = 0;
          }
        }
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, width, height);
        context.setLineDash([6, 8]); context.strokeStyle = '#2a3140';
        context.beginPath(); context.moveTo(width / 2, 0); context.lineTo(width / 2, height); context.stroke(); context.setLineDash([]);
        context.fillStyle = '#61afef'; context.fillRect(12, state.playerY - 26, 8, 52);
        context.fillStyle = '#e06c75'; context.fillRect(width - 20, state.aiY - 26, 8, 52);
        context.fillStyle = '#f0c274'; context.beginPath(); context.arc(state.ballX, state.ballY, 6, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#8a93a6'; context.font = '13px monospace';
        context.fillText(`${state.playerScore} : ${state.aiScore}`, width / 2 - 20, 20);
      });
      canvas.addEventListener('pointermove', (event) => {
        const rect = canvas.getBoundingClientRect();
        state.playerY = Math.max(28, Math.min(rect.height - 28, event.clientY - rect.top));
      });
      ctx.onKey((event) => {
        if (event.key === 'ArrowUp') { state.playerY = Math.max(28, state.playerY - 24); event.preventDefault(); }
        if (event.key === 'ArrowDown') { state.playerY += 24; event.preventDefault(); }
      });
      toolbar.append(button('SERVE', () => { state.playerScore = 0; state.aiScore = 0; serve(); state.running = true; status.textContent = 'First to five.'; }));
      ctx.enter = () => { state.running = false; status.textContent = 'Press serve.'; };
      ctx.exit = () => { state.running = false; };
    },
  },
  {
    id: 'invader-lite', title: 'Invaders', jp: 'こうそくさい', help: 'The formation marches. Fire with Space before it reaches the ground.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Invaders', 'こうそくさい', 'The formation marches. Fire with Space before it reaches the ground.');
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Invaders canvas');
      body.append(canvas);
      const context = canvas.getContext('2d');
      let aliens = []; let shots = []; let shipX = 0; let score = 0; let running = false; let direction = 1;
      const build = () => {
        aliens = [];
        for (let row = 0; row < 3; row += 1) for (let col = 0; col < 7; col += 1) aliens.push({ x: 60 + col * 62, y: 26 + row * 28, alive: true });
        shots = []; score = 0; direction = 1;
      };
      let lastStep = 0;
      ctx.onFrame(({ now }) => {
        const { width, height } = fitCanvas(canvas, context, 260, 720);
        if (running) {
          shots.forEach((shot) => { shot.y -= 6; });
          shots = shots.filter((shot) => shot.y > -10);
          if (now - lastStep > 420) {
            lastStep = now;
            const alive = aliens.filter((alien) => alien.alive);
            const edge = alive.some((alien) => (direction > 0 && alien.x > width - 60) || (direction < 0 && alien.x < 60));
            if (edge) { direction *= -1; alive.forEach((alien) => { alien.y += 12; }); }
            else alive.forEach((alien) => { alien.x += direction * 10; });
            if (alive.some((alien) => alien.y > height - 34)) {
              running = false;
              status.textContent = `Overrun at ${score} points.`;
              ctx.score(score);
            }
          }
          shots.forEach((shot) => {
            const hit = aliens.find((alien) => alien.alive && Math.abs(alien.x - shot.x) < 14 && Math.abs(alien.y - shot.y) < 10);
            if (hit) { hit.alive = false; shot.dead = true; score += 10; status.textContent = `${score} point(s)`; ctx.score(score); }
          });
          shots = shots.filter((shot) => !shot.dead);
          if (aliens.every((alien) => !alien.alive)) {
            running = false;
            status.textContent = `Wave cleared at ${score} points.`;
            ctx.score(score);
            ctx.arcade.react('happy', { game: 'invader-lite' });
          }
        }
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, width, height);
        aliens.forEach((alien) => {
          if (!alien.alive) return;
          context.fillStyle = '#98c379';
          context.fillRect(alien.x - 12, alien.y - 7, 24, 12);
          context.fillRect(alien.x - 7, alien.y - 11, 14, 5);
        });
        shots.forEach((shot) => { context.fillStyle = '#f0c274'; context.fillRect(shot.x - 1, shot.y, 3, 9); });
        context.fillStyle = '#61afef'; context.fillRect(shipX - 14, height - 20, 28, 9);
      });
      ctx.onKey((event) => {
        const { width } = fitCanvas(canvas, context, 260, 720);
        if (event.key === 'ArrowLeft') { shipX = Math.max(20, shipX - 24); event.preventDefault(); }
        if (event.key === 'ArrowRight') { shipX = Math.min(width - 20, shipX + 24); event.preventDefault(); }
        if (event.code === 'Space') { if (running) shots.push({ x: shipX, y: 230 }); event.preventDefault(); }
      });
      canvas.addEventListener('pointermove', (event) => {
        const rect = canvas.getBoundingClientRect();
        shipX = Math.max(20, Math.min(rect.width - 20, event.clientX - rect.left));
      });
      toolbar.append(button('START WAVE', () => { build(); running = true; shipX = (canvas.clientWidth || 720) / 2; status.textContent = 'Space fires. Clear the wave.'; }));
      ctx.enter = () => { build(); running = false; status.textContent = 'Press start wave.'; };
      ctx.exit = () => { running = false; };
    },
  },
  {
    id: 'platform-jump', title: 'Rooftop run', jp: 'とびおり', help: 'Hop the gaps. The rooftops keep scrolling until you miss one.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Rooftop run', 'とびおり', 'Hop the gaps. The rooftops keep scrolling until you miss one.');
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Rooftop run canvas');
      body.append(canvas);
      const context = canvas.getContext('2d');
      let platforms = []; let playerY = 0; let vy = 0; let distance = 0; let running = false; let best = 0;
      const spawn = (x) => ({ x, width: randomInt(90, 170), y: randomInt(150, 230) });
      const reset = () => {
        platforms = [spawn(20), spawn(250), spawn(480), spawn(700)];
        playerY = platforms[0].y - 24; vy = 0; distance = 0;
      };
      const jump = () => { if (running) vy = -7.4; };
      canvas.addEventListener('pointerdown', jump);
      ctx.onKey((event) => { if (event.code === 'Space') { jump(); event.preventDefault(); } });
      ctx.onFrame(() => {
        const { width, height } = fitCanvas(canvas, context, 260, 720);
        if (running) {
          const speed = 2.6 + Math.min(2.6, distance / 4000);
          platforms.forEach((platform) => { platform.x -= speed; });
          if (platforms[0] && platforms[0].x + platforms[0].width < -10) {
            platforms.shift();
            const last = platforms.at(-1);
            platforms.push(spawn(last.x + last.width + randomInt(90, 190)));
          }
          vy += 0.34; playerY += vy;
          // The runner is 20×24 px and sits at x = 20, so its feet are at y = playerY + 24.
          const support = platforms.find((platform) => playerY + 24 >= platform.y && playerY + 24 <= platform.y + 20 && 34 >= platform.x && 26 <= platform.x + platform.width);
          if (support && vy > 0) { playerY = support.y - 24; vy = 0; }
          if (playerY > height + 20) {
            running = false;
            best = Math.max(best, Math.floor(distance));
            status.textContent = `Missed a roof at ${Math.floor(distance)} m. Best ${best} m.`;
            ctx.score(Math.floor(distance));
            ctx.arcade.react('sad', { game: 'platform-jump' });
          } else {
            distance += speed;
            status.textContent = `${Math.floor(distance)} m run`;
          }
        }
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, width, height);
        context.fillStyle = '#2a3140';
        platforms.forEach((platform) => context.fillRect(platform.x, platform.y, platform.width, height - platform.y));
        context.fillStyle = '#61afef'; context.fillRect(20, playerY, 20, 24);
      });
      toolbar.append(button('RUN', () => { reset(); running = true; status.textContent = 'Space to hop.'; }));
      ctx.enter = () => { reset(); running = false; status.textContent = 'Press run.'; };
      ctx.exit = () => { running = false; };
    },
  },
  {
    id: 'tower-stack', title: 'Tower stack', jp: 'タワー', help: 'Drop each block squarely. The tower trims every crooked landing.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Tower stack', 'タワー', 'Drop each block squarely. The tower trims every crooked landing.');
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Tower stack canvas');
      body.append(canvas);
      const context = canvas.getContext('2d');
      let blocks = []; let current = null; let running = false;
      const newBlock = () => {
        const base = blocks.at(-1) || { x: 220, width: 160, y: 250 };
        current = { x: 0, width: base.width, y: base.y - 16, moving: true, dir: 1 };
      };
      ctx.onFrame(() => {
        const { width, height } = fitCanvas(canvas, context, 280, 720);
        if (running && current?.moving) {
          current.x += current.dir * 3.6;
          if (current.x < 0 || current.x + current.width > width) current.dir *= -1;
        }
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, width, height);
        blocks.forEach((block, i) => { context.fillStyle = `hsl(${200 + i * 9} 70% 60%)`; context.fillRect(block.x, block.y, block.width, 16); });
        if (current) { context.fillStyle = '#f0c274'; context.fillRect(current.x, current.y, current.width, 16); }
      });
      const drop = () => {
        if (!running || !current) return;
        const base = blocks.at(-1) || { x: 0, width: 160, y: 250 };
        const overlap = Math.min(base.x + base.width, current.x + current.width) - Math.max(base.x, current.x);
        if (overlap <= 6) {
          running = false;
          status.textContent = `Tower collapsed at ${blocks.length} block(s).`;
          ctx.score(blocks.length);
          ctx.arcade.react('sad', { game: 'tower-stack' });
          return;
        }
        const x = Math.max(base.x, current.x);
        blocks.push({ x, width: overlap, y: current.y });
        status.textContent = `${blocks.length} block(s) stacked · ${Math.round(overlap)} px wide`;
        ctx.score(blocks.length);
        newBlock();
      };
      canvas.addEventListener('pointerdown', drop);
      ctx.onKey((event) => { if (event.code === 'Space') { drop(); event.preventDefault(); } });
      toolbar.append(button('START TOWER', () => { blocks = []; running = true; newBlock(); status.textContent = 'Tap the canvas or press Space to drop.'; }));
      ctx.enter = () => { blocks = []; current = null; running = false; status.textContent = 'Press start tower.'; };
      ctx.exit = () => { running = false; };
    },
  },
  {
    id: 'whack-mole', title: 'Mole garden', jp: 'もぐらたたき', help: 'Tap the moles as they pop up. Thirty seconds of gentle gardening.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Mole garden', 'もぐらたたき', 'Tap the moles as they pop up. Thirty seconds of gentle gardening.');
      let holes = []; let score = 0; let timeLeft = 0; let running = false;
      const wrap = mk('div', 'exp-grid');
      wrap.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
      holes = [...Array(9)].map(() => {
        const hole = mk('button', 'exp-cell', '');
        hole.type = 'button';
        hole.addEventListener('click', () => {
          if (!hole.classList.contains('is-on')) return;
          hole.classList.remove('is-on');
          hole.textContent = '';
          score += 1;
          status.textContent = `${score} mole(s) · ${timeLeft}s left`;
          ctx.score(score);
        });
        wrap.append(hole);
        return hole;
      });
      body.append(wrap);
      const pop = () => {
        if (!running) return;
        const hole = holes[randomInt(0, holes.length - 1)];
        hole.textContent = '◉';
        hole.classList.add('is-on');
        ctx.after(850, () => { hole.classList.remove('is-on'); hole.textContent = ''; });
      };
      toolbar.append(button('START 30s', () => {
        score = 0; timeLeft = 30; running = true;
        status.textContent = 'Gardening time.';
        ctx.clearIntervals();
        ctx.every(260, pop);
        ctx.every(1000, () => {
          timeLeft -= 1;
          if (timeLeft <= 0) {
            running = false;
            ctx.clearIntervals();
            holes.forEach((hole) => { hole.classList.remove('is-on'); hole.textContent = ''; });
            status.textContent = `${score} moles gardened.`;
            ctx.score(score);
          }
        });
      }));
      ctx.enter = () => { status.textContent = 'Press start.'; };
      ctx.exit = () => { running = false; ctx.clearIntervals(); };
    },
  },
  {
    id: 'balloon-pop', title: 'Balloon drift', jp: 'ふうせん', help: 'Pop the rising balloons before they drift past the top.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Balloon drift', 'ふうせん', 'Pop the rising balloons before they drift past the top.');
      const canvas = mk('canvas', 'arcade-canvas');
      canvas.style.width = '100%';
      canvas.setAttribute('aria-label', 'Balloon drift canvas');
      body.append(canvas);
      const context = canvas.getContext('2d');
      let balloons = []; let score = 0; let running = false; let spawnAt = 0; let escaped = 0;
      ctx.onFrame(({ now }) => {
        const { width, height } = fitCanvas(canvas, context, 300, 720);
        if (running) {
          if (now > spawnAt) { balloons.push({ x: randomInt(30, width - 30), y: height + 20, r: randomInt(12, 22), speed: randomInt(1, 3), hue: randomInt(0, 359) }); spawnAt = now + randomInt(280, 700); }
          balloons.forEach((balloon) => { balloon.y -= balloon.speed; });
          const gone = balloons.filter((balloon) => balloon.y < -30);
          escaped += gone.length;
          balloons = balloons.filter((balloon) => balloon.y >= -30);
          if (escaped >= 8) {
            running = false;
            status.textContent = `${score} popped, ${escaped} drifted away.`;
            ctx.score(score);
          }
        }
        context.fillStyle = '#0b0e14'; context.fillRect(0, 0, width, height);
        balloons.forEach((balloon) => {
          context.beginPath(); context.ellipse(balloon.x, balloon.y, balloon.r, balloon.r * 1.2, 0, 0, Math.PI * 2);
          context.fillStyle = `hsl(${balloon.hue} 75% 62%)`; context.fill();
          context.strokeStyle = '#8a93a6'; context.beginPath(); context.moveTo(balloon.x, balloon.y + balloon.r * 1.2); context.lineTo(balloon.x, balloon.y + balloon.r * 1.2 + 14); context.stroke();
        });
      });
      canvas.addEventListener('pointerdown', (event) => {
        if (!running) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left; const y = event.clientY - rect.top;
        const index = balloons.findIndex((balloon) => Math.hypot(balloon.x - x, balloon.y - y) < balloon.r + 4);
        if (index !== -1) { balloons.splice(index, 1); score += 1; status.textContent = `${score} popped · ${escaped} escaped`; ctx.score(score); }
      });
      toolbar.append(button('OPEN THE WINDOW', () => { balloons = []; score = 0; escaped = 0; running = true; status.textContent = 'Pop them before they float off.'; }));
      ctx.enter = () => { running = false; balloons = []; status.textContent = 'Press open the window.'; };
      ctx.exit = () => { running = false; balloons = []; };
    },
  },
  {
    id: 'dice-poker', title: 'Five dice', jp: 'ファイブダイス', help: 'Two rerolls a round. Beat the target ladder across six rounds.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Five dice', 'ファイブダイス', 'Two rerolls a round. Beat the target ladder across six rounds.');
      const tray = mk('div', 'exp-dice');
      const ladder = mk('div', 'exp-clues');
      body.append(tray, ladder);
      const TARGETS = [14, 18, 22, 26, 30, 34];
      let dice = [0, 0, 0, 0, 0]; let held = [false, false, false, false, false]; let rerolls = 0; let round = 0; let total = 0;
      const paint = () => {
        tray.replaceChildren(...dice.map((value, index) => {
          const pip = mk('button', 'exp-cell', String(value || '–'));
          pip.type = 'button';
          pip.classList.toggle('is-on', held[index]);
          pip.addEventListener('click', () => { held[index] = !held[index]; paint(); });
          return pip;
        }));
      };
      ladder.replaceChildren(...TARGETS.map((target, index) => mk('div', 'exp-clue-row', `Round ${index + 1}: ${target}+`)));
      const roll = () => {
        dice = dice.map((value, index) => (held[index] ? value : randomInt(1, 6)));
        paint();
      };
      const settle = () => {
        const score = dice.reduce((sum, value) => sum + value, 0);
        const met = score >= TARGETS[round];
        total += met ? score : 0;
        status.textContent = `Round ${round + 1}: ${score} ${met ? 'met' : 'missed'} the ${TARGETS[round]} target. Total ${total}.`;
        round += 1; rerolls = 0; held = [false, false, false, false, false];
        if (round >= TARGETS.length) {
          status.textContent = `Six rounds complete — ${total} points.`;
          ctx.score(total);
          ctx.arcade.react(total >= 100 ? 'happy' : 'neutral', { game: 'dice-poker' });
          round = 0; total = 0;
          return;
        }
        roll();
      };
      toolbar.append(
        button('ROLL', () => { if (rerolls >= 2) { status.textContent = 'No rerolls left — settle the round.'; return; } rerolls += 1; roll(); status.textContent = `${2 - rerolls} reroll(s) left.`; }),
        button('SETTLE', settle),
        button('NEW GAME', () => { round = 0; total = 0; rerolls = 0; held = [false, false, false, false, false]; roll(); status.textContent = 'Round 1. Roll, hold, settle.'; }),
      );
      ctx.enter = () => { dice = [0, 0, 0, 0, 0]; roll(); status.textContent = 'Press new game.'; };
    },
  },
  {
    id: 'blackjack-lite', title: 'Twenty-one', jp: 'ブラックジャック', help: 'Beat the dealer without going over twenty-one. Chips are pretend.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Twenty-one', 'ブラックジャック', 'Beat the dealer without going over twenty-one. Chips are pretend.');
      const hand = mk('div', 'exp-clues');
      body.append(hand);
      let deck = []; let player = []; let dealer = []; let chips = 100; let over = false;
      const draw = () => { const card = deck.pop(); return card; };
      const total = (cards) => {
        let sum = 0; let aces = 0;
        cards.forEach((card) => { if (card === 1) { aces += 1; sum += 11; } else sum += Math.min(card, 10); });
        while (sum > 21 && aces) { sum -= 10; aces -= 1; }
        return sum;
      };
      const render = () => {
        hand.replaceChildren(
          mk('div', 'exp-clue-row', `you: ${player.join(' · ')} = ${total(player)}`),
          mk('div', 'exp-clue-row', `dealer: ${dealer[0]} · ?   chips ${chips}`),
        );
      };
      const deal = () => {
        deck = [...Array(10)].map((_, i) => i + 1).flatMap((card) => [card, card, card, card]);
        deck = shuffle(deck);
        player = [draw(), draw()]; dealer = [draw(), draw()]; over = false;
        render();
        status.textContent = 'Hit or stand.';
      };
      toolbar.append(
        button('DEAL', deal),
        button('HIT', () => {
          if (over) return;
          player.push(draw()); render();
          if (total(player) > 21) { over = true; chips = Math.max(0, chips - 10); status.textContent = `Bust at ${total(player)}. Chips ${chips}.`; ctx.score(chips); }
        }, 'quiet-button'),
        button('STAND', () => {
          if (over) return;
          while (total(dealer) < 17) dealer.push(draw());
          render();
          const playerTotal = total(player); const dealerTotal = total(dealer);
          if (dealerTotal > 21 || playerTotal > dealerTotal) { chips += 15; status.textContent = `You win ${playerTotal} to ${dealerTotal}. Chips ${chips}.`; ctx.score(chips); ctx.arcade.react('happy', { game: 'blackjack-lite' }); }
          else if (playerTotal === dealerTotal) status.textContent = `Push at ${playerTotal}. Chips ${chips}.`;
          else { chips = Math.max(0, chips - 10); status.textContent = `Dealer wins ${dealerTotal} to ${playerTotal}. Chips ${chips}.`; ctx.score(chips); }
          over = true;
        }, 'quiet-button'),
      );
      ctx.enter = () => { hand.replaceChildren(); status.textContent = 'Press deal.'; };
    },
  },
  {
    id: 'odd-one-out', title: 'Odd one out', jp: 'ちがうのだい', help: 'One tile is a slightly different shade. Find it before the clock runs out.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Odd one out', 'ちがうのだい', 'One tile is a slightly different shade. Find it before the clock runs out.');
      const SIZE = 4;
      let oddIndex = 0; let score = 0; let timeLeft = 30; let running = false;
      const cells = grid(body, SIZE * SIZE, SIZE, (index) => {
        if (!running) return;
        if (index === oddIndex) { score += 1; next(); } else { score = Math.max(0, score - 1); status.textContent = `Not that one. ${score} point(s)`; }
      });
      const next = () => {
        oddIndex = randomInt(0, SIZE * SIZE - 1);
        const hue = randomInt(0, 359);
        const shade = 58 + (Math.random() < 0.5 ? 0 : 3);
        [...cells.children].forEach((cell, index) => {
          cell.style.background = `hsl(${hue} 62% ${index === oddIndex ? shade + 4 : shade}%)`;
          cell.textContent = '';
        });
        status.textContent = `${score} point(s) · ${timeLeft}s left`;
      };
      toolbar.append(button('START 30s', () => {
        score = 0; timeLeft = 30; running = true;
        next();
        ctx.clearIntervals();
        ctx.every(1000, () => {
          timeLeft -= 1;
          status.textContent = `${timeLeft}s · ${score} point(s)`;
          if (timeLeft <= 0) { running = false; ctx.clearIntervals(); status.textContent = `Final score ${score}.`; ctx.score(score); }
        });
      }));
      ctx.enter = () => { status.textContent = 'Press start.'; };
      ctx.exit = () => { running = false; ctx.clearIntervals(); };
    },
  },
  {
    id: 'flood-fill', title: 'Paint flood', jp: 'ペイント', help: 'Flood the board from the top-left corner in twenty-two moves or fewer.',
    build(panel, ctx) {
      const { body, toolbar, status } = scaffold(panel, 'Paint flood', 'ペイント', 'Flood the board from the top-left corner in twenty-two moves or fewer.');
      const SIZE = 6;
      const COLORS = ['#e06c75', '#98c379', '#61afef', '#e5c07b', '#c678dd'];
      let board = []; let moves = 0; let solved = false;
      const cells = grid(body, SIZE * SIZE, SIZE, (index, cell) => {
        if (solved) return;
        const color = Number(cell.dataset.color);
        if (color === board[0]) return;
        flood(board[0], color);
        moves += 1;
        paint();
        if (board.every((value) => value === board[0])) {
          solved = true;
          status.textContent = `Whole board painted in ${moves} moves.`;
          ctx.score(Math.max(1, 26 - moves));
          ctx.arcade.react('happy', { game: 'flood-fill' });
        } else status.textContent = `${moves} move(s) used.`;
      });
      const flood = (from, to) => {
        const stack = [0];
        const seen = new Set([0]);
        while (stack.length) {
          const index = stack.pop();
          if (board[index] !== from) continue;
          board[index] = to;
          const x = index % SIZE; const y = Math.floor(index / SIZE);
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nx = x + dx; const ny = y + dy;
            const next = ny * SIZE + nx;
            if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || seen.has(next)) return;
            seen.add(next);
            stack.push(next);
          });
        }
      };
      const paint = () => {
        [...cells.children].forEach((cell, index) => {
          cell.dataset.color = String(board[index]);
          cell.style.background = COLORS[board[index]];
        });
      };
      toolbar.append(button('NEW BOARD', () => {
        board = [...Array(SIZE * SIZE)].map(() => randomInt(0, COLORS.length - 1));
        moves = 0; solved = false;
        paint();
        status.textContent = 'Twenty-two moves is a decent target.';
      }));
      ctx.enter = () => { status.textContent = 'Press new board.'; };
    },
  },
];

/* ================================================================== *
 *  Registration
 * ================================================================== */

/**
 * Register every expansion module with the arcade lifecycle.
 * @param {object} arcade the registry from createArcadeFramework()
 */
export function initializeArcadeExpansion(arcade) {
  for (const spec of MODULES) {
    const ctx = {
      arcade,
      id: spec.id,
      timers: new Set(),
      frameHandler: null,
      keyHandler: null,
      running: false,
      frameId: 0,
      lastFrame: 0,
      /** Schedule work that survives until pause or exit. */
      after(ms, fn) {
        const timer = window.setTimeout(() => { ctx.timers.delete(timer); fn(); }, ms);
        ctx.timers.add(timer);
        return timer;
      },
      every(ms, fn) {
        const timer = window.setInterval(fn, ms);
        ctx.timers.add(timer);
        return timer;
      },
      clearIntervals() {
        for (const timer of [...ctx.timers]) { window.clearInterval(timer); window.clearTimeout(timer); ctx.timers.delete(timer); }
      },
      onFrame(handler) { ctx.frameHandler = handler; },
      onKey(handler) { ctx.keyHandler = handler; },
      score(value, options = {}) { arcade.reportScore(spec.id, Number(value), options); },
    };

    const tick = (now) => {
      if (!ctx.running) { ctx.frameId = 0; ctx.lastFrame = now; return; }
      const dt = Math.min(0.05, (now - (ctx.lastFrame || now)) / 1000);
      ctx.lastFrame = now;
      ctx.frameHandler?.({ now, dt, arcade });
      ctx.frameId = window.requestAnimationFrame(tick);
    };
    const startFrame = () => { if (ctx.frameHandler && !ctx.frameId) ctx.frameId = window.requestAnimationFrame(tick); };
    const stopFrame = () => { if (ctx.frameId) window.cancelAnimationFrame(ctx.frameId); ctx.frameId = 0; ctx.running = false; };
    const onDocumentKey = (event) => {
      if (!ctx.running || arcade.activeId !== spec.id || arcade.paused) return;
      ctx.keyHandler?.(event);
    };
    document.addEventListener('keydown', onDocumentKey);

    arcade.register({
      id: spec.id,
      title: spec.title,
      mount(panel) { spec.build(panel, ctx); },
      // Modules may attach their hooks to either the spec or the context, so
      // both are honoured when the arcade activates a game.
      onEnter() { ctx.running = true; startFrame(); (spec.enter || ctx.enter)?.(); },
      onPause() { ctx.running = false; stopFrame(); ctx.clearIntervals(); spec.pause?.(); },
      onResume() { ctx.running = true; startFrame(); },
      onExit() { ctx.running = false; stopFrame(); ctx.clearIntervals(); (spec.exit || ctx.exit)?.(); },
    });
  }
}

export const ARCADE_EXPANSION_COUNT = MODULES.length;
export const ARCADE_EXPANSION_IDS = Object.freeze(MODULES.map((module) => module.id));
