import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { ExpressionManager, EXPRESSION_PRESETS } from './expressionManager.js';
import { AvatarAnimationController } from './animationController.js';
import { AvatarHitboxManager } from './hitboxManager.js';

const canvas = document.querySelector('#avatar-canvas');
const sceneElement = document.querySelector('#scene');
const placeholder = document.querySelector('#model-placeholder');
const stageStatus = document.querySelector('#stage-status');
const modelOnly = document.body.classList.contains('model-only');

let vrm = null;
let speaking = false;
let thinking = false;
let speakingTime = 0;
let speechWordEnergy = 0;
let mouthShape = 'aa';
let speechExpression = 'relaxed';
let speechExpressionWeight = 0.18;
let speechExpressionTime = 0;
let performanceMode = 'idle';
let performanceTime = 0;
let blushAmount = 0;
let autoPerformance = true;
let armRig = [];
let headRig = null;
let neckRig = null;
let chestRig = null;
let expressionController = null;
let animationController = null;
let hitboxManager = null;
let actingStyle = 'playful';
let lastTime = 0;
const expressionPresets = EXPRESSION_PRESETS;
const personalityExpressions = { playful: 'smirk', tender: 'fond', thoughtful: 'thinking' };
let selectedExpression = 'neutral';
let autoRotate = false;
let modelHeight = 1.8;
let modelBaseY = 0.04;
let zoomFactor = 2.15;
const mouthShapes = ['aa', 'ih', 'ou', 'ee', 'oh'];
let visemeTargets = Object.fromEntries(mouthShapes.map((shape) => [shape, 0]));
let visemeWeights = Object.fromEntries(mouthShapes.map((shape) => [shape, 0]));
let audioBands = { low: 0, mid: 0, high: 0 };
let visemeManager = null;
let springBoneManager = null;
const avatarMaterialColors = new WeakMap();
const avatarTint = new THREE.Color('#ffffff');
let wardrobeLayers = [];
let poseRig = [];
let activePose = 'idle';
let poseBlend = 1;
let poseFrom = new THREE.Quaternion();
let poseTo = new THREE.Quaternion();
const poseInverse = new THREE.Quaternion();
let gazeX = 0;
let gazeY = 0;
let gazeCurrentX = 0;
let gazeCurrentY = 0;
let eyeRig = [];
let autoFrameTarget = new THREE.Vector3(0, 1, 0);
const poseDefinitions = {
  idle: {}, wave: { rightUpperArm: { x: -0.25, y: 0.12, z: -0.72 }, rightLowerArm: { x: -0.2, z: -0.35 }, rightHand: { z: -0.2 } },
  nod: { head: { x: -0.14 }, neck: { x: -0.06 } }, tilt: { head: { z: 0.16 }, neck: { z: 0.07 } },
  shrug: { leftUpperArm: { z: -0.14, x: -0.16 }, rightUpperArm: { z: 0.14, x: -0.16 }, chest: { x: -0.03 } },
  thinking: { head: { x: -0.18, z: 0.04 }, neck: { x: -0.05 }, leftUpperArm: { x: -0.18, z: 0.12 } },
  bow: { hips: { x: 0.17 }, spine: { x: 0.18 }, chest: { x: 0.1 }, neck: { x: -0.06 }, head: { x: -0.22 }, leftUpperArm: { x: 0.08 }, rightUpperArm: { x: 0.08 } },
  dance: { hips: { z: 0.08 }, spine: { x: -0.08 }, chest: { x: -0.08 }, leftUpperArm: { x: -0.82, z: 0.3 }, rightUpperArm: { x: -0.25, z: -0.64 }, leftLowerArm: { z: 0.42 }, rightLowerArm: { z: -0.35 } },
};

const scene = new THREE.Scene();
scene.background = null;
const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 100);
camera.position.set(0, 1.35, 3.7);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: modelOnly, antialias: true, powerPreference: 'high-performance' });
window.getVesperAvatarStream = () => typeof renderer.domElement.captureStream === 'function' ? renderer.domElement.captureStream(30) : null;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // VRM/MToon materials are authored for plain sRGB output
renderer.toneMappingExposure = 1;
renderer.setClearColor(0x0d0712, 0);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
scene.add(hemiLight);
const keyLight = new THREE.DirectionalLight(0xfff8f3, 1);
keyLight.position.set(-3, 5, 4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xc8d5e8, 1);
fillLight.position.set(4, 2, 3);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xd8d4e4, 1);
rimLight.position.set(2, 3, -3);
scene.add(rimLight);
const moodLights = {
  neutral: { key: '#fff8f3', fill: '#c8d5e8', rim: '#d8d4e4' },
  joy: { key: '#ffe3ba', fill: '#ffacd5', rim: '#ffe8a5' },
  tender: { key: '#ffe4ec', fill: '#c5d9f7', rim: '#ffc2df' },
  sad: { key: '#c9d5ff', fill: '#8fb6d8', rim: '#9aa8e8' },
  thinking: { key: '#d9d1ff', fill: '#a8c5dd', rim: '#c5aaf2' },
};
let moodLightTarget = moodLights.neutral;
const moodColorTarget = { key: new THREE.Color(moodLightTarget.key), fill: new THREE.Color(moodLightTarget.fill), rim: new THREE.Color(moodLightTarget.rim) };
const dustGeometry = new THREE.BufferGeometry();
const dustPositions = new Float32Array(48 * 3);
for (let index = 0; index < 48; index += 1) {
  dustPositions[index * 3] = (Math.random() - 0.5) * 2.6;
  dustPositions[index * 3 + 1] = Math.random() * 2.4;
  dustPositions[index * 3 + 2] = (Math.random() - 0.5) * 1.2;
}
dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
const dustMaterial = new THREE.PointsMaterial({ color: '#f4d4ec', size: 0.018, transparent: true, opacity: 0.42, depthWrite: false, sizeAttenuation: true });
const dustMotes = new THREE.Points(dustGeometry, dustMaterial);
dustMotes.position.y = 0.12;
scene.add(dustMotes);
let particlesEnabled = true;
window.setAvatarMood = (mood = 'neutral') => {
  moodLightTarget = moodLights[mood] || moodLights.neutral;
  moodColorTarget.key.set(moodLightTarget.key);
  moodColorTarget.fill.set(moodLightTarget.fill);
  moodColorTarget.rim.set(moodLightTarget.rim);
};
window.setAvatarParticles = (enabled) => { particlesEnabled = Boolean(enabled); dustMotes.visible = particlesEnabled; };

function applyAvatarTint() {
  if (!vrm) return;
  vrm.scene.traverse((node) => {
    if (!node.isMesh) return;
    for (const material of [].concat(node.material || [])) {
      if (!material?.color?.isColor) continue;
      if (!avatarMaterialColors.has(material)) avatarMaterialColors.set(material, material.color.clone());
      material.color.copy(avatarMaterialColors.get(material)).multiply(avatarTint);
    }
  });
}

window.setAvatarTint = (value) => {
  if (!/^#[0-9a-f]{6}$/i.test(String(value))) return false;
  avatarTint.set(value);
  applyAvatarTint();
  return true;
};

function collectWardrobeLayers() {
  const candidates = new Map();
  const pattern = /outfit|cloth|dress|shirt|skirt|accessor|ribbon|coat|suit|jacket|glove|shoe|hat|bow/i;
  vrm.scene.traverse((node) => {
    if (!node.isMesh || !node.name || !pattern.test(node.name)) return;
    const group = candidates.get(node.name) || [];
    group.push(node);
    candidates.set(node.name, group);
  });
  wardrobeLayers = [...candidates].map(([name, nodes]) => ({ id: name, name, nodes }));
  return wardrobeLayers.map(({ id, name, nodes }) => ({ id, name, visible: nodes.every((node) => node.visible) }));
}

window.setAvatarLayerVisibility = (id, visible) => {
  const layer = wardrobeLayers.find((entry) => entry.id === id);
  if (!layer) return false;
  layer.nodes.forEach((node) => { node.visible = Boolean(visible); });
  return true;
};

// Overall stage brightness. Press [ to darken and ] to brighten; the choice is remembered.
const lightBase = [[hemiLight, 0.55], [keyLight, 1.5], [fillLight, 0.35], [rimLight, 0.6]];
const LIGHT_KEY = 'vesper-light-scale';
let lightScale = 0.4;
try {
  const saved = Number(localStorage.getItem(LIGHT_KEY));
  if (saved >= 0.02 && saved <= 3) lightScale = saved;
} catch { /* storage unavailable */ }
function applyLightScale(announce = false) {
  for (const [light, base] of lightBase) light.intensity = base * lightScale;
  try { localStorage.setItem(LIGHT_KEY, String(lightScale)); } catch { /* storage unavailable */ }
  if (announce) stageStatus.textContent = `BRIGHTNESS ${Math.round(lightScale * 100)}%`;
}
applyLightScale();
window.setAvatarLight = (scale) => {
  lightScale = THREE.MathUtils.clamp(Number(scale) || 0.4, 0.02, 3);
  applyLightScale(true);
};
window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = event.target?.tagName?.toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return;
  if (event.key === '[') window.setAvatarLight(lightScale / 1.3);
  else if (event.key === ']') window.setAvatarLight(lightScale * 1.3);
  else if (event.key === '\\') window.setAvatarLight(0.4);
});

const TOON_KEY = 'vesper-toon-v1';
const toonSettings = { threshold: 0.52, shadowColor: '#6c4f79', outlineColor: '#211827', outlineWidth: 0.012, rimColor: '#f0bde8', rimPower: 2.8 };
try { Object.assign(toonSettings, JSON.parse(localStorage.getItem(TOON_KEY) || '{}')); } catch { /* use authored defaults */ }
function toonGradient() {
  const canvasTexture = document.createElement('canvas'); canvasTexture.width = 2; canvasTexture.height = 1; const context = canvasTexture.getContext('2d');
  const ramp = context.createLinearGradient(0, 0, 2, 0); const threshold = Math.max(0.05, Math.min(0.95, toonSettings.threshold)); ramp.addColorStop(0, toonSettings.shadowColor); ramp.addColorStop(threshold, toonSettings.shadowColor); ramp.addColorStop(Math.min(1, threshold + 0.01), '#ffffff'); ramp.addColorStop(1, '#ffffff'); context.fillStyle = ramp; context.fillRect(0, 0, 2, 1);
  const texture = new THREE.CanvasTexture(canvasTexture); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; return texture;
}
function addRimShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.vesperRimColor = { value: new THREE.Color(toonSettings.rimColor) }; shader.uniforms.vesperRimPower = { value: Number(toonSettings.rimPower) || 2.8 };
    shader.vertexShader = `varying vec3 vVesperNormal;\n${shader.vertexShader}`.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vVesperNormal = normalize(normalMatrix * objectNormal);');
    shader.fragmentShader = `uniform vec3 vesperRimColor; uniform float vesperRimPower; varying vec3 vVesperNormal;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <output_fragment>', 'float vesperRim = pow(1.0 - max(dot(normalize(vVesperNormal), normalize(vViewPosition)), 0.0), vesperRimPower); outgoingLight += vesperRimColor * vesperRim * 0.16;\n#include <output_fragment>');
    material.userData.vesperShader = shader;
  };
  material.needsUpdate = true;
}
function applyToonLook(root) {
  let outlines = 0; let toonMaterials = 0;
  root.traverse((node) => {
    if (!node.isMesh || node.userData.vesperOutline) return;
    const materials = [].concat(node.material || []);
    node.material = materials.map((material) => {
      if (!material || material.isShaderMaterial) return material;
      const toon = new THREE.MeshToonMaterial({ color: material.color || 0xffffff, map: material.map || null, normalMap: material.normalMap || null, transparent: material.transparent, opacity: material.opacity, alphaTest: material.alphaTest, side: material.side, gradientMap: toonGradient() });
      toon.name = `${material.name || 'material'} · Vesper Toon`; addRimShader(toon); toonMaterials += 1; return toon;
    });
    if (node.material.length === 1) node.material = node.material[0];
    const outlineMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(toonSettings.outlineColor), side: THREE.BackSide, transparent: true, opacity: 0.92, depthWrite: false });
    const outline = node.isSkinnedMesh ? new THREE.SkinnedMesh(node.geometry, outlineMaterial) : new THREE.Mesh(node.geometry, outlineMaterial);
    if (node.isSkinnedMesh) { outline.bind(node.skeleton, node.bindMatrix); outline.bindMatrixInverse.copy(node.bindMatrixInverse); }
    outline.scale.setScalar(1 + Number(toonSettings.outlineWidth || 0.012)); outline.renderOrder = -1; outline.userData.vesperOutline = true; node.add(outline); outlines += 1;
  });
  return { toonMaterials, outlines };
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ color: 0x030303 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.015;
scene.add(floor);

const grid = new THREE.GridHelper(60, 60, 0x514d54, 0x29272b);
grid.position.y = 0.004;
grid.material.transparent = true;
grid.material.opacity = 0.34;
grid.material.depthWrite = false;
scene.add(grid);

const platform = new THREE.Mesh(
  new THREE.CylinderGeometry(1.42, 1.5, 0.045, 96),
  new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.72, metalness: 0.24 }),
);
platform.position.y = 0.015;
scene.add(platform);
const platformEdge = new THREE.Mesh(
  new THREE.TorusGeometry(1.43, 0.008, 8, 128),
  new THREE.MeshBasicMaterial({ color: 0x77737a, transparent: true, opacity: 0.54 }),
);
platformEdge.rotation.x = Math.PI / 2;
platformEdge.position.y = 0.038;
scene.add(platformEdge);
if (modelOnly) {
  floor.visible = false;
  grid.visible = false;
  platform.visible = false;
  platformEdge.visible = false;
}

function resize() {
  const width = sceneElement.clientWidth;
  const height = sceneElement.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(sceneElement);
resize();

function setFaceExpression(name, intensity = 1, duration = 0.22) {
  const key = String(name || 'neutral').toLowerCase().replace(/[\s_-]/g, '');
  if (!Object.hasOwn(expressionPresets, key)) return false;
  if (expressionController && !expressionController.setExpression(key, intensity, duration)) return false;
  selectedExpression = key;
  return true;
}

const emotionMap = { happy: 'happy', angry: 'angry', sorrow: 'sad', sad: 'sad', surprised: 'surprised', relaxed: 'relaxed', neutral: 'neutral', idle: 'neutral', joy: 'joy', fun: 'fun', lookup: 'lookup', lookdown: 'lookdown', lookleft: 'lookleft', lookright: 'lookright', blush: 'blush', wink: 'wink' };
window.setExpression = (emotion = 'neutral', intensity = 1, duration = 0.35) => {
  const name = emotionMap[String(emotion).toLowerCase()] || 'neutral';
  if (!setFaceExpression(name, intensity, duration)) return false;
  if (name === 'joy' || name === 'happy') performanceMode = 'blush';
  return true;
};
function setViseme(shape, weight = 0) { const key = mouthShapes.includes(shape) ? shape : 'aa'; const tension = THREE.MathUtils.clamp((Number(weight) || 0) * (0.88 + audioBands.mid * 0.12) + audioBands.high * 0.07, 0, 1); for (const name of mouthShapes) visemeTargets[name] = name === key ? tension : 0; }
function createPoseRig() {
  const names = ['hips', 'head', 'neck', 'chest', 'spine', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'];
  poseRig = names.map((name) => { const node = vrm.humanoid?.getNormalizedBoneNode(name); return { name, node, baseX: node?.rotation.x || 0, current: new THREE.Quaternion(), target: new THREE.Quaternion() }; }).filter((entry) => entry.node);
  poseRig.forEach((entry) => { entry.current.identity(); entry.target.identity(); });
  eyeRig = ['leftEye', 'rightEye'].map((name) => { const node = vrm.humanoid?.getNormalizedBoneNode(name); return { node, x: node?.rotation.x || 0, y: node?.rotation.y || 0 }; }).filter((entry) => entry.node);
}
window.setAvatarPose = (name = 'idle', duration = 0.45) => { removePoseOverlay(); const poseName = String(name || 'idle').toLowerCase(); activePose = Object.hasOwn(poseDefinitions, poseName) ? poseName : 'idle'; poseBlend = 0; poseFrom.identity(); poseTo.identity(); for (const entry of poseRig) { const offset = poseDefinitions[activePose][entry.name] || {}; entry.target.setFromEuler(new THREE.Euler(offset.x || 0, offset.y || 0, offset.z || 0)); entry.current.copy(poseFrom); } window.dispatchEvent(new CustomEvent('avatar-pose', { detail: { name: activePose, duration } })); };
let gestureTimer = 0;
window.playAvatarGesture = (name = 'wave', holdMs = 1900) => {
  window.clearTimeout(gestureTimer);
  if (animationController?.play(name, holdMs)) {
    window.setAvatarPose('idle', 0.2);
    return true;
  }
  animationController?.stop(0.12);
  window.setAvatarPose(name, 0.45);
  gestureTimer = window.setTimeout(() => window.setAvatarPose('idle', 0.5), THREE.MathUtils.clamp(Number(holdMs) || 1900, 450, 6000));
  return false;
};
window.setAvatarViseme = (shape, weight = 1) => setViseme(shape, weight);
window.setAvatarAudioBands = (bands = {}) => {
  audioBands.low = THREE.MathUtils.clamp(Number(bands.low) || 0, 0, 1);
  audioBands.mid = THREE.MathUtils.clamp(Number(bands.mid) || 0, 0, 1);
  audioBands.high = THREE.MathUtils.clamp(Number(bands.high) || 0, 0, 1);
};

window.setAvatarExpression = (name) => setFaceExpression(name);
window.setAvatarPersonality = (mode) => {
  if (!Object.hasOwn(personalityExpressions, mode)) return;
  actingStyle = mode;
  setFaceExpression(personalityExpressions[mode]);
};
window.setAvatarPerformance = (mode) => {
  performanceMode = ['wave', 'blush', 'listen'].includes(mode) ? mode : 'idle';
  performanceTime = 0;
  if (performanceMode === 'blush') setFaceExpression('shy');
  if (performanceMode === 'listen') setFaceExpression('soft');
  if (performanceMode === 'idle') setFaceExpression('neutral');
};
window.setAvatarAutoPerformance = (enabled) => { autoPerformance = Boolean(enabled); };
window.setAvatarSpeaking = (value) => {
  speaking = Boolean(value);
  speakingTime = 0;
  if (autoPerformance && speaking) {
    performanceMode = 'blush';
    performanceTime = 0;
    setFaceExpression('embarrassed');
  } else if (autoPerformance && !speaking && performanceMode === 'blush') {
    performanceMode = 'idle';
    setFaceExpression('neutral');
  }
  if (!speaking) {
    speechWordEnergy = 0;
    speechExpressionTime = 0;
    visemeTargets = Object.fromEntries(mouthShapes.map((shape) => [shape, 0]));
  } else {
    speechExpression = vrm?.expressionManager?.getExpression('relaxed') ? 'relaxed' : 'happy';
    speechExpressionWeight = 0.18;
    speechExpressionTime = 0.4;
  }
};
window.setAvatarThinking = (value) => { thinking = Boolean(value); };
window.setAvatarSpeechWord = (word, punctuation = '') => {
  const normalized = String(word || '').toLowerCase();
  mouthShape = /[a]/.test(normalized) ? 'aa' : /[o]/.test(normalized) ? 'oh' : /[u]/.test(normalized) ? 'ou' : /[e]/.test(normalized) ? 'ee' : /[i]/.test(normalized) ? 'ih' : 'aa';
  speechWordEnergy = Math.min(1, 0.32 + normalized.replace(/[^\p{L}\p{N}]/gu, '').length * 0.035 + (/[!?]/.test(punctuation) ? 0.22 : 0));
  const mark = String(punctuation || '');
  const requested = mark.includes('?') ? 'surprised' : mark.includes('!') ? 'happy' : (actingStyle === 'thoughtful' ? 'relaxed' : actingStyle === 'tender' ? 'relaxed' : 'happy');
  speechExpression = vrm?.expressionManager?.getExpression(requested) ? requested : 'happy';
  speechExpressionWeight = requested === 'relaxed' ? 0.16 : 0.38;
  speechExpressionTime = requested === 'relaxed' ? 0.24 : 0.55;
  setViseme(mouthShape, Math.min(1, 0.55 + speechWordEnergy * 0.35));
};
window.setAvatarAutoRotate = (enabled) => { autoRotate = Boolean(enabled); };
window.setAvatarZoom = (factor) => {
  zoomFactor = THREE.MathUtils.clamp(Number(factor) || 2.15, 1.8, 3.6);
  camera.position.z = modelHeight * zoomFactor;
};
window.setAvatarReset = () => {
  if (vrm) vrm.scene.rotation.y = 0;
  autoRotate = false;
  window.setAvatarZoom(2.15);
  camera.position.x = 0;
  camera.position.y = modelHeight * 0.64;
  camera.lookAt(0, modelHeight * 0.52, 0);
};

function createRelaxedArm(upperName, lowerName, handName, phase) {
  const upper = vrm.humanoid?.getNormalizedBoneNode(upperName);
  const lower = vrm.humanoid?.getNormalizedBoneNode(lowerName);
  const hand = vrm.humanoid?.getNormalizedBoneNode(handName);
  if (!upper || !lower) return null;

  vrm.scene.updateMatrixWorld(true);
  const shoulder = upper.getWorldPosition(new THREE.Vector3());
  const elbow = lower.getWorldPosition(new THREE.Vector3());
  const originalZ = upper.rotation.z;
  upper.rotation.z = originalZ + 0.04;
  vrm.scene.updateMatrixWorld(true);
  const testElbow = lower.getWorldPosition(new THREE.Vector3());
  upper.rotation.z = originalZ;
  vrm.scene.updateMatrixWorld(true);

  const lowerSign = testElbow.y < elbow.y ? 1 : -1;
  const armVector = elbow.sub(shoulder);
  const armLength = Math.max(armVector.length(), 0.001);
  const currentDownAngle = Math.asin(THREE.MathUtils.clamp(-armVector.y / armLength, -1, 1));
  // Let the arms hang close to the sides when Vesper is idle.
  const lowerAngle = Math.max(0, 1.28 - currentDownAngle);
  upper.rotation.z = originalZ + lowerSign * lowerAngle;
  vrm.scene.updateMatrixWorld(true);

  return {
    upper,
    lower,
    hand,
    upperBase: upper.rotation.z,
    lowerBase: lower.rotation.z,
    handBase: hand?.rotation.z || 0,
    lowerSign,
    phase,
  };
}

function createRelaxedArmPose() {
  armRig = [
    createRelaxedArm('leftUpperArm', 'leftLowerArm', 'leftHand', 0),
    createRelaxedArm('rightUpperArm', 'rightLowerArm', 'rightHand', Math.PI),
  ].filter(Boolean);
}

function captureBonePose(name) {
  const node = vrm.humanoid?.getNormalizedBoneNode(name);
  return node ? { node, x: node.rotation.x, y: node.rotation.y, z: node.rotation.z } : null;
}

const loadingManager = new THREE.LoadingManager();
loadingManager.onError = (url) => console.warn('Vesper: could not load', url);
loadingManager.onProgress = (url, loaded, total) => { if (stageStatus) stageStatus.textContent = total ? `LOADING AVATAR · ${Math.round((loaded / total) * 100)}%` : 'LOADING AVATAR'; };
const loader = new GLTFLoader(loadingManager);
loader.register((parser) => new VRMLoaderPlugin(parser));
// Embedded textures are decoded through <img> elements (allowed by the page's security policy)
// instead of fetch()-based ImageBitmapLoader, which a strict policy can block, leaving a white model.
loader.register((parser) => {
  parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
  return { name: 'VesperTextureLoader' };
});
let modelLoadStarted = false;
const avatarSource = (() => { try { const requested = new URLSearchParams(location.search).get('avatar'); if (!requested) return '/models/character.vrm'; const url = new URL(requested, location.origin); return url.origin === location.origin ? url.pathname + url.search : '/models/character.vrm'; } catch { return '/models/character.vrm'; } })();
function loadAvatarModel() {
  if (modelLoadStarted) return;
  modelLoadStarted = true;
  loader.load(
    avatarSource,
    (gltf) => {
    vrm = gltf.userData.vrm;
    if (!vrm) {
      stageStatus.textContent = 'UNSUPPORTED FILE';
      placeholder.querySelector('.placeholder-title').textContent = 'This file is not a VRM avatar';
      placeholder.querySelector('.placeholder-copy').innerHTML = 'Export a VRM model and save it as<br /><code>models/character.vrm</code>';
      return;
    }
    expressionController = new ExpressionManager(vrm.expressionManager);
    animationController = new AvatarAnimationController(THREE, vrm, gltf.animations || []);
    hitboxManager = new AvatarHitboxManager(THREE, {
      canvas,
      camera,
      getRoot: () => vrm?.scene,
      getHeight: () => modelHeight,
      getHumanoid: () => vrm?.humanoid,
      onHit: handleAvatarTouch,
    });
    const bounds = new THREE.Box3().setFromObject(vrm.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(bounds.max.y - bounds.min.y, 1.3);
    modelHeight = height;
    modelBaseY = -bounds.min.y + 0.04;
    vrm.scene.position.set(-center.x, modelBaseY, -center.z);
    scene.add(vrm.scene);
    springBoneManager = vrm.springBoneManager || vrm.springBone?.manager || null;
    const visual = applyToonLook(vrm.scene);
    applyAvatarTint();
    const availableWardrobeLayers = collectWardrobeLayers();
    createPoseRig();
    autoFrameTarget.set(0, height * 0.52, 0);
    createRelaxedArmPose();
    headRig = captureBonePose('head');
    neckRig = captureBonePose('neck');
    chestRig = captureBonePose('chest') || captureBonePose('spine');
    zoomFactor = 2.15;
    camera.position.set(0, height * 0.64, height * zoomFactor);
    camera.lookAt(0, height * 0.52, 0);
    const expressions = vrm.expressionManager?.presetExpressionMap || {};
    const availableExpressions = Object.keys(expressionPresets).filter((name) => expressionController.supports(name));
    const availableVisemes = mouthShapes.filter((shape) => expressions[shape] || vrm.expressionManager?.getExpression(shape));
    const missingVisemes = mouthShapes.filter((shape) => !availableVisemes.includes(shape));
    if (!availableExpressions.includes(selectedExpression)) selectedExpression = 'neutral';
    setFaceExpression(selectedExpression);
    let texturedMaterials = 0;
    let totalMaterials = 0;
    vrm.scene.traverse((node) => {
      if (!node.isMesh) return;
      for (const material of [].concat(node.material)) {
        totalMaterials += 1;
        if (material.map) texturedMaterials += 1;
      }
    });
    console.info(`Vesper: ${texturedMaterials}/${totalMaterials} materials have textures`);
    stageStatus.textContent = texturedMaterials === 0 && totalMaterials > 0 ? 'MODEL LOADED · TEXTURES MISSING' : `MODEL LOADED · TOON ${visual.toonMaterials} · SPRINGS ${springBoneManager ? 'ON' : 'N/A'}`;
    placeholder.classList.add('hidden');
    window.dispatchEvent(new CustomEvent('avatar-ready', { detail: { expressions: availableExpressions, visemes: availableVisemes, missingVisemes, wardrobeLayers: availableWardrobeLayers } }));
    window.setAvatarPersonality?.(actingStyle);
    },
    undefined,
    (error) => {
    stageStatus.textContent = 'MODEL COULD NOT LOAD';
    placeholder.querySelector('.placeholder-title').textContent = 'Vesper could not load';
    placeholder.querySelector('.placeholder-copy').innerHTML = `Check that <code>${avatarSource}</code> exists and is a valid VRM 0.x or 1.0 export.`;
    if (error?.message) console.warn('Could not load the VRM avatar:', error);
    },
  );
}

window.addEventListener('vesper-authenticated', loadAvatarModel);
fetch('/api/auth', { cache: 'no-store' })
  .then((response) => response.json())
  .then((access) => { if (!access.required || access.authenticated) loadAvatarModel(); })
  .catch(() => loadAvatarModel());

let dragX = null;
let pointerStart = null;
let dragMoved = false;
function reactToAvatarTouch(event) {
  if (!vrm || !pointerStart || dragMoved) return;
  hitboxManager?.hit(event.clientX, event.clientY);
}

function handleAvatarTouch({ target }) {
  const reaction = {
    head: { line: 'Eep—head pats? I noticed, senpai~', expression: 'surprised', gesture: 'nod' },
    cheek: { line: 'W-was that a cheek poke? You are bold today.', expression: 'blush', gesture: 'thinking' },
    shoulder: { line: 'A little shoulder tap? I am listening.', expression: 'joy', gesture: 'shrug' },
    hand: { line: 'You found my hand. Hmph, fine—just this once.', expression: 'happy', gesture: 'wave' },
  }[target] || { line: 'Vesper noticed your touch.', expression: 'happy', gesture: 'nod' };
  window.setAvatarExpression?.(reaction.expression);
  window.playAvatarGesture?.(reaction.gesture, 1500);
  window.dispatchEvent(new CustomEvent('avatar-touch', { detail: { target, ...reaction } }));
}

canvas.addEventListener('pointerdown', (event) => {
  dragX = event.clientX;
  pointerStart = { x: event.clientX, y: event.clientY };
  dragMoved = false;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect(); gazeX = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1); gazeY = THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
  if (dragX === null || !vrm || !pointerStart) return;
  if (!dragMoved && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 6) return;
  dragMoved = true;
  const delta = event.clientX - dragX;
  dragX = event.clientX;
  vrm.scene.rotation.y += delta * 0.008;
});
canvas.addEventListener('pointerleave', () => { gazeX = 0; gazeY = 0; });
canvas.addEventListener('pointerup', (event) => { reactToAvatarTouch(event); dragX = null; pointerStart = null; });
canvas.addEventListener('pointercancel', () => { dragX = null; pointerStart = null; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomFactor = THREE.MathUtils.clamp(zoomFactor + event.deltaY * 0.003 / modelHeight, 1.8, 3.6);
  camera.position.z = modelHeight * zoomFactor;
  window.dispatchEvent(new CustomEvent('avatar-zoom', { detail: zoomFactor }));
}, { passive: false });

function applyPoseOverlay(delta) {
  for (const entry of poseRig) { entry.current.slerp(entry.target, Math.min(1, delta * 7.5)); entry.node.quaternion.multiply(entry.current); }
  gazeCurrentX = THREE.MathUtils.damp(gazeCurrentX, gazeX, 5, delta); gazeCurrentY = THREE.MathUtils.damp(gazeCurrentY, gazeY, 5, delta);
  for (const eye of eyeRig) { eye.node.rotation.y = THREE.MathUtils.damp(eye.node.rotation.y, eye.y + gazeCurrentX * 0.12, 8, delta); eye.node.rotation.x = THREE.MathUtils.damp(eye.node.rotation.x, eye.x + gazeCurrentY * 0.08, 8, delta); }
}

function removePoseOverlay() {
  for (const entry of poseRig) {
    poseInverse.copy(entry.current).invert();
    entry.node.quaternion.multiply(poseInverse);
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - (lastTime || now)) / 1000, 0.05);
  lastTime = now;
  if (vrm) {
    removePoseOverlay();
    animationController?.update(delta);
    vrm.update(delta);
    if (autoRotate) vrm.scene.rotation.y += delta * 0.12;
    vrm.scene.position.y = modelBaseY + Math.sin(now * 0.0017) * 0.008;
    const speechBlend = speechExpressionTime > 0 ? Math.min(1, speechExpressionTime * 5) : 0;
    const speechPulse = speaking ? 0.1 + Math.max(0, Math.sin(speakingTime * 2.2)) * 0.06 + speechWordEnergy * 0.08 : 0;
    const overlays = {
      [speechExpression]: Math.max(speechPulse, speechBlend * speechExpressionWeight),
      relaxed: (thinking || performanceMode === 'listen') ? 0.2 + Math.max(0, Math.sin(now * 0.00075)) * 0.08 : 0,
    };
    const blushTarget = selectedExpression === 'blush' ? 0.68 : performanceMode === 'blush' ? (speaking ? 0.82 : 0.68) : 0;
    blushAmount = THREE.MathUtils.lerp(blushAmount, blushTarget, Math.min(1, delta * 8));
    overlays.blush = blushAmount;
    expressionController?.update(delta, overlays);
    speechExpressionTime = Math.max(0, speechExpressionTime - delta);
    speechWordEnergy = THREE.MathUtils.damp(speechWordEnergy, 0, 5, delta);
    performanceTime += delta;
    const waving = performanceMode === 'wave' || activePose === 'wave';
    const armMotion = animationController?.isPlaying ? 0 : waving
      ? 0.16 + Math.sin(performanceTime * 3.4) * 0.04
      : speaking ? (actingStyle === 'playful' ? 0.085 : actingStyle === 'tender' ? 0.048 : 0.058) : 0;
    for (const arm of armRig) {
      const sway = waving && arm.phase > 0
        ? Math.sin(performanceTime * 8) * 0.23
        : Math.sin(now * 0.0018 + arm.phase) * armMotion;
      arm.upper.rotation.z = THREE.MathUtils.damp(arm.upper.rotation.z, arm.upperBase + arm.lowerSign * sway, 12, delta);
      arm.lower.rotation.z = THREE.MathUtils.damp(arm.lower.rotation.z, arm.lowerBase - arm.lowerSign * sway * 0.42, 12, delta);
      if (arm.hand) arm.hand.rotation.z = THREE.MathUtils.damp(arm.hand.rotation.z, arm.handBase + arm.lowerSign * sway * 0.2, 12, delta);
    }
    const breath = Math.sin(now * 0.00145);
    const breathLift = breath * 0.009 + Math.sin(now * 0.00072) * 0.003 + audioBands.low * 0.003;
    if (chestRig) chestRig.node.rotation.x = THREE.MathUtils.damp(chestRig.node.rotation.x, chestRig.x + breathLift, 9, delta);
    const spineEntry = poseRig.find((entry) => entry.name === 'spine');
    if (spineEntry) spineEntry.node.rotation.x = THREE.MathUtils.damp(spineEntry.node.rotation.x, spineEntry.baseX + breath * 0.0015 + audioBands.low * 0.001, 7, delta);
    if (neckRig) {
      const neckX = neckRig.x + ((thinking || performanceMode === 'listen') ? 0.025 : Math.sin(now * 0.0008) * 0.009);
      const neckY = neckRig.y + Math.sin(now * 0.00055) * 0.012;
      neckRig.node.rotation.x = THREE.MathUtils.damp(neckRig.node.rotation.x, neckX, 8, delta);
      neckRig.node.rotation.y = THREE.MathUtils.damp(neckRig.node.rotation.y, neckY, 8, delta);
    }
    if (headRig) {
      const thoughtfulTilt = actingStyle === 'thoughtful' ? 0.018 : actingStyle === 'tender' ? -0.012 : 0;
      const headX = headRig.x + ((thinking || performanceMode === 'listen') ? -0.025 : Math.sin(now * 0.00095) * 0.009);
      const headY = headRig.y + Math.sin(now * 0.00062) * 0.018 + gazeCurrentX * 0.075 + (speaking && actingStyle === 'playful' ? Math.sin(speakingTime * 1.3) * 0.012 : 0);
      const headZ = headRig.z + Math.sin(now * 0.00072) * 0.012 - gazeCurrentX * 0.018 + thoughtfulTilt;
      const headLookX = headX + gazeCurrentY * 0.035;
      headRig.node.rotation.x = THREE.MathUtils.damp(headRig.node.rotation.x, headLookX, 7, delta);
      headRig.node.rotation.y = THREE.MathUtils.damp(headRig.node.rotation.y, headY, 7, delta);
      headRig.node.rotation.z = THREE.MathUtils.damp(headRig.node.rotation.z, headZ, 7, delta);
    }
    speakingTime += delta;
    for (const shape of mouthShapes) { visemeWeights[shape] = THREE.MathUtils.damp(visemeWeights[shape], visemeTargets[shape], 14, delta); vrm.expressionManager?.setValue(shape, visemeWeights[shape]); }
    applyPoseOverlay(delta);
  }
  const colorBlend = Math.min(1, delta * 1.8);
  keyLight.color.lerp(moodColorTarget.key, colorBlend);
  fillLight.color.lerp(moodColorTarget.fill, colorBlend);
  rimLight.color.lerp(moodColorTarget.rim, colorBlend);
  dustMaterial.color.lerp(moodColorTarget.rim, colorBlend);
  if (particlesEnabled) dustMotes.rotation.y += delta * 0.018;
  camera.lookAt(0, modelHeight * 0.52, 0);
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
