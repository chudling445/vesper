import { loadVoicePrefs, speakWaifu } from './voice-utils.js';
import { appStore } from './persistence.js';
import { createArcadeFramework } from './arcade-framework.js';
import { initializeArcadeExtras } from './arcade-extra-games.js';
import { initializeArcadeToys } from './arcade-toys.js';
import { initializeArcadeUtilityPack } from './arcade-utility-pack.js';

await appStore.ready;

const $ = (selector) => document.querySelector(selector);
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const STORE = 'vesper-arcade-v1';

function loadStats() {
  const base = { jkp: { w: 0, l: 0, d: 0, best: 0 }, ttt: { w: 0, l: 0, d: 0 }, memory: { best: 0 }, omikuji: { day: '', index: -1 }, reflex: { best: 0 }, starcatch: { best: 0 }, highlow: { best: 0 } };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    for (const key of Object.keys(base)) if (saved[key] && typeof saved[key] === 'object') Object.assign(base[key], saved[key]);
  } catch { /* Start with fresh scores. */ }
  return base;
}
const stats = loadStats();
const saveStats = () => {
  try { localStorage.setItem(STORE, JSON.stringify(stats)); } catch { /* The IndexedDB copy remains available. */ }
  const arcadeState = appStore.get('workspace.arcade', {});
  appStore.set('workspace.arcade', { ...arcadeState, classic: JSON.parse(JSON.stringify(stats)) });
  window.dispatchEvent(new CustomEvent('vesper:arcade-score'));
};

// Every line is [English, 日本語]. The Japanese line is used when Vesper's reply language is Japanese.
const Q = {
  intro: {
    jkp: ['Jan-ken-pon! Try not to lose too badly, senpai.', 'じゃんけんぽん！あんまり負けないでね、センパイ。'],
    ttt: ['You can be X. I will happily be the one who wins.', 'センパイがバツね。勝つのはもちろん私だけど。'],
    memory: ['Eight pairs. Try to remember where things are, senpai.', '八組のペアだよ。場所、ちゃんと覚えててね、センパイ。'],
    omikuji: ['Let us see what the shrine thinks of you today.', '今日のセンパイの運勢、見てあげる。'],
  },
  jkpWin: [['Tch. Lucky guess, senpai.', 'むぅ…まぐれだよ、センパイ。'], ['Fine, you got me. Do not let it go to your head.', 'わかったってば。調子に乗らないでよ。']],
  jkpLoss: [['Hmph! Too easy~', 'ふふん、簡単すぎ〜。'], ['I win! Say it, senpai: you are bad at this.', '私の勝ち！センパイは弱いって認めなよ。']],
  jkpDraw: [['A tie? Again. I refuse to leave it like this.', 'あいこ？もう一回！このままじゃ終われない。']],
  tttWin: [['Impossible… you actually beat me? Rematch. Now.', 'うそ…負けた？もう一回、今すぐ！']],
  tttLoss: [['Hehe, I win. You looked so serious, senpai.', 'えへへ、私の勝ち。真剣な顔、かわいかったよ。']],
  tttDraw: [['A draw. I will let you have this one. Just this one.', '引き分けだね。今回だけ許してあげる。']],
  memMatch: [['Hmph, nice one.', 'むっ、やるじゃん。'], ['A match! You do have a brain in there.', 'ペア成立！ちゃんと頭使ってるね。']],
  memMiss: [['Not that one, senpai.', 'それじゃないよ、センパイ。'], ['I could have told you that was wrong.', 'そこは違うって教えられたのに。']],
  memWin: [['All pairs found. I am only a little impressed.', '全部見つけたね。ちょっとだけ感心したかも。']],
    omikuji: [['Do not look so nervous. It is only paper.', 'そんなに緊張しないでよ、ただの紙だよ。']],
    reflex: [['Ready, senpai? Try not to blink.', '準備できた？まばたきしないでね、センパイ。']],
    starcatch: [['Catch the stars for me, senpai.', '星をつかまえてね、センパイ。']],
    highlow: [['I picked a number. Think carefully.', '数字を選んだよ。よく考えてね。']],
  again: [['You already drew today, senpai. Do not be greedy.', '今日はもう引いたでしょ、センパイ。欲張らないの。']],
};

const says = $('#says-text');
const speakToggle = $('#speak-reactions');
const scoreboard = $('#scoreboard');
const wantsJapanese = () => loadVoicePrefs().language === 'ja';
function say(pair) {
  const line = wantsJapanese() ? pair[1] : pair[0];
  says.textContent = line;
  if (speakToggle?.checked) speakWaifu(line, { forceLang: wantsJapanese() ? 'ja' : 'en' });
}
window.addEventListener('vesper:arcade-reaction', (event) => {
  const reactions = {
    happy: ['That was a lovely round. I am a little impressed.', 'いい勝負だったね。ちょっと感心しちゃった。'],
    joy: ['You did it! I knew you had that in you, senpai.', 'やったね！できるって思ってたよ、センパイ。'],
    sad: ['Aw, that one got away. Shall we try again?', 'あらら、今回は残念。もう一回やってみる？'],
    surprised: ['Oh! That was unexpected. Nicely played.', 'わあ、予想外だった！お見事。'],
    neutral: ['A thoughtful round. Ready for another?', '落ち着いた一局だったね。もう一回する？'],
  };
  say(reactions[event.detail?.emotion] || reactions.happy);
  window.setExpression?.(event.detail?.emotion || 'happy', 0.8, 0.45);
});

function renderScore(game) {
  const rows = {
    jkp: [['WINS', stats.jkp.w], ['LOSSES', stats.jkp.l], ['DRAWS', stats.jkp.d], ['BEST STREAK', stats.jkp.best]],
    ttt: [['WINS', stats.ttt.w], ['LOSSES', stats.ttt.l], ['DRAWS', stats.ttt.d]],
    memory: [['BEST (FEWEST MOVES)', stats.memory.best || '—']],
    omikuji: [['TODAY', stats.omikuji.day === new Date().toDateString() ? 'DRAWN' : 'NOT YET']],
    reflex: [['BEST (MS)', stats.reflex.best || '—']],
    starcatch: [['BEST STARS', stats.starcatch.best || '—']],
    highlow: [['BEST GUESSES', stats.highlow.best || '—']],
  }[game] || [];
  scoreboard.replaceChildren(...rows.map(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'stat';
    const name = document.createElement('span'); name.textContent = label;
    const number = document.createElement('b'); number.textContent = String(value);
    item.append(name, number);
    return item;
  }));
}

// ---- Tabs -------------------------------------------------------------
const tabs = [...document.querySelectorAll('[role="tab"]')];
const panels = [...document.querySelectorAll('.game-panel')];
let currentGame = null;
const EXTRA_INTROS = {
  '2048': ['Match the tiles. I believe you can make it to 2048, senpai.', 'タイルを合わせてね。2048までいけるかな、センパイ。'],
  mines: ['Careful now. Your first tile is always safe.', '慎重にね。最初のマスは必ず安全だよ。'],
  snake: ['Collect the moon fruit. Try not to run into yourself.', '月の実を集めてね。自分にぶつからないように。'],
  dvd: ['Let the little star drift. Corner hits are lucky.', '星を漂わせてみて。角に当たったらラッキー。'],
  cow: ['Listen carefully. The bell will tell you when you are close.', '耳を澄ませて。近づくとベルが教えてくれるよ。'],
  cookie: ['A cookie garden? Finally, a game I can support.', 'クッキー農園？やっと私にも応援できるゲームだね。'],
  hacker: ['Type dramatically. The terminal is very impressed.', 'かっこよくタイプして。端末も感心してるよ。'],
  thoughts: ['Take your time. You can let one small thought float away.', 'ゆっくりでいいよ。小さな悩みをひとつ、流してみよう。'],
  silk: ['Make something soft and luminous. I will watch.', 'やさしく光るものを描いてみて。見てるね。'],
  doodle: ['Draw a little something. I will take my best guess.', '何か描いてみて。私が当ててみるね。'],
  pointer: ['Every tiny pal is looking for you.', 'ちいさなお友達がみんなセンパイを見てるよ。'],
  'text-toy': ['Give me a phrase and I will add a little spell.', '言葉をひとつちょうだい。魔法をかけてあげる。'],
  ambience: ['Let us make a quiet little room together.', '静かな音のお部屋を作ろう。'],
};
const arcade = createArcadeFramework({ onActivate(game, _previous, { announce }) {
  currentGame = game;
  if (game) {
    renderScore(game);
    const intro = Q.intro[game] || EXTRA_INTROS[game];
    if (announce && intro) say(intro);
    try { history.replaceState(null, '', `#${game}`); } catch { /* The address bar is optional. */ }
  } else {
    try { history.replaceState(null, '', location.pathname); } catch { /* The address bar is optional. */ }
  }
} });
for (const tab of tabs) {
  const panel = panels.find((item) => item.dataset.panel === tab.dataset.game);
  if (panel) arcade.register({ id: tab.dataset.game, tab, panel });
}
function show(game, announce = true) { arcade.activate(game, { announce }); }

// ---- Jan-Ken-Pon ------------------------------------------------------
const HANDS = [{ id: 'rock', icon: 'ROCK' }, { id: 'scissors', icon: 'SCISSORS' }, { id: 'paper', icon: 'PAPER' }];
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
let streak = 0;
document.querySelectorAll('.hand').forEach((button) => button.addEventListener('click', () => {
  const mine = pick(HANDS);
  const yours = HANDS.find((hand) => hand.id === button.dataset.hand);
  $('#jkp-you').textContent = yours.icon;
  $('#jkp-her').textContent = mine.icon;
  let outcome = 'Draw';
  if (BEATS[yours.id] === mine.id) outcome = 'Win';
  else if (BEATS[mine.id] === yours.id) outcome = 'Loss';
  if (outcome === 'Win') { stats.jkp.w += 1; streak += 1; stats.jkp.best = Math.max(stats.jkp.best, streak); }
  else { streak = 0; if (outcome === 'Loss') stats.jkp.l += 1; else stats.jkp.d += 1; }
  $('#jkp-result').textContent = outcome === 'Win' ? 'You win!' : outcome === 'Loss' ? 'Vesper wins!' : 'Draw, go again!';
  saveStats();
  renderScore('jkp');
  say(pick(Q[`jkp${outcome}`]));
}));

// ---- Tic-Tac-Toe (Vesper uses minimax) --------------------------------
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
let board = Array(9).fill(null);
let tttOver = false;
const tttEl = $('#ttt-board');
const tttStatus = $('#ttt-status');

function lineWinner(cells) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return { who: cells[a], line };
  }
  return cells.every(Boolean) ? { who: 'draw', line: [] } : null;
}
function minimax(cells, player) {
  const result = lineWinner(cells);
  if (result) return result.who === 'O' ? 1 : result.who === 'X' ? -1 : 0;
  let best = player === 'O' ? -2 : 2;
  for (let i = 0; i < 9; i += 1) {
    if (cells[i]) continue;
    cells[i] = player;
    const score = minimax(cells, player === 'O' ? 'X' : 'O');
    cells[i] = null;
    best = player === 'O' ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}
function vesperMove() {
  const free = board.map((value, index) => (value ? null : index)).filter((index) => index !== null);
  if ($('#ttt-level').value === 'easy' && Math.random() < 0.55) return pick(free);
  let bestScore = -2; let moves = [];
  for (const index of free) {
    board[index] = 'O';
    const score = minimax(board, 'X');
    board[index] = null;
    if (score > bestScore) { bestScore = score; moves = [index]; } else if (score === bestScore) moves.push(index);
  }
  return pick(moves);
}
function renderTtt(winLine = []) {
  tttEl.replaceChildren(...board.map((value, index) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `ttt-cell${winLine.includes(index) ? ' win' : ''}${value ? ` ${value.toLowerCase()}` : ''}`;
    cell.textContent = value || '';
    cell.disabled = Boolean(value) || tttOver;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}, ${value || 'empty'}`);
    cell.addEventListener('click', () => playerMove(index));
    return cell;
  }));
}
function finishTtt(result) {
  tttOver = true;
  if (result.who === 'X') { stats.ttt.w += 1; tttStatus.textContent = 'You win!'; say(pick(Q.tttWin)); }
  else if (result.who === 'O') { stats.ttt.l += 1; tttStatus.textContent = 'Vesper wins!'; say(pick(Q.tttLoss)); }
  else { stats.ttt.d += 1; tttStatus.textContent = 'It is a draw.'; say(pick(Q.tttDraw)); }
  saveStats();
  renderScore('ttt');
  renderTtt(result.line);
}
function playerMove(index) {
  if (tttOver || board[index]) return;
  board[index] = 'X';
  let result = lineWinner(board);
  if (result) { finishTtt(result); return; }
  tttStatus.textContent = 'Vesper is thinking…';
  tttOver = true;
  renderTtt();
  window.setTimeout(() => {
    tttOver = false;
    board[vesperMove()] = 'O';
    result = lineWinner(board);
    if (result) { finishTtt(result); return; }
    tttStatus.textContent = 'Your move.';
    renderTtt();
  }, 420);
}
function newTtt() { board = Array(9).fill(null); tttOver = false; tttStatus.textContent = 'Your move.'; renderTtt(); }
$('#ttt-reset').addEventListener('click', newTtt);

// ---- Memory Match -----------------------------------------------------
const FACES = ['MOON', 'STAR', 'CAT', 'FLOWER', 'SHELL', 'SUN', 'LEAF', 'HEART'];
const memEl = $('#mem-board');
let deck = []; let open = []; let matched = new Set(); let moves = 0; let locked = false;
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function renderMemory() {
  memEl.replaceChildren(...deck.map((face, index) => {
    const card = document.createElement('button');
    const faceUp = open.includes(index) || matched.has(index);
    card.type = 'button';
    card.className = `mem-card${faceUp ? ' up' : ''}${matched.has(index) ? ' done' : ''}`;
    card.textContent = faceUp ? face : '?';
    card.disabled = faceUp || locked;
    card.setAttribute('aria-label', faceUp ? `Card ${index + 1}, ${face}` : `Card ${index + 1}, face down`);
    card.addEventListener('click', () => flip(index));
    return card;
  }));
  $('#mem-moves').textContent = String(moves);
}
function flip(index) {
  if (locked || open.includes(index) || matched.has(index)) return;
  open.push(index);
  if (open.length < 2) { renderMemory(); return; }
  moves += 1;
  const [a, b] = open;
  if (deck[a] === deck[b]) {
    matched.add(a); matched.add(b); open = [];
    renderMemory();
    if (matched.size === deck.length) {
      stats.memory.best = stats.memory.best ? Math.min(stats.memory.best, moves) : moves;
      saveStats(); renderScore('memory');
      $('#mem-status').textContent = `All pairs found in ${moves} moves!`;
      say(pick(Q.memWin));
    } else { say(pick(Q.memMatch)); }
    return;
  }
  locked = true;
  renderMemory();
  if (moves % 2 === 0) say(pick(Q.memMiss));
  window.setTimeout(() => { open = []; locked = false; renderMemory(); }, 800);
}
function newMemory() {
  deck = shuffle([...FACES, ...FACES]); open = []; matched = new Set(); moves = 0; locked = false;
  $('#mem-status').textContent = 'Find the pairs, senpai.';
  renderMemory();
}
$('#mem-reset').addEventListener('click', newMemory);

// ---- Omikuji (one fortune per day) ------------------------------------
const FORTUNES = [
  { rank: '大吉', label: 'Dai-kichi · great blessing', text: 'Everything is going your way today. Do the brave thing you have been putting off.' },
  { rank: '中吉', label: 'Chū-kichi · middle blessing', text: 'A good day, as long as you do not rush. Be kind to someone who is tired.' },
  { rank: '小吉', label: 'Shō-kichi · small blessing', text: 'Small joys are hiding in ordinary places. Look twice, senpai.' },
  { rank: '吉', label: 'Kichi · blessing', text: 'Steady and pleasant. Drink some water and talk to someone you like.' },
  { rank: '末吉', label: 'Sue-kichi · future blessing', text: 'Things get better later. Be patient with yourself until then.' },
  { rank: '凶', label: 'Kyō · bad luck', text: 'Bad luck can be tied to a shrine tree and left behind. Take it easy and double-check your plans.' },
];
function showFortune(index) {
  const fortune = FORTUNES[index];
  $('#omi-rank').textContent = fortune.rank;
  $('#omi-label').textContent = fortune.label;
  $('#omi-text').textContent = fortune.text;
}
$('#omi-draw').addEventListener('click', () => {
  const today = new Date().toDateString();
  if (stats.omikuji.day === today && stats.omikuji.index >= 0) { showFortune(stats.omikuji.index); say(pick(Q.again)); return; }
  const index = Math.floor(Math.random() * FORTUNES.length);
  stats.omikuji = { day: today, index };
  saveStats(); renderScore('omikuji'); showFortune(index);
  say(pick(Q.omikuji));
});

// ---- Reflex Test -------------------------------------------------------
const reflexArena = $('#reflex-arena'); const reflexPrompt = $('#reflex-prompt'); const reflexStatus = $('#reflex-status'); const reflexBest = $('#reflex-best');
let reflexReadyAt = 0; let reflexTimer = null; let reflexWaiting = false;
function renderReflexBest() { reflexBest.textContent = stats.reflex.best ? `${stats.reflex.best}ms` : '—'; }
function resetReflex() { window.clearTimeout(reflexTimer); reflexReadyAt = 0; reflexWaiting = false; reflexArena.classList.remove('ready', 'false-start'); reflexPrompt.textContent = 'PRESS START'; reflexStatus.textContent = 'Your best reaction will be kept locally.'; }
$('#reflex-start').addEventListener('click', () => { resetReflex(); reflexWaiting = true; reflexPrompt.textContent = 'WAIT FOR PINK…'; reflexStatus.textContent = 'Do not tap early.'; reflexTimer = window.setTimeout(() => { reflexReadyAt = performance.now(); reflexArena.classList.add('ready'); reflexPrompt.textContent = 'TAP NOW'; }, 900 + Math.random() * 1800); });
reflexArena.addEventListener('click', () => { if (!reflexWaiting) return; if (!reflexReadyAt) { window.clearTimeout(reflexTimer); reflexWaiting = false; reflexArena.classList.add('false-start'); reflexPrompt.textContent = 'TOO SOON'; reflexStatus.textContent = 'Hmph. Wait for the pink star next time.'; return; } const result = Math.round(performance.now() - reflexReadyAt); reflexWaiting = false; reflexArena.classList.remove('ready'); reflexPrompt.textContent = `${result} MS`; reflexStatus.textContent = result < 260 ? 'That was fast, senpai.' : 'You can do better than that.'; if (!stats.reflex.best || result < stats.reflex.best) { stats.reflex.best = result; saveStats(); } renderReflexBest(); say(pick(Q.reflex)); });

// ---- Star Catch --------------------------------------------------------
const starArena = $('#starcatch-arena'); const starTarget = $('#starcatch-target'); const starCount = $('#starcatch-count'); const starTime = $('#starcatch-time'); const starBest = $('#starcatch-best'); const starStatus = $('#starcatch-status');
let starActive = false; let starScore = 0; let starSeconds = 20; let starInterval = null;
function moveStar() { starTarget.style.left = `${8 + Math.random() * 80}%`; starTarget.style.top = `${10 + Math.random() * 72}%`; }
function finishStarCatch() { starActive = false; window.clearInterval(starInterval); starTarget.disabled = true; starStatus.textContent = `${starScore} stars. ${starScore >= 15 ? 'That was dazzling, senpai.' : 'A quiet little night.'}`; if (!stats.starcatch.best || starScore > stats.starcatch.best) { stats.starcatch.best = starScore; saveStats(); } renderScore('starcatch'); say(starScore >= 15 ? ['You caught so many! I am impressed.', 'すごい数だね！感心しちゃった。'] : ['A gentle night, then. Try again?', '穏やかな夜だったね。もう一回する？']); }
$('#starcatch-start').addEventListener('click', () => { starActive = true; starScore = 0; starSeconds = 20; starCount.textContent = '0'; starTime.textContent = '20'; starTarget.disabled = false; moveStar(); starStatus.textContent = 'Catch, catch, catch!'; window.clearInterval(starInterval); starInterval = window.setInterval(() => { starSeconds -= 1; starTime.textContent = String(starSeconds); if (starSeconds <= 0) finishStarCatch(); }, 1000); say(pick(Q.starcatch)); });
starTarget.addEventListener('click', () => { if (!starActive) return; starScore += 1; starCount.textContent = String(starScore); moveStar(); if (starScore % 5 === 0) say(['Five more! Do not slow down, senpai.', 'あと五つ！スピード落とさないでね。']); });

// ---- High-Low ----------------------------------------------------------
const highlowInput = $('#highlow-input'); const highlowGuess = $('#highlow-guess'); const highlowNew = $('#highlow-new'); const highlowStatus = $('#highlow-status'); const highlowBest = $('#highlow-best');
let highlowSecret = 1 + Math.floor(Math.random() * 100); let highlowAttempts = 0;
function newHighLow() { highlowSecret = 1 + Math.floor(Math.random() * 100); highlowAttempts = 0; highlowInput.value = ''; highlowStatus.textContent = 'I have a number in mind…'; }
function checkHighLow() { const guess = Number(highlowInput.value); if (!Number.isInteger(guess) || guess < 1 || guess > 100) { highlowStatus.textContent = 'Choose a whole number from 1 to 100.'; return; } highlowAttempts += 1; if (guess === highlowSecret) { highlowStatus.textContent = `Correct in ${highlowAttempts} guess${highlowAttempts === 1 ? '' : 'es'}!`; if (!stats.highlow.best || highlowAttempts < stats.highlow.best) { stats.highlow.best = highlowAttempts; saveStats(); } renderScore('highlow'); say(highlowAttempts <= 4 ? ['You found it quickly. Not bad, senpai.', '早く見つけたね。なかなかやるじゃん。'] : ['You got there eventually. I will allow it.', 'やっと見つけたね。まあ、許してあげる。']); } else { highlowStatus.textContent = guess < highlowSecret ? 'Higher.' : 'Lower.'; say(pick([['Nope. Think a little bigger.', '違うよ。もう少し大きく。'], ['Nope. Think smaller, senpai.', '違うよ。もう少し小さく、センパイ。']])); } highlowInput.select(); }
highlowGuess.addEventListener('click', checkHighLow); highlowInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') checkHighLow(); }); highlowNew.addEventListener('click', () => { newHighLow(); say(pick(Q.highlow)); });
if (stats.omikuji.day === new Date().toDateString() && stats.omikuji.index >= 0) showFortune(stats.omikuji.index);

newTtt();
newMemory();
renderReflexBest(); starBest.textContent = stats.starcatch.best || '—'; highlowBest.textContent = stats.highlow.best || '—'; starTarget.disabled = true;
const start = location.hash.replace('#', '');
initializeArcadeExtras(arcade);
initializeArcadeToys(arcade);
initializeArcadeUtilityPack(arcade);
show(arcade.list().some((game) => game.id === start) ? start : 'jkp');
