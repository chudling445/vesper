import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

const canvas = document.querySelector('#avatar-canvas');
const sceneElement = document.querySelector('#scene');
const placeholder = document.querySelector('#model-placeholder');
const stageStatus = document.querySelector('#stage-status');

let vrm = null;
let speaking = false;
let thinking = false;
let speakingTime = 0;
let mouthPulse = 0;
let mouthShape = 'aa';
let speechExpression = 'relaxed';
let speechExpressionWeight = 0.18;
let speechExpressionTime = 0;
let armRig = [];
let headRig = null;
let neckRig = null;
let chestRig = null;
let actingStyle = 'playful';
let blinkTime = 0;
let blinkDuration = 0.16;
let nextBlink = 3 + Math.random() * 3;
let lastTime = 0;
const faceExpressions = ['happy', 'angry', 'relaxed', 'sad', 'surprised'];
const expressionPresets = {
  neutral: {},
  smirk: { happy: 0.34, angry: 0.42 },
  grin: { happy: 0.78 },
  pout: { angry: 0.56, sad: 0.22 },
  shy: { relaxed: 0.62, happy: 0.28, sad: 0.08 },
  fond: { relaxed: 0.57, happy: 0.42 },
  curious: { surprised: 0.36, relaxed: 0.2 },
  thinking: { relaxed: 0.54, sad: 0.12 },
  soft: { relaxed: 0.69, sad: 0.18 },
  surprised: { surprised: 0.78, happy: 0.12 },
};
const personalityExpressions = { playful: 'smirk', tender: 'fond', thoughtful: 'thinking' };
let selectedExpression = 'neutral';
let faceWeights = Object.fromEntries(faceExpressions.map((name) => [name, 0]));
let faceFrom = { ...faceWeights };
let faceTarget = { ...faceWeights };
let faceBlend = 1;
let autoRotate = false;
let modelHeight = 1.8;
let modelBaseY = 0.04;
let zoomFactor = 2.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0712);
const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 100);
camera.position.set(0, 1.35, 3.7);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // VRM/MToon materials are authored for plain sRGB output
renderer.toneMappingExposure = 1;
renderer.setClearColor(0x0d0712, 1);

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

function setFaceExpression(name) {
  const manager = vrm?.expressionManager;
  const preset = expressionPresets[name];
  if (!preset) return false;
  if (!manager) { selectedExpression = name; return true; }
  const hasSupportedWeight = Object.entries(preset).some(([expression, weight]) => weight > 0 && manager.getExpression(expression));
  if (name !== 'neutral' && !hasSupportedWeight) return false;
  selectedExpression = name;
  faceFrom = { ...faceWeights };
  faceTarget = Object.fromEntries(faceExpressions.map((expression) => [expression, preset[expression] || 0]));
  faceBlend = 0;
  return true;
}

window.setAvatarExpression = (name) => setFaceExpression(name);
window.setAvatarPersonality = (mode) => {
  if (!Object.hasOwn(personalityExpressions, mode)) return;
  actingStyle = mode;
  setFaceExpression(personalityExpressions[mode]);
};
window.setAvatarSpeaking = (value) => {
  speaking = Boolean(value);
  if (!speaking) {
    mouthPulse = 0;
    speechExpressionTime = 0;
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
  mouthPulse = 0.24;
  const mark = String(punctuation || '');
  const requested = mark.includes('?') ? 'surprised' : mark.includes('!') ? 'happy' : (actingStyle === 'thoughtful' ? 'relaxed' : actingStyle === 'tender' ? 'relaxed' : 'happy');
  speechExpression = vrm?.expressionManager?.getExpression(requested) ? requested : 'happy';
  speechExpressionWeight = requested === 'relaxed' ? 0.16 : 0.38;
  speechExpressionTime = requested === 'relaxed' ? 0.24 : 0.55;
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
const loader = new GLTFLoader(loadingManager);
loader.register((parser) => new VRMLoaderPlugin(parser));
// Embedded textures are decoded through <img> elements (allowed by the page's security policy)
// instead of fetch()-based ImageBitmapLoader, which a strict policy can block, leaving a white model.
loader.register((parser) => {
  parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
  return { name: 'VesperTextureLoader' };
});
let modelLoadStarted = false;
function loadAvatarModel() {
  if (modelLoadStarted) return;
  modelLoadStarted = true;
  loader.load(
    '/models/character.vrm',
    (gltf) => {
    vrm = gltf.userData.vrm;
    if (!vrm) {
      stageStatus.textContent = 'UNSUPPORTED FILE';
      placeholder.querySelector('.placeholder-title').textContent = 'This file is not a VRM avatar';
      placeholder.querySelector('.placeholder-copy').innerHTML = 'Export a VRM model and save it as<br /><code>models/character.vrm</code>';
      return;
    }
    const bounds = new THREE.Box3().setFromObject(vrm.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(bounds.max.y - bounds.min.y, 1.3);
    modelHeight = height;
    modelBaseY = -bounds.min.y + 0.04;
    vrm.scene.position.set(-center.x, modelBaseY, -center.z);
    scene.add(vrm.scene);
    createRelaxedArmPose();
    headRig = captureBonePose('head');
    neckRig = captureBonePose('neck');
    chestRig = captureBonePose('chest') || captureBonePose('spine');
    zoomFactor = 2.15;
    camera.position.set(0, height * 0.64, height * zoomFactor);
    camera.lookAt(0, height * 0.52, 0);
    const expressions = vrm.expressionManager?.presetExpressionMap || {};
    const availableExpressions = Object.entries(expressionPresets)
      .filter(([name, preset]) => name === 'neutral' || Object.entries(preset).some(([expression, weight]) => weight > 0 && expressions[expression]))
      .map(([name]) => name);
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
    stageStatus.textContent = texturedMaterials === 0 && totalMaterials > 0 ? 'MODEL LOADED · TEXTURES MISSING' : 'MODEL LOADED';
    placeholder.classList.add('hidden');
    window.dispatchEvent(new CustomEvent('avatar-ready', { detail: { expressions: availableExpressions } }));
    window.setAvatarPersonality?.(actingStyle);
    },
    undefined,
    (error) => {
    stageStatus.textContent = 'MODEL COULD NOT LOAD';
    placeholder.querySelector('.placeholder-title').textContent = 'Vesper could not load';
    placeholder.querySelector('.placeholder-copy').innerHTML = 'Check that <code>models/character.vrm</code> exists and is a valid VRM export.';
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
canvas.addEventListener('pointerdown', (event) => {
  dragX = event.clientX;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (dragX === null || !vrm) return;
  const delta = event.clientX - dragX;
  dragX = event.clientX;
  vrm.scene.rotation.y += delta * 0.008;
});
canvas.addEventListener('pointerup', () => { dragX = null; });
canvas.addEventListener('pointercancel', () => { dragX = null; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomFactor = THREE.MathUtils.clamp(zoomFactor + event.deltaY * 0.003 / modelHeight, 1.8, 3.6);
  camera.position.z = modelHeight * zoomFactor;
  window.dispatchEvent(new CustomEvent('avatar-zoom', { detail: zoomFactor }));
}, { passive: false });

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - (lastTime || now)) / 1000, 0.05);
  lastTime = now;
  if (vrm) {
    vrm.update(delta);
    if (autoRotate) vrm.scene.rotation.y += delta * 0.12;
    vrm.scene.position.y = modelBaseY + Math.sin(now * 0.0017) * 0.008;
    faceBlend = Math.min(1, faceBlend + delta / 0.22);
    for (const expression of faceExpressions) {
      faceWeights[expression] = THREE.MathUtils.lerp(faceFrom[expression], faceTarget[expression], faceBlend);
      const speechPulse = speaking ? 0.12 + Math.max(0, Math.sin(speakingTime * 2.2)) * 0.07 : 0;
      const speechBlend = speechExpressionTime > 0 ? Math.min(1, speechExpressionTime * 5) : 0;
      const emphasized = speechBlend * speechExpressionWeight;
      const reactiveWeight = expression === speechExpression ? Math.max(speechPulse, emphasized) : 0;
      const thoughtWeight = thinking && expression === 'relaxed' ? 0.2 + Math.max(0, Math.sin(now * 0.00075)) * 0.08 : 0;
      const selectedWeight = faceWeights[expression] * (1 - speechBlend * 0.7);
      vrm.expressionManager?.setValue(expression, Math.max(selectedWeight, reactiveWeight, thoughtWeight));
    }
    speechExpressionTime = Math.max(0, speechExpressionTime - delta);
    const armMotion = speaking ? (actingStyle === 'playful' ? 0.085 : actingStyle === 'tender' ? 0.048 : 0.058) : 0;
    for (const arm of armRig) {
      const sway = Math.sin(now * 0.0018 + arm.phase) * armMotion;
      arm.upper.rotation.z = arm.upperBase + arm.lowerSign * sway;
      arm.lower.rotation.z = arm.lowerBase - arm.lowerSign * sway * 0.42;
      if (arm.hand) arm.hand.rotation.z = arm.handBase + arm.lowerSign * sway * 0.2;
    }
    const breath = Math.sin(now * 0.00145);
    if (chestRig) chestRig.node.rotation.x = chestRig.x + breath * 0.006;
    if (neckRig) {
      neckRig.node.rotation.x = neckRig.x + (thinking ? 0.025 : Math.sin(now * 0.0008) * 0.009);
      neckRig.node.rotation.y = neckRig.y + Math.sin(now * 0.00055) * 0.012;
    }
    if (headRig) {
      const thoughtfulTilt = actingStyle === 'thoughtful' ? 0.018 : actingStyle === 'tender' ? -0.012 : 0;
      headRig.node.rotation.x = headRig.x + (thinking ? -0.025 : Math.sin(now * 0.00095) * 0.009);
      headRig.node.rotation.y = headRig.y + Math.sin(now * 0.00062) * 0.018 + (speaking && actingStyle === 'playful' ? Math.sin(speakingTime * 1.3) * 0.012 : 0);
      headRig.node.rotation.z = headRig.z + Math.sin(now * 0.00072) * 0.012 + thoughtfulTilt;
    }
    speakingTime += delta;
    mouthPulse = Math.max(0, mouthPulse - delta);
    const mouthShapes = ['aa', 'ee', 'ih', 'oh', 'ou'];
    if (speaking) {
      const syllable = Math.max(0, Math.sin(speakingTime * 12));
      const envelope = 0.08 + syllable * 0.22 + (mouthPulse > 0 ? 0.24 : 0);
      for (const shape of mouthShapes) vrm.expressionManager?.setValue(shape, shape === mouthShape ? Math.min(envelope, 0.64) : 0);
    } else {
      for (const shape of mouthShapes) vrm.expressionManager?.setValue(shape, 0);
    }

    if (blinkTime > 0) {
      blinkTime -= delta;
      const progress = 1 - Math.max(0, blinkTime) / blinkDuration;
      const blink = Math.sin(Math.PI * progress);
      vrm.expressionManager?.setValue('blink', blink);
    } else {
      vrm.expressionManager?.setValue('blink', 0);
      nextBlink -= delta;
      if (nextBlink <= 0) {
        blinkDuration = 0.12 + Math.random() * 0.07;
        blinkTime = blinkDuration;
        nextBlink = 2.8 + Math.random() * 4.2;
      }
    }
  }
  camera.lookAt(0, modelHeight * 0.52, 0);
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
