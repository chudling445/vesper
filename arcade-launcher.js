/** Small cross-view doorway into the offline arcade. */
export function launchVesperArcadeGame(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) return false;
  const arcade = window.vesperArcade;
  if (arcade?.version === 1 && arcade.list().some((game) => game.id === id)) return arcade.launch(id);
  window.location.assign('/games#' + encodeURIComponent(id));
  return true;
}

window.vesperArcadeLauncher = Object.freeze({
  version: 1,
  launch: launchVesperArcadeGame,
  pause: () => window.vesperArcade?.pause?.() ?? false,
  resume: () => window.vesperArcade?.resume?.() ?? false,
  exit: () => window.vesperArcade?.exit?.() ?? false,
});
