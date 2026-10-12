import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

const canvas = document.querySelector('#avatar-canvas');
const sceneElement = document.querySelector('#scene');
const placeholder = document.querySelector('#model-placeholder');
const stageStatus = document.querySelector('#stage-status');
const modelOnly = document.body.classList.contains('model-only');

let vrm = null;
let speaking = false;
let thinking = false;
let speakingTime = 0;
let mouthPulse = 0;
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
  embarrassed: { relaxed: 0.48, happy: 0.2, sad: 0.16 },
  excited: { happy: 0.58, surprised: 0.4 },
  teasing: { happy: 0.48, angry: 0.22 },
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
const mouthShapes = ['aa', 'ih', 'ou', 'ee', 'oh'];
let visemeTargets = Object.fromEntries(mouthShapes.map((shape) => [shape, 0]));
let visemeWeights = Object.fromEntries(mouthShapes.map((shape) => [shape, 0]));
let visemeManager = null;
let springBoneManager = null;
let poseRig = [];
let activePose = 'idle';
let poseBlend = 1;
let poseFrom = new THREE.Quaternion();
let poseTo = new THREE.Quaternion();
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
};

const scene = new THREE.Scene();
scene.background = null;
const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 100);
camera.position.set(0, 1.35, 3.7);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: modelOnly, antialias: true, powerPreference: 'high-performance' });
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

const emotionMap = { joy: 'grin', happy: 'grin', angry: 'pout', sorrow: 'pout', sad: 'pout', surprised: 'surprised', neutral: 'neutral', idle: 'neutral' };
let emotionTimer = 0;
window.setExpression = (emotion = 'neutral', intensity = 1, duration = 0.35) => {
  const name = emotionMap[String(emotion).toLowerCase()] || 'neutral'; const preset = expressionPresets[name] || {};
  faceFrom = { ...faceWeights }; faceTarget = Object.fromEntries(faceExpressions.map((expression) => [expression, (preset[expression] || 0) * THREE.MathUtils.clamp(Number(intensity) || 1, 0, 1)])); faceBlend = 0; selectedExpression = name; emotionTimer = Math.max(0, Number(duration) || 0); if (name === 'joy' || name === 'happy') performanceMode = 'blush'; return true;
};
function setViseme(shape, weight = 0) { const key = mouthShapes.includes(shape) ? shape : 'aa'; for (const name of mouthShapes) visemeTargets[name] = name === key ? THREE.MathUtils.clamp(Number(weight) || 0, 0, 1) : 0; }
function createPoseRig() {
  const names = ['head', 'neck', 'chest', 'spine', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand'];
  poseRig = names.map((name) => { const node = vrm.humanoid?.getNormalizedBoneNode(name); return { name, node, baseX: node?.rotation.x || 0, current: new THREE.Quaternion(), target: new THREE.Quaternion() }; }).filter((entry) => entry.node);
  poseRig.forEach((entry) => { entry.current.identity(); entry.target.identity(); });
  eyeRig = ['leftEye', 'rightEye'].map((name) => { const node = vrm.humanoid?.getNormalizedBoneNode(name); return { node, x: node?.rotation.x || 0, y: node?.rotation.y || 0 }; }).filter((entry) => entry.node);
}
window.setAvatarPose = (name = 'idle', duration = 0.45) => { activePose = Object.hasOwn(poseDefinitions, name) ? name : 'idle'; poseBlend = 0; poseFrom.identity(); poseTo.identity(); for (const entry of poseRig) { const offset = poseDefinitions[activePose][entry.name] || {}; entry.target.setFromEuler(new THREE.Euler(offset.x || 0, offset.y || 0, offset.z || 0)); entry.current.copy(poseFrom); } window.dispatchEvent(new CustomEvent('avatar-pose', { detail: { name: activePose, duration } })); };
window.setAvatarViseme = (shape, weight = 1) => setViseme(shape, weight);

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
    mouthPulse = 0;
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
  mouthPulse = 0.24;
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
    const bounds = new THREE.Box3().setFromObject(vrm.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(bounds.max.y - bounds.min.y, 1.3);
    modelHeight = height;
    modelBaseY = -bounds.min.y + 0.04;
    vrm.scene.position.set(-center.x, modelBaseY, -center.z);
    scene.add(vrm.scene);
    springBoneManager = vrm.springBoneManager || vrm.springBone?.manager || null;
    const visual = applyToonLook(vrm.scene);
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
    stageStatus.textContent = texturedMaterials === 0 && totalMaterials > 0 ? 'MODEL LOADED · TEXTURES MISSING' : `MODEL LOADED · TOON ${visual.toonMaterials} · SPRINGS ${springBoneManager ? 'ON' : 'N/A'}`;
    placeholder.classList.add('hidden');
    window.dispatchEvent(new CustomEvent('avatar-ready', { detail: { expressions: availableExpressions } }));
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
canvas.addEventListener('pointerdown', (event) => {
  dragX = event.clientX;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect(); gazeX = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1); gazeY = THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
  if (dragX === null || !vrm) return;
  const delta = event.clientX - dragX;
  dragX = event.clientX;
  vrm.scene.rotation.y += delta * 0.008;
});
canvas.addEventListener('pointerleave', () => { gazeX = 0; gazeY = 0; });
canvas.addEventListener('pointerup', () => { dragX = null; });
canvas.addEventListener('pointercancel', () => { dragX = null; });
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
      const speechPulse = speaking ? 0.1 + Math.max(0, Math.sin(speakingTime * 2.2)) * 0.06 + speechWordEnergy * 0.08 : 0;
      const speechBlend = speechExpressionTime > 0 ? Math.min(1, speechExpressionTime * 5) : 0;
      const emphasized = speechBlend * speechExpressionWeight;
      const reactiveWeight = expression === speechExpression ? Math.max(speechPulse, emphasized) : 0;
      const thoughtWeight = (thinking || performanceMode === 'listen') && expression === 'relaxed' ? 0.2 + Math.max(0, Math.sin(now * 0.00075)) * 0.08 : 0;
      const selectedWeight = faceWeights[expression] * (1 - speechBlend * 0.7);
      vrm.expressionManager?.setValue(expression, Math.max(selectedWeight, reactiveWeight, thoughtWeight));
    }
    const blushTarget = performanceMode === 'blush' ? (speaking ? 0.82 : 0.68) : 0;
    blushAmount = THREE.MathUtils.lerp(blushAmount, blushTarget, Math.min(1, delta * 8));
    if (vrm.expressionManager?.getExpression('blush')) vrm.expressionManager.setValue('blush', blushAmount);
    speechExpressionTime = Math.max(0, speechExpressionTime - delta);
    speechWordEnergy = THREE.MathUtils.damp(speechWordEnergy, 0, 5, delta);
    performanceTime += delta;
    const armMotion = performanceMode === 'wave'
      ? 0.16 + Math.sin(performanceTime * 3.4) * 0.04
      : speaking ? (actingStyle === 'playful' ? 0.085 : actingStyle === 'tender' ? 0.048 : 0.058) : 0;
    for (const arm of armRig) {
      const sway = performanceMode === 'wave' && arm.phase > 0
        ? Math.sin(performanceTime * 8) * 0.23
        : Math.sin(now * 0.0018 + arm.phase) * armMotion;
      arm.upper.rotation.z = THREE.MathUtils.damp(arm.upper.rotation.z, arm.upperBase + arm.lowerSign * sway, 12, delta);
      arm.lower.rotation.z = THREE.MathUtils.damp(arm.lower.rotation.z, arm.lowerBase - arm.lowerSign * sway * 0.42, 12, delta);
      if (arm.hand) arm.hand.rotation.z = THREE.MathUtils.damp(arm.hand.rotation.z, arm.handBase + arm.lowerSign * sway * 0.2, 12, delta);
    }
    const breath = Math.sin(now * 0.00145);
    const breathLift = breath * 0.009 + Math.sin(now * 0.00072) * 0.003;
    if (chestRig) chestRig.node.rotation.x = THREE.MathUtils.damp(chestRig.node.rotation.x, chestRig.x + breathLift, 9, delta);
    const spineEntry = poseRig.find((entry) => entry.name === 'spine');
    if (spineEntry) spineEntry.node.rotation.x = THREE.MathUtils.damp(spineEntry.node.rotation.x, spineEntry.baseX + breath * 0.0015, 7, delta);
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
    mouthPulse = Math.max(0, mouthPulse - delta);
    if (speaking) { const syllable = Math.max(0, Math.sin(speakingTime * 12)); const envelope = 0.07 + syllable * 0.2 + speechWordEnergy * 0.18 + (mouthPulse > 0 ? 0.24 : 0); visemeTargets[mouthShape] = Math.max(visemeTargets[mouthShape], Math.min(envelope, 0.72)); }
    for (const shape of mouthShapes) { visemeWeights[shape] = THREE.MathUtils.damp(visemeWeights[shape], visemeTargets[shape], 14, delta); vrm.expressionManager?.setValue(shape, visemeWeights[shape]); }
    applyPoseOverlay(delta);

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
