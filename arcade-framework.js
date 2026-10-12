/**
 * Small lifecycle registry for the Vesper arcade. It keeps game activation,
 * pausing and teardown in one place, and exposes a stable API for extensions.
 */
export function createArcadeFramework({ onActivate = () => {} } = {}) {
  const games = new Map();
  let activeId = null;
  let paused = false;

  function emit() {
    window.dispatchEvent(new CustomEvent('vesper:arcade-state', {
      detail: { activeId, paused, game: activeId ? games.get(activeId) || null : null },
    }));
  }

  function activate(id, { announce = true } = {}) {
    const next = games.get(id);
    if (!next) return false;
    const previousId = activeId;
    const previous = previousId ? games.get(previousId) : null;
    if (previousId === id && !paused) return true;

    if (previous && previousId !== id) previous.onExit?.();
    activeId = id;
    paused = false;
    for (const game of games.values()) {
      game.panel.hidden = game.id !== id;
      game.tab?.setAttribute('aria-selected', String(game.id === id));
      game.tab?.setAttribute('tabindex', game.id === id ? '0' : '-1');
    }
    if (previousId !== id) next.onEnter?.();
    else next.onResume?.();
    onActivate(id, previousId, { announce });
    emit();
    return true;
  }

  function pause() {
    if (!activeId || paused) return false;
    paused = true;
    games.get(activeId)?.onPause?.();
    emit();
    return true;
  }

  function resume() {
    if (!activeId || !paused) return false;
    paused = false;
    games.get(activeId)?.onResume?.();
    emit();
    return true;
  }

  function exit() {
    if (!activeId) return false;
    const previousId = activeId;
    games.get(previousId)?.onExit?.();
    activeId = null;
    paused = false;
    for (const game of games.values()) {
      game.panel.hidden = true;
      game.tab?.setAttribute('aria-selected', 'false');
      game.tab?.setAttribute('tabindex', '-1');
    }
    onActivate(null, previousId, { announce: false });
    emit();
    return true;
  }

  function register({ id, tab, panel, title, mount, onEnter, onPause, onResume, onExit }) {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) throw new TypeError('Arcade game ids must use lowercase letters, digits, and hyphens.');
    if (games.has(id)) throw new Error(`Arcade game "${id}" is already registered.`);

    let gameTab = tab;
    let gamePanel = panel;
    if (!gameTab || !gamePanel) {
      const tabList = document.querySelector('.arcade-tabs');
      const gameCard = document.querySelector('.game-card');
      if (!tabList || !gameCard || typeof title !== 'string') throw new Error(`Game "${id}" needs a tab and panel, or a title for automatic registration.`);
      gameTab = document.createElement('button');
      gameTab.type = 'button';
      gameTab.role = 'tab';
      gameTab.dataset.game = id;
      gameTab.setAttribute('aria-selected', 'false');
      gameTab.setAttribute('tabindex', '-1');
      gameTab.textContent = title;
      gamePanel = document.createElement('section');
      gamePanel.className = 'game-panel';
      gamePanel.dataset.panel = id;
      gamePanel.hidden = true;
      gamePanel.setAttribute('aria-label', title);
      mount?.(gamePanel);
      tabList.append(gameTab);
      gameCard.append(gamePanel);
    }
    if (!(gameTab instanceof HTMLElement) || !(gamePanel instanceof HTMLElement)) throw new TypeError(`Game "${id}" requires an HTML tab and panel.`);

    const game = { id, tab: gameTab, panel: gamePanel, onEnter, onPause, onResume, onExit };
    gameTab.addEventListener('click', () => activate(id));
    gameTab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const ordered = [...games.values()];
      const index = ordered.findIndex((item) => item.id === id);
      const target = event.key === 'Home' ? ordered[0]
        : event.key === 'End' ? ordered.at(-1)
          : ordered[(index + (event.key === 'ArrowRight' ? 1 : -1) + ordered.length) % ordered.length];
      target?.tab?.focus();
      if (target) activate(target.id);
    });
    games.set(id, game);
    return () => {
      if (activeId === id) exit();
      gameTab.remove();
      gamePanel.remove();
      games.delete(id);
    };
  }

  const api = {
    version: 1,
    register,
    launch: (id) => activate(id),
    activate,
    reportScore: (id, value, options = {}) => {
      if (!games.has(id) || !Number.isFinite(value) || value < 0) return false;
      window.dispatchEvent(new CustomEvent('vesper:arcade-report-score', { detail: { id, value, lowerIsBetter: Boolean(options.lowerIsBetter) } }));
      return true;
    },
    react: (emotion = 'happy', result = {}) => {
      const allowed = ['happy', 'joy', 'sad', 'surprised', 'neutral'];
      if (!allowed.includes(emotion)) return false;
      window.dispatchEvent(new CustomEvent('vesper:arcade-reaction', { detail: { emotion, result } }));
      return true;
    },
    pause,
    resume,
    exit,
    list: () => [...games.values()].map(({ id, tab, panel }) => ({ id, title: tab.textContent, panel })),
    get activeId() { return activeId; },
    get paused() { return paused; },
  };
  window.vesperArcade = api;

  const pauseButton = document.querySelector('#arcade-pause');
  const resumeButton = document.querySelector('#arcade-resume');
  const exitButton = document.querySelector('#arcade-exit');
  const sessionStatus = document.querySelector('#arcade-session-status');
  pauseButton?.addEventListener('click', pause);
  resumeButton?.addEventListener('click', resume);
  exitButton?.addEventListener('click', exit);
  const updateControls = () => {
    const game = activeId ? games.get(activeId) : null;
    if (pauseButton) pauseButton.disabled = !activeId || paused;
    if (resumeButton) resumeButton.hidden = !activeId || !paused;
    if (exitButton) exitButton.disabled = !activeId;
    if (sessionStatus) sessionStatus.textContent = !game ? 'Ready when you are' : paused ? `${game.tab.textContent.trim()} is paused` : `Playing ${game.tab.textContent.trim()}`;
  };
  window.addEventListener('vesper:arcade-state', updateControls);
  updateControls();

  document.querySelector('#arcade-search')?.addEventListener('input', (event) => {
    const query = event.currentTarget.value.trim().toLocaleLowerCase();
    for (const game of games.values()) game.tab.hidden = Boolean(query) && !game.tab.textContent.toLocaleLowerCase().includes(query);
  });
  const themeSelect = document.querySelector('#arcade-theme');
  const savedTheme = (() => { try { return localStorage.getItem('vesper-arcade-theme-v1'); } catch { return null; } })();
  if (themeSelect && ['sakura', 'retro', 'neon', 'pastel'].includes(savedTheme)) themeSelect.value = savedTheme;
  if (themeSelect) {
    document.body.dataset.arcadeTheme = themeSelect.value;
    themeSelect.addEventListener('change', () => {
      const theme = ['sakura', 'retro', 'neon', 'pastel'].includes(themeSelect.value) ? themeSelect.value : 'sakura';
      document.body.dataset.arcadeTheme = theme;
      try { localStorage.setItem('vesper-arcade-theme-v1', theme); } catch { /* The current tab still uses the selected palette. */ }
      window.dispatchEvent(new CustomEvent('vesper:arcade-theme', { detail: { theme } }));
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && activeId && !paused) pause();
  });
  return api;
}
