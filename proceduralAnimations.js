/**
 * proceduralAnimations.js — Vesper's authored procedural animation pack.
 *
 * `avatar.js` ships the core rig and a handful of gestures. This module layers
 * on a much richer set of full-body poses and multi-step sequences so a model
 * that has no baked animation clips still performs with detail: both arms,
 * wrists, torso, head, and legs move together instead of a single bone twitch.
 *
 * Poses are expressed as per-bone Euler offsets on normalized VRM bones. Angles
 * are radians. Bones a model does not expose are simply skipped by the rig.
 *
 * Install once per page after avatar.js loads:
 *   import { installVesperAnimationPack } from './proceduralAnimations.js';
 *   installVesperAnimationPack();
 */

/** Full-body procedural poses. Keys mirror avatar.js poseDefinitions names. */
export const ANIMATION_PACK = Object.freeze({
  // --- Greetings and social beats -----------------------------------
  peace: {
    head: { z: 0.14, x: -0.03 }, neck: { z: 0.06 },
    rightUpperArm: { x: -0.62, y: 0.2, z: -0.5 }, rightLowerArm: { x: -0.5, z: -0.72 }, rightHand: { z: -0.28 },
    leftUpperArm: { z: 0.1, x: -0.06 },
    chest: { z: -0.05 }, hips: { z: 0.05 },
  },
  salute: {
    head: { x: -0.05 }, neck: { x: -0.02 },
    rightUpperArm: { x: -0.9, y: 0.3, z: -0.2 }, rightLowerArm: { x: -0.95, z: -0.3 }, rightHand: { x: -0.2 },
    leftUpperArm: { z: 0.14 },
    chest: { x: -0.04 }, spine: { x: -0.02 },
  },
  point: {
    head: { y: -0.12, x: -0.04 },
    rightUpperArm: { x: -1.05, y: 0.24, z: -0.3 }, rightLowerArm: { x: -0.2, z: -0.12 }, rightHand: { x: 0.1 },
    leftUpperArm: { z: 0.16, x: 0.05 }, chest: { y: 0.06 },
  },
  victory: {
    head: { x: -0.12 },
    leftUpperArm: { x: -1.15, y: -0.2, z: 0.55 }, leftLowerArm: { x: -0.3, z: 0.5 }, leftHand: { z: 0.3 },
    rightUpperArm: { x: -1.15, y: 0.2, z: -0.55 }, rightLowerArm: { x: -0.3, z: -0.5 }, rightHand: { z: -0.3 },
    chest: { x: -0.12 }, spine: { x: -0.06 }, hips: { x: -0.03 },
  },
  // --- Affection -----------------------------------------------------
  heart: {
    head: { x: 0.06, z: -0.06 },
    leftUpperArm: { x: -0.72, y: -0.12, z: 0.62 }, leftLowerArm: { x: -0.62, z: 0.95 }, leftHand: { z: 0.34 },
    rightUpperArm: { x: -0.72, y: 0.12, z: -0.62 }, rightLowerArm: { x: -0.62, z: -0.95 }, rightHand: { z: -0.34 },
    chest: { x: 0.06 }, neck: { x: 0.05 },
  },
  shyHide: {
    head: { x: 0.2, z: 0.08 }, neck: { x: 0.08 },
    leftUpperArm: { x: -0.95, y: -0.1, z: 0.34 }, leftLowerArm: { x: -1.5, z: 1.05 }, leftHand: { x: 0.3 },
    rightUpperArm: { x: -0.95, y: 0.1, z: -0.34 }, rightLowerArm: { x: -1.5, z: -1.05 }, rightHand: { x: 0.3 },
    chest: { x: 0.1 }, spine: { x: 0.06 },
  },
  leanIn: {
    hips: { x: 0.07 }, spine: { x: -0.09 }, chest: { x: -0.1 },
    neck: { x: -0.08 }, head: { x: -0.14, z: -0.04 },
    leftUpperArm: { x: -0.06 }, rightUpperArm: { x: -0.06 },
  },
  hairTwirl: {
    head: { z: -0.16, y: 0.1, x: -0.05 }, neck: { z: -0.06 },
    leftUpperArm: { x: -1.0, y: -0.22, z: 0.5 }, leftLowerArm: { x: -1.25, z: 0.7 }, leftHand: { z: 0.5, x: 0.3 },
    rightUpperArm: { z: 0.12 }, chest: { z: -0.04 },
  },
  // --- Expressive / playful ------------------------------------------
  clap: {
    head: { x: -0.06 },
    leftUpperArm: { x: -0.85, y: -0.18, z: 0.5 }, leftLowerArm: { x: -1.0, z: 0.95 }, leftHand: { z: 0.2 },
    rightUpperArm: { x: -0.85, y: 0.18, z: -0.5 }, rightLowerArm: { x: -1.0, z: -0.95 }, rightHand: { z: -0.2 },
    chest: { x: -0.05 },
  },
  stretch: {
    head: { x: -0.24 }, neck: { x: -0.1 },
    leftUpperArm: { x: -1.45, y: -0.34, z: 0.42 }, leftLowerArm: { x: -0.2, z: 0.2 },
    rightUpperArm: { x: -1.45, y: 0.34, z: -0.42 }, rightLowerArm: { x: -0.2, z: -0.2 },
    chest: { x: -0.18 }, spine: { x: -0.1 }, hips: { x: -0.05 },
  },
  sleepy: {
    head: { x: 0.16, z: 0.14 }, neck: { x: 0.08, z: 0.06 },
    leftUpperArm: { x: -0.1, z: 0.16 }, rightUpperArm: { x: -0.05, z: -0.1 },
    chest: { x: 0.08 }, spine: { x: 0.05 }, hips: { x: 0.03 },
  },
  sway: {
    hips: { z: 0.06, y: 0.1 }, spine: { z: -0.05 }, chest: { z: -0.06 },
    neck: { z: -0.03 }, head: { z: -0.05, y: 0.06 },
    leftUpperArm: { x: -0.2, z: 0.2 }, rightUpperArm: { x: -0.1, z: -0.16 },
    leftLowerArm: { z: 0.16 }, rightLowerArm: { z: -0.12 },
  },
  perform: {
    hips: { z: -0.05, x: -0.04 }, spine: { x: -0.1 }, chest: { x: -0.12, z: 0.06 },
    head: { x: -0.1, z: 0.06 },
    leftUpperArm: { x: -1.2, y: -0.3, z: 0.7 }, leftLowerArm: { x: -0.4, z: 0.6 }, leftHand: { z: 0.4 },
    rightUpperArm: { x: -0.6, y: 0.35, z: -0.5 }, rightLowerArm: { x: -0.3, z: -0.4 }, rightHand: { z: -0.3 },
  },
  hairFlip: {
    head: { y: 0.3, z: -0.24, x: -0.08 }, neck: { y: 0.14, z: -0.1 },
    rightUpperArm: { x: -1.25, y: 0.4, z: -0.35 }, rightLowerArm: { x: -1.4, z: -0.5 }, rightHand: { x: 0.35, z: -0.3 },
    leftUpperArm: { z: 0.16 }, chest: { y: 0.08, z: -0.05 }, hips: { y: 0.06 },
  },
  openHands: {
    head: { x: -0.04 }, neck: { x: -0.02 },
    leftUpperArm: { x: -0.38, z: 0.42 }, leftLowerArm: { x: -0.25, z: 0.34 }, leftHand: { z: 0.14 },
    rightUpperArm: { x: -0.38, z: -0.42 }, rightLowerArm: { x: -0.25, z: -0.34 }, rightHand: { z: -0.14 },
    chest: { x: -0.04 }, spine: { x: -0.02 },
  },
  ponder: {
    head: { x: -0.12, z: 0.12 }, neck: { x: -0.05, z: 0.04 },
    leftUpperArm: { x: -0.5, z: 0.28 }, leftLowerArm: { x: -0.75, z: 0.62 }, leftHand: { x: 0.18 },
    rightUpperArm: { x: -0.16, z: -0.12 }, rightLowerArm: { x: -0.28, z: -0.18 },
    chest: { x: -0.03 }, hips: { z: 0.025 },
  },
  reassure: {
    head: { x: -0.04, z: -0.05 }, neck: { x: -0.02 },
    leftUpperArm: { x: -0.22, z: 0.24 }, leftLowerArm: { x: -0.2, z: 0.2 },
    rightUpperArm: { x: -0.22, z: -0.24 }, rightLowerArm: { x: -0.2, z: -0.2 },
    chest: { x: -0.06 }, spine: { x: -0.03 },
  },
  grounded: {
    head: { x: -0.02 }, neck: { x: -0.01 }, chest: { x: -0.025 },
    hips: { x: -0.02 }, leftUpperArm: { z: 0.07 }, rightUpperArm: { z: -0.07 },
  },
});

/**
 * Multi-step sequences. Each step names a pose, how long to hold it, and an
 * optional expression to fade to at that moment. The avatar loop's own
 * cross-fade blends between steps, so a sequence reads as one continuous
 * performance rather than a slideshow of stills.
 */
export const ANIMATION_SEQUENCES = Object.freeze({
  greeting: [
    { pose: 'wave', holdMs: 900, expression: 'joy', mood: 'joy' },
    { pose: 'peace', holdMs: 1100, expression: 'happy' },
    { pose: 'idle', holdMs: 700 },
  ],
  celebrate: [
    { pose: 'clap', holdMs: 420, expression: 'joy', mood: 'joy' },
    { pose: 'victory', holdMs: 1200, expression: 'fun' },
    { pose: 'dance', holdMs: 1300, expression: 'joy' },
    { pose: 'idle', holdMs: 700 },
  ],
  affection: [
    { pose: 'shyHide', holdMs: 800, expression: 'blush', mood: 'tender' },
    { pose: 'heart', holdMs: 1400, expression: 'fond' },
    { pose: 'idle', holdMs: 900, expression: 'relaxed' },
  ],
  thinking: [
    { pose: 'hairTwirl', holdMs: 900, expression: 'thinking', mood: 'thinking' },
    { pose: 'tilt', holdMs: 800, expression: 'curious' },
    { pose: 'nod', holdMs: 600, expression: 'relaxed' },
    { pose: 'idle', holdMs: 500 },
  ],
  apologetic: [
    { pose: 'shyHide', holdMs: 700, expression: 'sad', mood: 'sad' },
    { pose: 'bow', holdMs: 1500, expression: 'sad' },
    { pose: 'idle', holdMs: 700, expression: 'relaxed' },
  ],
  showoff: [
    { pose: 'hairFlip', holdMs: 1000, expression: 'teasing' },
    { pose: 'point', holdMs: 900, expression: 'happy' },
    { pose: 'perform', holdMs: 1200, expression: 'fun', mood: 'joy' },
    { pose: 'idle', holdMs: 600 },
  ],
  explain: [
    { pose: 'openHands', holdMs: 1100, expression: 'attentive' },
    { pose: 'point', holdMs: 850, expression: 'focused' },
    { pose: 'nod', holdMs: 650, expression: 'gentle' },
    { pose: 'idle', holdMs: 650 },
  ],
  reassure: [
    { pose: 'reassure', holdMs: 1200, expression: 'gentle', mood: 'tender' },
    { pose: 'leanIn', holdMs: 950, expression: 'fond' },
    { pose: 'idle', holdMs: 800, expression: 'soft' },
  ],
  historian: [
    { pose: 'ponder', holdMs: 1150, expression: 'thinking', mood: 'thinking' },
    { pose: 'openHands', holdMs: 1050, expression: 'curious' },
    { pose: 'nod', holdMs: 700, expression: 'proud' },
    { pose: 'idle', holdMs: 700 },
  ],
});

const clampHold = (value, fallback = 1200) => Math.min(6000, Math.max(200, Number(value) || fallback));

/**
 * Register every pack pose on the avatar rig and expose sequence playback.
 * Safe to call more than once; it returns a disposer that clears pending steps.
 *
 * @param {object} [options]
 * @param {(name: string, definition: object) => void} [options.register] pose registrar (defaults to window.registerAvatarPose)
 * @param {object} [options.target] global object to attach helpers to (defaults to window)
 */
export function installVesperAnimationPack({ register, target = (typeof window !== 'undefined' ? window : globalThis) } = {}) {
  const registrar = register || target.registerAvatarPose;
  if (typeof registrar !== 'function') return { installed: false, dispose() {} };

  for (const [name, definition] of Object.entries(ANIMATION_PACK)) registrar(name, definition);

  let timers = [];

  /** Play a scripted multi-step sequence, or a single pose when `name` is a pose. */
  target.playAvatarSequence = (name = 'greeting', { onStep } = {}) => {
    const sequence = ANIMATION_SEQUENCES[name];
    const steps = sequence || [{ pose: name, holdMs: 1400 }];
    for (const timer of timers) target.clearTimeout?.(timer);
    timers = [];
    let elapsed = 0;
    steps.forEach((step, index) => {
      const timer = target.setTimeout?.(() => {
        target.setAvatarPose?.(step.pose, 0.42);
        if (step.expression) target.setExpression?.(step.expression, 1, 0.35);
        if (step.mood) target.setAvatarMood?.(step.mood);
        onStep?.(step, index);
      }, elapsed);
      if (timer) timers.push(timer);
      elapsed += clampHold(step.holdMs, 900);
    });
    return steps.length;
  };

  target.VESPER_ANIMATION_PACK = ANIMATION_PACK;
  target.VESPER_ANIMATION_SEQUENCES = ANIMATION_SEQUENCES;

  return {
    installed: true,
    poses: Object.keys(ANIMATION_PACK),
    sequences: Object.keys(ANIMATION_SEQUENCES),
    dispose() { for (const timer of timers) target.clearTimeout?.(timer); timers = []; },
  };
}
