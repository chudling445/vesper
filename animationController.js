const GESTURE_ALIASES = {
  wave: /wave|greet/i,
  nod: /nod|agree|yes/i,
  thinking: /think|ponder/i,
  bow: /bow|thanks|thank/i,
  shrug: /shrug|uncertain/i,
  dance: /dance|celebrat/i,
};

/**
 * Owns the optional authored VRM animation clips. The avatar's procedural
 * controller remains the fallback when a model does not contain a clip.
 */
export class AvatarAnimationController {
  constructor(THREE, vrm, clips = []) {
    this.THREE = THREE;
    this.vrm = vrm;
    this.root = vrm?.scene || null;
    this.mixer = this.root && clips.length ? new THREE.AnimationMixer(this.root) : null;
    this.actions = new Map();
    this.activeAction = null;
    this.activeName = '';
    this.fadingActions = new Map();
    this.stopTimer = 0;
    this.disposed = false;

    if (this.mixer) {
      for (const clip of clips) {
        if (clip?.name) this.actions.set(clip.name.toLowerCase(), this.mixer.clipAction(clip));
      }
    }
  }

  get isPlaying() { return Boolean(this.activeAction?.isRunning() || this.fadingActions.size); }

  fadeAction(action, seconds) {
    if (!action) return;
    const existing = this.fadingActions.get(action);
    if (existing) window.clearTimeout(existing);
    const duration = Math.max(0, Number(seconds) || 0);
    if (!duration) {
      action.stop();
      this.fadingActions.delete(action);
      return;
    }
    action.fadeOut(duration);
    const timer = window.setTimeout(() => {
      action.stop();
      this.fadingActions.delete(action);
    }, duration * 1000 + 32);
    this.fadingActions.set(action, timer);
  }

  findAction(name) {
    const key = String(name || '').toLowerCase();
    const direct = this.actions.get(key);
    if (direct) return direct;
    const pattern = GESTURE_ALIASES[key];
    if (!pattern) return null;
    for (const [clipName, action] of this.actions) if (pattern.test(clipName)) return action;
    return null;
  }

  play(name, holdMs = 1900) {
    if (this.disposed) return false;
    const action = this.findAction(name);
    if (!action) return false;
    window.clearTimeout(this.stopTimer);
    const fadeTimer = this.fadingActions.get(action);
    if (fadeTimer) window.clearTimeout(fadeTimer);
    this.fadingActions.delete(action);
    const previous = this.activeAction;
    action.reset();
    action.enabled = true;
    action.setLoop(this.THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(0.2).play();
    if (previous && previous !== action) this.fadeAction(previous, 0.18);
    this.activeAction = action;
    this.activeName = String(name || '');
    const hold = Math.min(6000, Math.max(450, Number(holdMs) || 1900));
    this.stopTimer = window.setTimeout(() => this.stop(0.25), hold);
    return true;
  }

  stop(fadeSeconds = 0.2) {
    window.clearTimeout(this.stopTimer);
    this.stopTimer = 0;
    this.fadeAction(this.activeAction, fadeSeconds);
    this.activeAction = null;
    this.activeName = '';
  }

  update(deltaSeconds) {
    if (!this.disposed) this.mixer?.update(Math.min(0.05, Math.max(0, Number(deltaSeconds) || 0)));
  }

  dispose() {
    if (this.disposed) return;
    this.stop(0);
    this.mixer?.stopAllAction();
    for (const timer of this.fadingActions.values()) window.clearTimeout(timer);
    this.fadingActions.clear();
    this.mixer?.uncacheRoot(this.root);
    this.actions.clear();
    this.disposed = true;
  }
}
