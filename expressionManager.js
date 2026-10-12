const CHANNELS = [
  'happy', 'angry', 'sad', 'surprised', 'relaxed', 'joy', 'fun',
  'lookUp', 'lookDown', 'lookLeft', 'lookRight', 'blush', 'blink', 'blinkLeft', 'blinkRight',
];

const PRESETS = {
  neutral: {}, happy: { happy: 1 }, angry: { angry: 1 }, sad: { sad: 1 },
  surprised: { surprised: 1 }, relaxed: { relaxed: 1 }, joy: { joy: 1 }, fun: { fun: 1 },
  lookup: { lookUp: 1 }, lookdown: { lookDown: 1 }, lookleft: { lookLeft: 1 }, lookright: { lookRight: 1 },
  blush: { blush: 0.68, relaxed: 0.18 }, wink: { blinkLeft: 1 },
  smirk: { happy: 0.34, angry: 0.42 }, grin: { happy: 0.78 }, pout: { angry: 0.56, sad: 0.22 },
  shy: { relaxed: 0.62, happy: 0.28, sad: 0.08 }, fond: { relaxed: 0.57, happy: 0.42 },
  curious: { surprised: 0.36, relaxed: 0.2 }, thinking: { relaxed: 0.54, sad: 0.12 },
  soft: { relaxed: 0.69, sad: 0.18 }, embarrassed: { relaxed: 0.48, happy: 0.2, sad: 0.16 },
  excited: { happy: 0.58, surprised: 0.4 }, teasing: { happy: 0.48, angry: 0.22 },
};

const FALLBACKS = {
  joy: { happy: 0.8 }, fun: { happy: 0.65 },
  lookUp: {}, lookDown: {}, lookLeft: {}, lookRight: {},
  blinkLeft: { blink: 1 },
};
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
const smoothstep = (value) => value * value * (3 - 2 * value);
const blankWeights = () => Object.fromEntries(CHANNELS.map((name) => [name, 0]));

/**
 * Frame-rate-independent VRM preset cross-fades and randomized blinking.
 * This class intentionally accepts the expressionManager surface from three-vrm
 * instead of importing a particular VRM runtime version.
 */
export class ExpressionManager {
  constructor(vrmExpressionManager, { random = Math.random, blinkRange = [3, 6], blinkDuration = [0.12, 0.19] } = {}) {
    this.manager = vrmExpressionManager || null;
    this.random = random;
    this.blinkRange = blinkRange;
    this.blinkDurationRange = blinkDuration;
    this.current = blankWeights();
    this.from = blankWeights();
    this.target = blankWeights();
    this.elapsed = 0;
    this.duration = 0.22;
    this.activeName = 'neutral';
    this.blinkWait = this.randomBetween(...blinkRange);
    this.blinkElapsed = 0;
    this.blinkDuration = 0;
    this.blinkWeight = 0;
  }

  randomBetween(min, max) { return min + this.random() * (max - min); }
  has(name) { return Boolean(this.manager?.getExpression?.(name)); }

  resolve(name) {
    return String(name || 'neutral').toLocaleLowerCase().replace(/[\s_-]/g, '');
  }

  resolveChannel(name) {
    const key = this.resolve(name);
    return CHANNELS.find((channel) => channel.toLowerCase() === key) || key;
  }

  supports(name) {
    const key = this.resolve(name);
    const preset = PRESETS[key];
    if (!preset) return false;
    if (key === 'neutral') return true;
    const weights = this.resolveWeights(preset, key);
    return Object.entries(weights).some(([channel, weight]) => weight > 0 && (!this.manager || this.has(channel)));
  }

  resolveWeights(preset, name) {
    const resolved = {};
    for (const [channel, weight] of Object.entries(preset)) {
      if (!this.manager || this.has(channel)) resolved[channel] = weight;
      else if (FALLBACKS[channel]) {
        for (const [fallback, fallbackWeight] of Object.entries(FALLBACKS[channel])) {
          if (!this.manager || this.has(fallback)) resolved[fallback] = Math.max(resolved[fallback] || 0, weight * fallbackWeight);
        }
      }
    }
    if (!Object.keys(resolved).length && (name === 'joy' || name === 'fun') && (!this.manager || this.has('happy'))) {
      resolved.happy = name === 'joy' ? 0.8 : 0.65;
    }
    return resolved;
  }

  setExpression(name, weight = 1, durationSeconds = this.duration) {
    const key = this.resolve(name);
    if (!Object.hasOwn(PRESETS, key)) return false;
    const weights = this.resolveWeights(PRESETS[key], key);
    if (key !== 'neutral' && Object.keys(weights).length === 0) return false;
    const intensity = clamp(weight);
    this.from = { ...this.current };
    this.target = blankWeights();
    for (const [channel, value] of Object.entries(weights)) this.target[channel] = clamp(value * intensity);
    this.elapsed = 0;
    this.duration = Math.max(0, Number(durationSeconds) || 0);
    this.activeName = key;
    if (!this.duration) this.current = { ...this.target };
    return true;
  }

  setBlendshape(name, weight) {
    const channel = this.resolveChannel(name);
    if (!CHANNELS.includes(channel)) return false;
    if (this.manager && !this.has(channel)) return false;
    this.current[channel] = clamp(weight);
    this.from[channel] = this.current[channel];
    this.target[channel] = this.current[channel];
    return true;
  }

  update(deltaSeconds, overlays = {}) {
    const delta = Math.min(0.1, Math.max(0, Number(deltaSeconds) || 0));
    if (this.duration > 0 && this.elapsed < this.duration) {
      this.elapsed = Math.min(this.duration, this.elapsed + delta);
      const t = smoothstep(this.elapsed / this.duration);
      for (const name of CHANNELS) this.current[name] = this.from[name] + (this.target[name] - this.from[name]) * t;
    } else {
      this.current = { ...this.target };
    }

    this.updateBlink(delta);
    for (const name of CHANNELS) {
      if (this.has(name)) this.manager.setValue(name, clamp(Math.max(this.current[name], overlays[name] || 0)));
    }
    this.applyBlink();
    return { ...this.current, blink: this.blinkWeight };
  }

  updateBlink(delta) {
    if (this.blinkDuration > 0) {
      this.blinkElapsed += delta;
      const progress = Math.min(1, this.blinkElapsed / this.blinkDuration);
      this.blinkWeight = Math.pow(Math.max(0, Math.sin(Math.PI * progress)), 0.72);
      if (progress >= 1) {
        this.blinkDuration = 0;
        this.blinkElapsed = 0;
        this.blinkWeight = 0;
        this.blinkWait = this.randomBetween(...this.blinkRange);
      }
    } else {
      this.blinkWait -= delta;
      if (this.blinkWait <= 0) {
        this.blinkDuration = this.randomBetween(...this.blinkDurationRange);
        this.blinkElapsed = 0;
        this.blinkWeight = 0;
      }
    }
  }

  applyBlink() {
    if (this.has('blink')) {
      this.manager.setValue('blink', Math.max(this.current.blink, this.blinkWeight));
      return;
    }
    if (this.has('blinkLeft')) this.manager.setValue('blinkLeft', Math.max(this.current.blinkLeft, this.blinkWeight));
    if (this.has('blinkRight')) this.manager.setValue('blinkRight', Math.max(this.current.blinkRight, this.blinkWeight));
  }
}

export const EXPRESSION_PRESETS = Object.freeze({ ...PRESETS });
