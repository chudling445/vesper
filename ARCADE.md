# Vesper Arcade

Vesper's arcade is a local-only collection of games, creative tools, and small utilities. It uses the app's existing browser storage and IndexedDB-backed `appStore`; it does not embed third-party game sites or fetch game assets from the network.

The current registry contains 53 modules, including conventional games, puzzles, and creative toys. This is below the larger 80-module vision; the number is the live registry count, not a claim that every module is a conventional game or independently acceptance-tested.

## Included modules

The arcade currently includes the original casual games, plus local implementations for 2048, Minesweeper, Snake, a bouncing logo, cow finder, cookie idle garden, Hacker Typer, Pixel Thoughts, mirrored silk drawing, a doodle guessing toy, pointer pals, text transformations, ambient audio, koala dots, an endless horse, cat bounce, eel slap, wiggle physics, zoom art, Dino Dash, a retro desktop, daily Wordle, trivia, a pocket sky, Connect Four, a paper roll, synthesized radio tones, a beat sequencer, Patatap-style key sparks, fluid-like canvas drawing, a pocket piano, habit quests, a scream-into-the-void particle toy, animal facts, a light board, a password strength toy, a trust-game simulation, a button garden, a surreal prompt generator, local awards, an offline joke gallery, a geography quiz, a moodboard, local note search, Tetris, and the existing local chess game.

Several modules are deliberately lightweight offline interpretations: the geography quiz does not include panoramic street imagery, the radio makes local tones rather than streaming stations, and the star map is a small procedural sky rather than an astronomical catalog. Wordle is a single-grid daily puzzle. These can be replaced or extended without changing the arcade lifecycle.

## Arcade lifecycle API

On `games.html`, `window.vesperArcade` exposes the registry:

```js
const remove = window.vesperArcade.register({
  id: 'my-local-game',
  title: 'My local game',
  mount(panel) {
    const message = document.createElement('p');
    message.textContent = 'Ready to play.';
    panel.append(message);
  },
  onEnter() {},
  onPause() {},
  onResume() {},
  onExit() {},
});

window.vesperArcade.launch('my-local-game');
window.vesperArcade.reportScore('my-local-game', 12);
window.vesperArcade.react('happy', { game: 'my-local-game' });
```

Registration creates a tab and panel. Module ids must be lowercase and may contain digits and hyphens. `register` returns a remover that exits the game if active and removes its UI. Keep animation frames and timers scoped to the module and stop them on pause/exit; pause audio contexts when possible. Use text nodes or safe DOM APIs for user-provided content.

The cross-page helper is `window.vesperArcadeLauncher`. Its `launch(id)` opens `/games#<id>` when the registry is not loaded in the current view; `pause()`, `resume()`, and `exit()` forward to the active registry. The arcade accepts those hash links as deep links.

## Local persistence

Arcade scores and saved toys live under `workspace.arcade` in `appStore`. Existing classic-game compatibility stats remain under `workspace.arcade.classic`. Cookie Garden progress and moodboard pins are local. The arcade theme uses the `vesper-arcade-theme-v1` local-storage preference and currently offers Sakura, Retro, Neon, and Pastel palettes.

## Offline packaging

When adding an arcade module, add its script to the service worker app shell and to both installer payload lists. Register any new static module file in `server.mjs`. The modules in this arcade are bundled locally and do not require a network connection after installation.
