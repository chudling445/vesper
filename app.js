import { appStore } from './persistence.js';
import { initGlobalFeedback, safeFetch, showToast } from './feedback.js';
import { applyPaletteTheme, initThemeProvider, PALETTES } from './theme-provider.js';
import { copyText, downloadText, shareSummary, toCsv, toMarkdown, workspaceSnapshot } from './export-utils.js';
import { initDialogAccessibility } from './a11y.js';
import { initOfflineSync } from './offline-sync.js';
import { initSecurityLock } from './security-lock.js';
import { waifuVoice } from './waifuVoice.js';
import { relationshipMemory } from './relationship-memory.js';
import { characterCardPrompt, downloadCharacterPng, exportCharacterJson, readCharacterCard } from './character-cards.js';
import { renderMarkdown } from './markdown-renderer.js';
import './arcade-launcher.js';

initGlobalFeedback();
initThemeProvider();
initDialogAccessibility();
initOfflineSync();
initSecurityLock();

const form = document.querySelector('#chat-form');
const input = document.querySelector('#message-input');
const messagesEl = document.querySelector('#messages');
const sendButton = document.querySelector('#send-button');
const voiceInput = document.querySelector('#voice-input');
const connectionLabel = document.querySelector('#connection-label');
const welcomeCard = document.querySelector('#welcome-card');
const themeDock = document.querySelector('#theme-dock');
const themeToggle = document.querySelector('#theme-toggle');
const themeMenu = document.querySelector('#theme-menu');
const themeName = document.querySelector('#theme-name');
const themeSwatch = document.querySelector('#theme-swatch');
const dialog = document.querySelector('#llm-dialog');
const accessDialog = document.querySelector('#access-dialog');
const accessForm = document.querySelector('#access-form');
const accessPassword = document.querySelector('#access-password');
const accessStatus = document.querySelector('#access-status');
const lockButton = document.querySelector('#lock-app');
const hostStatus = document.querySelector('#host-status');
const hostNote = document.querySelector('#host-note');
const settingsCopy = document.querySelector('#settings-copy');
const modelOnlyOpen = document.querySelector('#model-only-open');
const credentialsNote = document.querySelector('#credentials-note');
const providerSelect = document.querySelector('#provider-select');
const modelInput = document.querySelector('#model-input');
const providerHint = document.querySelector('#provider-hint');
const providerStatus = document.querySelector('#provider-status');
const systemPromptInput = document.querySelector('#system-prompt');
const avatarTintInput = document.querySelector('#avatar-tint');
const avatarParticlesInput = document.querySelector('#avatar-particles');
const wardrobeLayersElement = document.querySelector('#wardrobe-layers');
const wardrobeStatus = document.querySelector('#wardrobe-status');
const installedModels = document.querySelector('#installed-models');
const providerBadge = document.querySelector('#provider-badge');
const quickstartStatus = document.querySelector('#quickstart-status');
const quickstartMessage = document.querySelector('#quickstart-message');
const quickstartSettings = document.querySelector('#quickstart-settings');
const quickstartGetOllama = document.querySelector('#quickstart-get-ollama');
const voiceSelect = document.querySelector('#voice-select');
const autoSpeak = document.querySelector('#auto-speak');
const speechRate = document.querySelector('#speech-rate');
const speechPitch = document.querySelector('#speech-pitch');
const speechRateValue = document.querySelector('#speech-rate-value');
const speechPitchValue = document.querySelector('#speech-pitch-value');
const voiceStatus = document.querySelector('#voice-status');
const chatSearch = document.querySelector('#chat-search');
const chatSearchStatus = document.querySelector('#chat-search-status');
const localContextStatus = document.querySelector('#local-context-status');
const conversationBranchesSelect = document.querySelector('#conversation-branches');
const exportChat = document.querySelector('#export-chat');
const commandOpen = document.querySelector('#command-open');
const commandDialog = document.querySelector('#command-dialog');
const commandClose = document.querySelector('#command-close');
const commandSearch = document.querySelector('#command-search');
const commandList = document.querySelector('#command-list');
const commandStatus = document.querySelector('#command-status');
const quickCaptureOpen = document.querySelector('#quick-capture-open');
const screenCaptureButton = document.querySelector('#screen-capture');
const visionPreview = document.querySelector('#vision-preview');
const visionPreviewImage = document.querySelector('#vision-preview-image');
const visionClearButton = document.querySelector('#vision-clear');
const characterCardFile = document.querySelector('#character-card-file');
const characterCardStatus = document.querySelector('#character-card-status');
const memorySummaryElement = document.querySelector('#memory-summary');
const memoryFactsElement = document.querySelector('#memory-facts');
const memoryForm = document.querySelector('#memory-form');
const memoryFormStatus = document.querySelector('#memory-form-status');
let editingMemoryId = null;
const avatarStreamToggle = document.querySelector('#avatar-stream-toggle');
const STORAGE_KEY = 'vesper-chat-v1';
const THEME_KEY = 'vesper_active_theme';
const PERSONALITY_KEY = 'vesper-personality-v1';
const LLM_KEY = 'vesper-llm-v1';
const VOICE_KEY = 'vesper-voice-v1';
const STAGE_KEY = 'vesper-stage-v2';
const BACKGROUND_KEY = 'vesper-background-v1';
modelOnlyOpen?.addEventListener('click', () => {
  const popup = window.open('/model-only', 'vesper-model-only', 'popup=yes,width=560,height=820,resizable=yes');
  if (!popup) window.location.href = '/model-only';
});
function openQuickCapture() {
  const popup = window.open('/quick-capture', 'vesper-quick-capture', 'popup=yes,width=520,height=760,resizable=yes');
  if (!popup) window.location.href = '/quick-capture';
}
quickCaptureOpen?.addEventListener('click', openQuickCapture);
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space') { event.preventDefault(); openQuickCapture(); }
});
const MAX_HISTORY = 24;
const VOICE_PROFILE = { rate: 1.1, pitch: 1.4, label: 'BRIGHT ANIME DUB' };
const THEMES = PALETTES;
const PERSONALITY_MODES = {
  playful: { description: 'Playful · quick-witted warmth' },
  tender: { description: 'Tender · gentle affection' },
  thoughtful: { description: 'Thoughtful · curious reflection' },
};
const PERSONALITY_EXPRESSIONS = { playful: 'smirk', tender: 'fond', thoughtful: 'thinking' };
const PROVIDER_COPY = {
  ollama: 'Runs on this computer through Ollama. Attached screen frames require an installed vision model.',
  openai: 'Uses OpenAI. Attached screen frames, relevant memories, matched notes, and recent messages are sent to OpenAI; the key stays in .env.',
  anthropic: 'Uses Anthropic Claude. Attached screen frames and the context you enable are sent to Anthropic.',
  xai: 'Uses xAI Grok. Attached screen frames and the context you enable are sent to xAI.',
  compatible: 'Uses your compatible endpoint. Attached screen frames require image support; enabled context is sent to that service.',
};

let messages = loadMessages();
let conversationBranches = loadConversationBranches();
let conversationSummary = String(appStore.get('session.summary', '') || '').slice(0, 2600);
let pendingVisionFrame = null;
let avatarStream = null;
let isSending = false;
let llm = loadLlmChoice();
let serverSettings = null;
let activeUtterance = null;
let activeSpeakButton = null;
let voiceSettings = loadVoiceSettings();
let stageSettings = loadStageSettings();
let personalityMode = loadPersonalityMode();
let preferredWaifuVoice = null;
let unavailableVisemes = [];
let chatFilter = '';
let avatarCustomization = (() => {
  const saved = appStore.get('settings.avatar', {});
  return {
    tint: typeof saved.tint === 'string' && /^#[0-9a-f]{6}$/i.test(saved.tint) ? saved.tint : '#ffffff',
    particles: saved.particles !== false,
    layers: saved.layers && typeof saved.layers === 'object' ? saved.layers : {},
  };
})();
let availableWardrobeLayers = [];
const backgroundPresets = ['atelier', 'sakura', 'midnight', 'aurora', 'sunset'];
function applyBackground(name) {
  const selected = backgroundPresets.includes(name) ? name : 'atelier';
  const scene = document.querySelector('#scene');
  if (scene) scene.dataset.background = selected;
  document.querySelectorAll('[data-background]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.background === selected)));
  appStore.set('settings.background', selected);
}
let savedBackground = backgroundPresets.includes(appStore.get('settings.background', 'atelier')) ? appStore.get('settings.background') : 'atelier';
applyBackground(savedBackground);
const moodLabel = document.querySelector('.mood-mark span');

function saveAvatarCustomization() {
  appStore.set('settings.avatar', avatarCustomization);
}

avatarTintInput.value = avatarCustomization.tint;
avatarParticlesInput.checked = avatarCustomization.particles;
avatarTintInput.addEventListener('input', () => {
  avatarCustomization.tint = avatarTintInput.value;
  window.setAvatarTint?.(avatarCustomization.tint);
  saveAvatarCustomization();
});
avatarParticlesInput.addEventListener('change', () => {
  avatarCustomization.particles = avatarParticlesInput.checked;
  window.setAvatarParticles?.(avatarCustomization.particles);
  saveAvatarCustomization();
});

function renderWardrobeLayers(layers = []) {
  wardrobeLayersElement.replaceChildren();
  const available = layers.filter((layer) => layer && typeof layer.id === 'string' && typeof layer.name === 'string');
  if (!available.length) {
    wardrobeStatus.textContent = 'NO SEPARATE LAYERS';
    const note = document.createElement('small');
    note.textContent = 'This model has no separately named clothing or accessory meshes.';
    wardrobeLayersElement.append(note);
    return;
  }
  wardrobeStatus.textContent = `${available.length} MODEL LAYER${available.length === 1 ? '' : 'S'}`;
  for (const layer of available) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Object.hasOwn(avatarCustomization.layers, layer.id) ? avatarCustomization.layers[layer.id] !== false : layer.visible;
    input.addEventListener('change', () => {
      avatarCustomization.layers[layer.id] = input.checked;
      window.setAvatarLayerVisibility?.(layer.id, input.checked);
      saveAvatarCustomization();
    });
    const name = document.createElement('span');
    name.textContent = layer.name;
    label.append(input, name);
    wardrobeLayersElement.append(label);
    if (input.checked !== layer.visible) window.setAvatarLayerVisibility?.(layer.id, input.checked);
  }
}

function setPresence(state) {
  const labels = { idle: 'HERE', thinking: 'THINKING', speaking: 'SPEAKING' };
  moodLabel.textContent = labels[state] || labels.idle;
  document.querySelector('.mood-mark').title = state === 'thinking' ? 'Vesper is thinking' : state === 'speaking' ? 'Vesper is speaking' : 'Vesper is here';
}

function loadStageSettings() {
  try {
    const saved = appStore.get('settings.stage', {});
    const savedZoom = saved.zoom === 2.7 ? 2.15 : saved.zoom;
    return { zoom: Number.isFinite(savedZoom) ? Math.min(3.6, Math.max(1.8, savedZoom)) : 2.15, orbit: saved.orbit === true };
  } catch { return { zoom: 2.15, orbit: false }; }
}

function saveStageSettings() {
  appStore.set('settings.stage', stageSettings);
}

function loadVoiceSettings() {
  try {
    const saved = appStore.get('settings.voice', {});
    return {
      auto: saved.auto === true,
      voiceURI: typeof saved.voiceURI === 'string' ? saved.voiceURI : '',
      language: saved.language === 'ja' ? 'ja' : 'en',
      rate: Number.isFinite(saved.rate) ? Math.min(1.3, Math.max(0.7, saved.rate)) : VOICE_PROFILE.rate,
      pitch: Number.isFinite(saved.pitch) ? Math.min(1.4, Math.max(0.7, saved.pitch)) : VOICE_PROFILE.pitch,
    };
  } catch { return { auto: false, voiceURI: '', rate: VOICE_PROFILE.rate, pitch: VOICE_PROFILE.pitch }; }
}

function saveVoiceSettings() {
  voiceSettings = { auto: autoSpeak.checked, voiceURI: '', language: voiceSelect.value === '__anime_ja__' ? 'ja' : 'en', rate: Number(speechRate.value), pitch: Number(speechPitch.value) };
  appStore.set('settings.voice', voiceSettings);
}

function refreshVoiceList() {
  if (!('speechSynthesis' in window)) {
    voiceSelect.disabled = true;
    autoSpeak.disabled = true;
    voiceStatus.textContent = 'SYSTEM SPEECH IS NOT AVAILABLE IN THIS BROWSER';
    return;
  }
  const voices = window.speechSynthesis.getVoices().sort((a, b) => {
    const score = (voice) => (/(female|zira|samantha|aria|jenny|sonia|nanami|haruka|sayaka)/i.test(voice.name) ? 3 : 0) + (voice.lang.toLowerCase().startsWith(voiceSettings.language) ? 1 : 0);
    return score(b) - score(a) || a.name.localeCompare(b.name);
  });
  const matching = voices.filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith(voiceSettings.language));
  preferredWaifuVoice = matching[0] || null;
  voiceSelect.replaceChildren(new Option('ANIME DUB · ENGLISH', '__anime_en__'), new Option('ANIME DUB · 日本語', '__anime_ja__'));
  voiceSelect.value = voiceSettings.language === 'ja' ? '__anime_ja__' : '__anime_en__';
  const hasVoices = voices.length > 0;
  voiceSelect.disabled = false;
  autoSpeak.disabled = !hasVoices;
  voiceStatus.textContent = matching.length
    ? `${voiceSettings.language === 'ja' ? 'JAPANESE' : 'ENGLISH'} ANIME DUB · ${unavailableVisemes.length ? `MODEL MISSING ${unavailableVisemes.join('/').toUpperCase()}` : 'VISEME SYNC READY'}`
    : hasVoices
      ? `NO ${voiceSettings.language === 'ja' ? 'JAPANESE' : 'ENGLISH'} SYSTEM VOICE · INSTALL ONE FOR THIS PROFILE`
    : 'NO SYSTEM VOICE FOUND · ADD A WINDOWS SPEECH VOICE';
}

function loadMessages() {
  try {
    const saved = appStore.get('session.messages', []);
    return Array.isArray(saved) ? saved.filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').map((m) => ({ role: m.role, content: m.content, pinned: m.pinned === true })).slice(-MAX_HISTORY) : [];
  } catch { return []; }
}

function loadLlmChoice() {
  try {
    const saved = appStore.get('settings.llm', {});
    return { provider: ['ollama', 'openai', 'anthropic', 'xai', 'compatible'].includes(saved.provider) ? saved.provider : '', model: typeof saved.model === 'string' ? saved.model : '' };
  } catch { return { provider: '', model: '' }; }
}

function saveLlmChoice() {
  appStore.set('settings.llm', llm);
}

function saveMessages() {
  appStore.set('session.messages', messages.slice(-MAX_HISTORY));
  appStore.set('session.branches', conversationBranches);
  refreshConversationBranches();
}

function loadConversationBranches() {
  const saved = appStore.get('session.branches', []);
  return Array.isArray(saved) ? saved.filter((branch) => branch && typeof branch.id === 'string' && Array.isArray(branch.messages))
    .slice(-8).map((branch) => ({
      id: branch.id,
      label: String(branch.label || 'Conversation branch').slice(0, 80),
      createdAt: Number(branch.createdAt) || Date.now(),
      summary: typeof branch.summary === 'string' ? branch.summary.slice(0, 2600) : '',
      messages: branch.messages.filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string')
        .slice(-MAX_HISTORY).map((message) => ({ role: message.role, content: message.content.slice(0, 4000), pinned: message.pinned === true })),
    })) : [];
}

function refreshConversationBranches() {
  if (!conversationBranchesSelect) return;
  const branches = [...conversationBranches].reverse();
  conversationBranchesSelect.replaceChildren(new Option('SAVED BRANCHES', ''));
  branches.forEach((branch) => {
    const date = new Date(branch.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    conversationBranchesSelect.add(new Option(`${branch.label} · ${date}`, branch.id));
  });
  conversationBranchesSelect.hidden = branches.length === 0;
}

function saveConversationBranch(label, branchMessages = messages) {
  const snapshot = branchMessages.slice(-MAX_HISTORY).map((message) => ({ role: message.role, content: String(message.content || '').slice(0, 4000), pinned: message.pinned === true }));
  if (!snapshot.length) return;
  conversationBranches.push({ id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, label, createdAt: Date.now(), summary: conversationSummary, messages: snapshot });
  conversationBranches = conversationBranches.slice(-8);
  appStore.set('session.branches', conversationBranches);
  refreshConversationBranches();
}

function loadPersonalityMode() {
  try {
    const saved = appStore.get('settings.personality', 'playful');
    return Object.hasOwn(PERSONALITY_MODES, saved) ? saved : 'playful';
  } catch { return 'playful'; }
}

function loadSystemPrompt() {
  const value = appStore.get('settings.persona.systemPrompt', '');
  return typeof value === 'string' ? value.slice(0, 4000) : '';
}

function loadPersonaInstructions(query = '') {
  return [loadSystemPrompt(), characterCardPrompt(appStore.get('settings.persona.card', null), query)].filter(Boolean).join('\n\n').slice(0, 9000);
}

function compactConversationIfNeeded() {
  if (messages.length < MAX_HISTORY - 1) return;
  const archived = messages.splice(0, Math.max(4, Math.floor(MAX_HISTORY / 3)));
  const excerpts = archived.map((message) => (message.role === 'user' ? 'User: ' : 'Vesper: ') + message.content.replace(/\s+/g, ' ').slice(0, 210));
  conversationSummary = [conversationSummary, ...excerpts].filter(Boolean).join('\n').slice(-2600);
  appStore.set('session.summary', conversationSummary);
}

function renderMemorySummary(snapshot = relationshipMemory.snapshot()) {
  if (!memorySummaryElement) return;
  memorySummaryElement.textContent = snapshot.facts.length + ' remembered details · ' + snapshot.tier + ' · ' + snapshot.exchanges + ' conversations';
  if (memoryFactsElement) {
    memoryFactsElement.replaceChildren();
    snapshot.facts.forEach((fact) => {
      const item = document.createElement('li');
      const detail = document.createElement('span');
      detail.className = 'memory-fact-detail';
      detail.textContent = `${fact.pinned ? 'PINNED · ' : ''}${fact.category.toUpperCase()} · ${fact.value}`;
      const actions = document.createElement('span');
      actions.className = 'memory-fact-actions';
      const pin = document.createElement('button');
      pin.type = 'button'; pin.dataset.memoryAction = 'pin'; pin.dataset.memoryId = fact.id;
      pin.textContent = fact.pinned ? 'UNPIN' : 'PIN'; pin.setAttribute('aria-label', `${fact.pinned ? 'Unpin' : 'Pin'} memory: ${fact.value}`);
      const edit = document.createElement('button');
      edit.type = 'button'; edit.dataset.memoryAction = 'edit'; edit.dataset.memoryId = fact.id;
      edit.textContent = 'EDIT'; edit.setAttribute('aria-label', `Edit memory: ${fact.value}`);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.dataset.memoryAction = 'delete'; remove.dataset.memoryId = fact.id;
      remove.textContent = 'REMOVE'; remove.setAttribute('aria-label', `Remove memory: ${fact.value}`);
      actions.append(pin, edit, remove);
      item.append(detail, actions);
      memoryFactsElement.append(item);
    });
  }
}

function showMemoryForm(fact = null) {
  if (!memoryForm) return;
  editingMemoryId = fact?.id || null;
  document.querySelector('#memory-category').value = fact?.category || 'note';
  document.querySelector('#memory-value').value = fact?.value || '';
  document.querySelector('#memory-pinned').checked = Boolean(fact?.pinned);
  memoryFormStatus.textContent = fact ? 'Update this saved detail.' : 'Saved on this device only.';
  memoryForm.hidden = false;
  document.querySelector('#memory-value').focus();
}

document.querySelector('#memory-add')?.addEventListener('click', () => showMemoryForm());
document.querySelector('#memory-cancel')?.addEventListener('click', () => { memoryForm.hidden = true; editingMemoryId = null; memoryForm.reset(); });
memoryForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fact = { category: document.querySelector('#memory-category').value, value: document.querySelector('#memory-value').value, pinned: document.querySelector('#memory-pinned').checked };
  try {
    if (editingMemoryId) await relationshipMemory.updateFact(editingMemoryId, fact);
    else await relationshipMemory.addFact(fact);
    memoryForm.hidden = true; editingMemoryId = null; memoryForm.reset();
    showToast('Memory saved on this device.', 'success');
  } catch (error) { memoryFormStatus.textContent = error.message || 'Could not save this memory.'; }
});
memoryFactsElement?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-memory-action]');
  if (!button) return;
  const fact = relationshipMemory.snapshot().facts.find((item) => item.id === button.dataset.memoryId);
  if (!fact) return;
  try {
    if (button.dataset.memoryAction === 'edit') showMemoryForm(fact);
    else if (button.dataset.memoryAction === 'pin') await relationshipMemory.setPinned(fact.id, !fact.pinned);
    else if (button.dataset.memoryAction === 'delete' && window.confirm('Remove this saved memory from this device?')) await relationshipMemory.deleteFact(fact.id);
  } catch (error) { showToast(error.message || 'Could not update this memory.', 'warning'); }
});

function clearVisionFrame() {
  if (!pendingVisionFrame) return;
  if (pendingVisionFrame.previewUrl) URL.revokeObjectURL(pendingVisionFrame.previewUrl);
  pendingVisionFrame = null;
  visionPreview.hidden = true;
  visionPreviewImage.removeAttribute('src');
}

async function captureScreenFrame() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    showToast('Screen capture is unavailable in this browser. Try the local Vesper window in a current Chromium browser.', 'warning');
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }));
    if (!video.videoWidth || !video.videoHeight) throw new Error('The selected display did not provide a frame.');
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    if (!blob || blob.size > 2_500_000) throw new Error('The captured image could not be compressed.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    clearVisionFrame();
    pendingVisionFrame = { mediaType: 'image/jpeg', data: btoa(binary), previewUrl: URL.createObjectURL(blob) };
    visionPreviewImage.src = pendingVisionFrame.previewUrl;
    visionPreview.hidden = false;
    showToast('Screen frame ready. It will be sent with your next message.', 'success');
  } catch (error) {
    if (error.name !== 'NotAllowedError') showToast(error.message || 'Could not capture the selected screen.', 'error');
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

screenCaptureButton?.addEventListener('click', captureScreenFrame);
visionClearButton?.addEventListener('click', clearVisionFrame);
avatarStreamToggle?.addEventListener('click', () => {
  if (avatarStream) {
    avatarStream.getTracks().forEach((track) => track.stop());
    avatarStream = null;
    window.vesperAvatarStream = null;
    avatarStreamToggle.textContent = 'STREAM OFF';
    avatarStreamToggle.setAttribute('aria-pressed', 'false');
    window.dispatchEvent(new CustomEvent('vesper-avatar-stream', { detail: { stream: null } }));
    return;
  }
  avatarStream = window.getVesperAvatarStream?.() || null;
  if (!avatarStream) { showToast('Canvas streaming is unavailable in this browser.', 'warning'); return; }
  window.vesperAvatarStream = avatarStream;
  avatarStreamToggle.textContent = 'STREAM ON';
  avatarStreamToggle.setAttribute('aria-pressed', 'true');
  window.dispatchEvent(new CustomEvent('vesper-avatar-stream', { detail: { stream: avatarStream } }));
  showToast('A 30 FPS avatar MediaStream is available to local integrations.', 'success');
});
window.addEventListener('pagehide', () => avatarStream?.getTracks().forEach((track) => track.stop()), { once: true });
relationshipMemory.ready.then(renderMemorySummary);
window.addEventListener('vesper-memory-change', (event) => renderMemorySummary(event.detail));
document.querySelector('#forget-memory')?.addEventListener('click', async () => {
  if (!window.confirm('Forget all saved Vesper memories on this device?')) return;
  await relationshipMemory.forgetAll();
  showToast('Saved memories were removed from this device.', 'success');
});

characterCardFile?.addEventListener('change', async () => {
  const file = characterCardFile.files?.[0];
  if (!file) return;
  try {
    const card = await readCharacterCard(file);
    appStore.set('settings.persona.card', card);
    characterCardStatus.textContent = 'Loaded ' + card.name + (card.character_book ? ' · lorebook ready' : '');
    showToast('Character card imported and saved locally.', 'success');
  } catch (error) {
    showToast(error.message || 'Could not import this character card.', 'error');
  } finally { characterCardFile.value = ''; }
});
document.querySelector('#character-card-export-json')?.addEventListener('click', () => {
  const card = appStore.get('settings.persona.card', null);
  if (!card) { showToast('Import a character card first.', 'info'); return; }
  downloadText((card.name || 'character').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-card.json', JSON.stringify(exportCharacterJson(card), null, 2), 'application/json;charset=utf-8');
});
document.querySelector('#character-card-export-png')?.addEventListener('click', async () => {
  const card = appStore.get('settings.persona.card', null);
  if (!card) { showToast('Import a character card first.', 'info'); return; }
  try { await downloadCharacterPng(card); } catch (error) { showToast(error.message || 'Could not export the PNG character card.', 'error'); }
});
const storedCharacterCard = appStore.get('settings.persona.card', null);
if (storedCharacterCard && characterCardStatus) characterCardStatus.textContent = 'Loaded ' + storedCharacterCard.name + (storedCharacterCard.character_book ? ' · lorebook ready' : '');

function findLocalWorkspaceContext(query) {
  const requiresUnlock = Boolean(appStore.get('settings.security.protectInbox', false) || appStore.get('settings.security.pinHash', '') || appStore.get('settings.security.biometricId', ''));
  if (requiresUnlock && sessionStorage.getItem('vesper-unlocked-v1') !== '1') return { text: '', count: 0 };
  const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'what', 'when', 'where', 'how', 'you', 'your', 'about']);
  const terms = [...new Set((String(query).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter((term) => !stopWords.has(term)))];
  if (!terms.length) return { text: '', count: 0 };
  const items = appStore.get('workspace.items', []);
  if (!Array.isArray(items)) return { text: '', count: 0 };
  const matches = items.map((item) => {
    const title = String(item?.title || '');
    const body = String(item?.body || '');
    const haystack = `${title} ${body}`.toLowerCase();
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0) + (title.toLowerCase().includes(term) ? 1 : 0), 0);
    return { item, title, body, score };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  return {
    count: matches.length,
    text: matches.map(({ item, title, body }, index) => `[Local note ${index + 1} · ${title || 'Untitled'} · ${item.category || 'Note'}${item.project ? ` · Project: ${item.project}` : ''}]\n${body.slice(0, 1200)}`).join('\n\n').slice(0, 4000),
  };
}

function applyPersonalityMode(mode, persist = true) {
  personalityMode = Object.hasOwn(PERSONALITY_MODES, mode) ? mode : 'playful';
  document.querySelectorAll('[data-personality-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.personalityMode === personalityMode));
  });
  document.querySelectorAll('[data-expression]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.expression === PERSONALITY_EXPRESSIONS[personalityMode]));
  });
  document.querySelector('#personality-description').textContent = PERSONALITY_MODES[personalityMode].description;
  window.setAvatarPersonality?.(personalityMode);
  if (persist) {
    appStore.set('settings.personality', personalityMode);
  }
}

function applyTheme(themeId) {
  const selected = THEMES.find((theme) => theme.id === themeId) || THEMES[0];
  applyPaletteTheme(selected.id);
  themeName.textContent = selected.name.toUpperCase();
  themeSwatch.className = `theme-swatch ${selected.id}-dot`;
  themeSwatch.style.background = `linear-gradient(135deg, ${selected.colors[1]} 0 48%, ${selected.colors[0]} 52%)`;
  themeSwatch.style.boxShadow = `0 0 8px ${selected.vars.accentGlow}`;
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.themeOption === selected.id));
  });
}

document.addEventListener('vesper-palette-change', (event) => {
  const selected = THEMES.find((theme) => theme.id === event.detail?.theme) || THEMES[0];
  themeName.textContent = selected.name.toUpperCase();
  themeSwatch.className = `theme-swatch ${selected.id}-dot`;
  themeSwatch.style.background = `linear-gradient(135deg, ${selected.colors[1]} 0 48%, ${selected.colors[0]} 52%)`;
  themeSwatch.style.boxShadow = `0 0 8px ${selected.vars.accentGlow}`;
});

function closeThemeMenu() {
  themeMenu.hidden = true;
  themeToggle.setAttribute('aria-expanded', 'false');
}

let savedPalette = '';
try { savedPalette = localStorage.getItem(THEME_KEY) || ''; } catch { /* appStore remains the fallback. */ }
applyTheme(savedPalette || appStore.get('settings.theme', 'omarchy-quattro'));

themeToggle.addEventListener('click', () => {
  const willOpen = themeMenu.hidden;
  themeMenu.hidden = !willOpen;
  themeToggle.setAttribute('aria-expanded', String(willOpen));
});

document.querySelectorAll('[data-theme-option]').forEach((button) => {
  button.addEventListener('click', () => { applyTheme(button.dataset.themeOption); closeThemeMenu(); });
});

document.querySelectorAll('[data-personality-mode]').forEach((button) => {
  button.addEventListener('click', () => applyPersonalityMode(button.dataset.personalityMode));
});
applyPersonalityMode(personalityMode, false);

document.addEventListener('click', (event) => { if (!themeDock.contains(event.target)) closeThemeMenu(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeThemeMenu();
  if (event.key.toLowerCase() !== 't' || event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = event.target?.tagName?.toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return;
  const currentIndex = THEMES.findIndex((theme) => theme.id === document.body.dataset.theme);
  applyTheme(THEMES[(currentIndex + 1) % THEMES.length].id);
  closeThemeMenu();
});

function stopSpeech() {
  waifuVoice.cancel();
  activeUtterance = null;
  if (activeSpeakButton) {
    activeSpeakButton.textContent = '▶';
    activeSpeakButton.title = 'Read this reply aloud';
    activeSpeakButton.setAttribute('aria-label', 'Read this reply aloud');
  }
  activeSpeakButton = null;
  if (voiceStatus) voiceStatus.textContent = voiceSelect.disabled
    ? 'SYSTEM SPEECH IS NOT AVAILABLE IN THIS BROWSER'
    : preferredWaifuVoice
      ? 'VOICE READY · VISEME SYNC'
      : 'NO SYSTEM VOICE FOUND · ADD A WINDOWS SPEECH VOICE';
  setPresence(isSending ? 'thinking' : 'idle');
}

function speakReply(text, button) {
  if (!waifuVoice.supported) return;
  if (activeSpeakButton === button) { stopSpeech(); return; }
  stopSpeech();
  activeSpeakButton = button;
  const punctuation = text.trim().at(-1);
  const utterance = waifuVoice.speak(text, {
    voice: preferredWaifuVoice,
    language: voiceSettings.language === 'ja' ? 'ja-JP' : 'en-US',
    rate: Number(speechRate.value) * (punctuation === '!' ? 1.03 : 1),
    pitch: Math.min(1.4, Number(speechPitch.value) + (punctuation === '!' ? 0.04 : punctuation === '?' ? 0.02 : 0)),
    onStart: () => {
      if (activeSpeakButton !== button) return;
      voiceStatus.textContent = 'VESPER IS SPEAKING · VISEME TIMING ACTIVE';
      setPresence('speaking');
    },
    onEnd: () => {
      if (activeSpeakButton !== button) return;
      activeUtterance = null;
      if (activeSpeakButton) {
        activeSpeakButton.textContent = '▶';
        activeSpeakButton.title = 'Read this reply aloud';
        activeSpeakButton.setAttribute('aria-label', 'Read this reply aloud');
      }
      activeSpeakButton = null;
      voiceStatus.textContent = preferredWaifuVoice ? 'VOICE READY · VISEME SYNC' : 'NO SYSTEM VOICE FOUND · ADD A WINDOWS SPEECH VOICE';
      setPresence(isSending ? 'thinking' : 'idle');
    },
    onError: (error) => {
      if (error?.error !== 'canceled' && error?.error !== 'interrupted') showToast('Speech playback could not finish.', 'error');
    },
  });
  if (!utterance) { activeSpeakButton = null; return; }
  activeUtterance = utterance;
  button.textContent = '■';
  button.title = 'Stop reading';
  button.setAttribute('aria-label', 'Stop reading');
}

autoSpeak.checked = voiceSettings.auto;
speechRate.value = String(voiceSettings.rate);
speechPitch.value = String(voiceSettings.pitch);
speechRateValue.value = `${Number(speechRate.value).toFixed(2)}×`;
speechPitchValue.value = `${Number(speechPitch.value).toFixed(2)}×`;
refreshVoiceList();
if ('speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', refreshVoiceList);
voiceSelect.addEventListener('change', () => { saveVoiceSettings(); refreshVoiceList(); });
autoSpeak.addEventListener('change', saveVoiceSettings);
speechRate.addEventListener('input', () => { speechRateValue.value = `${Number(speechRate.value).toFixed(2)}×`; saveVoiceSettings(); });
speechPitch.addEventListener('input', () => { speechPitchValue.value = `${Number(speechPitch.value).toFixed(2)}×`; saveVoiceSettings(); });
document.querySelector('#stop-speaking').addEventListener('click', stopSpeech);

const orbitButton = document.querySelector('#auto-orbit');
const zoomControl = document.querySelector('#stage-zoom');
zoomControl.value = String(stageSettings.zoom);
orbitButton.setAttribute('aria-pressed', String(stageSettings.orbit));
orbitButton.querySelector('b').textContent = stageSettings.orbit ? 'ON' : 'OFF';
orbitButton.addEventListener('click', () => {
  const enabled = orbitButton.getAttribute('aria-pressed') !== 'true';
  orbitButton.setAttribute('aria-pressed', String(enabled));
  orbitButton.querySelector('b').textContent = enabled ? 'ON' : 'OFF';
  stageSettings.orbit = enabled;
  saveStageSettings();
  window.setAvatarAutoRotate?.(enabled);
});
zoomControl.addEventListener('input', () => {
  stageSettings.zoom = Number(zoomControl.value);
  saveStageSettings();
  window.setAvatarZoom?.(stageSettings.zoom);
});
window.addEventListener('avatar-zoom', (event) => {
  if (!Number.isFinite(event.detail)) return;
  zoomControl.value = String(event.detail);
  stageSettings.zoom = event.detail;
  saveStageSettings();
});
document.querySelector('#reset-view').addEventListener('click', () => {
  zoomControl.value = '2.15';
  orbitButton.setAttribute('aria-pressed', 'false');
  orbitButton.querySelector('b').textContent = 'OFF';
  stageSettings = { zoom: 2.15, orbit: false };
  saveStageSettings();
  window.setAvatarReset?.();
});

function makeMessage(role, content, extraClass = '', pinned = false, messageIndex = -1) {
  const row = document.createElement('div');
  row.className = `message ${role}${extraClass ? ` ${extraClass}` : ''}${pinned ? ' is-pinned' : ''}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'assistant' ? '✿' : 'Y';
  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = renderMarkdown(content);
  bubble.querySelectorAll('[data-copy-code]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = bubble.querySelector(`[data-code-index="${button.dataset.copyCode}"]`)?.textContent || '';
      try {
        await copyText(code);
        button.textContent = 'COPIED';
        window.setTimeout(() => { button.textContent = 'COPY CODE'; }, 1200);
      } catch { button.textContent = 'COPY FAILED'; }
    });
  });
  messageContent.append(bubble);
  row.append(avatar, messageContent);
  if (!extraClass) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    if (role === 'user' && messageIndex >= 0) {
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'copy-button'; edit.textContent = 'EDIT / BRANCH';
      edit.setAttribute('aria-label', 'Edit this message and create a conversation branch');
      edit.addEventListener('click', () => {
        if (isSending || !messages[messageIndex]) return;
        const revised = window.prompt('Edit your message. The existing conversation will be saved as a branch.', messages[messageIndex].content);
        if (typeof revised !== 'string' || !revised.trim()) return;
        saveConversationBranch('Before edit', messages);
        messages = messages.slice(0, messageIndex);
        saveMessages();
        render();
        input.value = revised.trim();
        form.requestSubmit();
      });
      actions.append(edit);
    }
    if (role === 'assistant' && 'speechSynthesis' in window) {
      const speak = document.createElement('button');
      speak.type = 'button';
      speak.className = 'speak-button';
      speak.textContent = '▶';
      speak.title = 'Read this reply aloud';
      speak.setAttribute('aria-label', 'Read this reply aloud');
      speak.addEventListener('click', () => speakReply(content, speak));
      actions.append(speak);
    }
    if (role === 'assistant' && messageIndex > 0 && messages[messageIndex - 1]?.role === 'user') {
      const regenerate = document.createElement('button');
      regenerate.type = 'button'; regenerate.className = 'copy-button'; regenerate.textContent = 'REGENERATE';
      regenerate.setAttribute('aria-label', 'Regenerate this reply and save the current conversation as a branch');
      regenerate.addEventListener('click', () => {
        if (isSending || messages[messageIndex]?.role !== 'assistant') return;
        saveConversationBranch('Before regenerate', messages);
        messages = messages.slice(0, messageIndex);
        saveMessages();
        render();
        void sendMessage('', { appendUser: false });
      });
      actions.append(regenerate);
    }
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-button';
    copy.textContent = 'COPY';
    copy.title = 'Copy this reply';
    copy.setAttribute('aria-label', 'Copy this reply');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(content);
        copy.textContent = 'COPIED';
        copy.setAttribute('aria-label', 'Reply copied');
        window.setTimeout(() => { copy.textContent = 'COPY'; copy.setAttribute('aria-label', 'Copy this reply'); }, 1300);
      } catch {
        copy.textContent = 'UNAVAILABLE';
        copy.setAttribute('aria-label', 'Copy is unavailable');
        window.setTimeout(() => { copy.textContent = 'COPY'; copy.setAttribute('aria-label', 'Copy this reply'); }, 1300);
      }
    });
    actions.append(copy);
    const pin = document.createElement('button');
    pin.type = 'button'; pin.className = 'pin-button'; pin.textContent = pinned ? 'PINNED' : 'PIN'; pin.title = pinned ? 'Unpin this message' : 'Pin this message';
    pin.addEventListener('click', () => { if (messages[messageIndex]) { messages[messageIndex].pinned = !messages[messageIndex].pinned; saveMessages(); render(); } });
    actions.append(pin);
    messageContent.append(actions);
  }
  return row;
}

function render() {
  messagesEl.replaceChildren();
  if (!messages.length) {
    messagesEl.append(welcomeCard);
    welcomeCard.hidden = false;
  } else {
    welcomeCard.hidden = true;
    const visible = messages.map((message, index) => ({ message, index })).filter(({ message }) => !chatFilter || message.content.toLowerCase().includes(chatFilter));
    for (const { message, index } of visible) messagesEl.append(makeMessage(message.role, message.content, '', message.pinned, index));
    chatSearchStatus.textContent = chatFilter ? `${visible.length} / ${messages.length} MATCHED` : messages.length ? `${messages.length} MESSAGES` : '';
    if (chatFilter && !visible.length) { const empty = document.createElement('p'); empty.className = 'search-empty'; empty.textContent = 'No messages match that search.'; messagesEl.append(empty); }
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

refreshConversationBranches();

conversationBranchesSelect?.addEventListener('change', () => {
  const branch = conversationBranches.find((entry) => entry.id === conversationBranchesSelect.value);
  if (!branch || isSending) { conversationBranchesSelect.value = ''; return; }
  if (messages.length) saveConversationBranch('Before restore', messages);
  messages = branch.messages.map((message) => ({ ...message }));
  conversationSummary = branch.summary || '';
  appStore.set('session.summary', conversationSummary);
  conversationBranchesSelect.value = '';
  saveMessages();
  render();
  showToast('Saved conversation branch restored.', 'success');
});

function setSending(sending) {
  isSending = sending;
  sendButton.disabled = sending;
  if (screenCaptureButton) screenCaptureButton.disabled = sending;
  if (visionClearButton) visionClearButton.disabled = sending;
  input.disabled = sending;
  document.querySelector('#clear-chat').disabled = sending;
  if (sending) {
    connectionLabel.classList.remove('error-note');
    connectionLabel.textContent = 'VESPER IS THINKING…';
    setPresence('thinking');
    window.setAvatarThinking?.(true);
  } else {
    setPresence('idle');
    window.setAvatarThinking?.(false);
    if (!connectionLabel.classList.contains('error-note')) connectionLabel.textContent = 'YOUR TURN';
  }
}

function updateProviderBadge() {
  const names = { ollama: 'LOCAL', openai: 'OPENAI', anthropic: 'CLAUDE', xai: 'GROK', compatible: 'CUSTOM API' };
  const model = llm.model || providerModel(llm.provider);
  providerBadge.textContent = llm.provider ? `${names[llm.provider]} · ${model}` : 'CHOOSE A MODEL';
  providerBadge.title = llm.provider ? `Selected model: ${model}` : 'Open LLM settings to choose a model';
}

function providerInfo(provider) { return serverSettings?.providers?.[provider] || null; }

function providerModel(provider) { return providerInfo(provider)?.model || ({ ollama: 'llama3.2', openai: 'gpt-4.1-mini', anthropic: 'claude-sonnet-4-6', xai: 'grok-4.7', compatible: 'local-model' }[provider]); }

function updateQuickstart() {
  if (!quickstartStatus || !quickstartMessage) return;
  const downloadAvailable = serverSettings?.downloadAvailable === true;
  document.querySelectorAll('[data-app-download]').forEach((link) => { link.hidden = !downloadAvailable; });
  const downloadSeparator = document.querySelector('[data-download-separator]');
  if (downloadSeparator) downloadSeparator.hidden = !downloadAvailable;
  const provider = llm.provider || serverSettings?.defaultProvider || 'ollama';
  const info = providerInfo(provider);
  quickstartSettings.textContent = provider === 'ollama' && info?.models?.length ? 'CHANGE MODEL' : 'OPEN MODEL SETTINGS';
  quickstartGetOllama.hidden = provider !== 'ollama' || Boolean(info?.models?.length);
  if (provider === 'ollama') {
    const models = info?.models || [];
    const selected = llm.model || providerModel(provider) || 'llama3.2';
    const normalizeModel = (name) => name.toLowerCase().replace(/:latest$/, '');
    const installed = models.find((name) => normalizeModel(name) === normalizeModel(selected));
    if (installed) {
      quickstartStatus.textContent = 'READY · LOCAL';
      quickstartStatus.dataset.state = 'ready';
      quickstartMessage.textContent = `You're set. ${installed} is installed and Vesper can chat privately on this computer. Type below or try a starter question.`;
    } else if (models.length) {
      quickstartStatus.textContent = 'PICK AN INSTALLED MODEL';
      quickstartStatus.dataset.state = 'action';
      quickstartMessage.textContent = `${models.length} local model${models.length === 1 ? '' : 's'} ${models.length === 1 ? 'is' : 'are'} ready. Open model settings, tap an installed model name, then press Save Model.`;
    } else {
      quickstartStatus.textContent = 'ONE-TIME SETUP';
      quickstartStatus.dataset.state = 'action';
      quickstartMessage.textContent = 'To chat locally, install Ollama, download a model, then choose it here. You can still explore Vesper’s 3D character, voice, expressions, and themes now.';
    }
    return;
  }

  const isReady = Boolean(info?.ready);
  if (isReady) {
    quickstartStatus.textContent = 'READY · ONLINE';
    quickstartStatus.dataset.state = 'ready';
    quickstartMessage.textContent = 'Your provider is configured. Start a conversation below; messages are sent to the selected hosted provider.';
  } else {
    quickstartStatus.textContent = 'PROVIDER SETUP NEEDED';
    quickstartStatus.dataset.state = 'action';
    quickstartMessage.textContent = 'Add the provider key or endpoint in the app’s private .env file (or host settings), restart Vesper, then choose your model. Messages go to that provider.';
  }
}

function updateProviderDetail() {
  const provider = providerSelect.value;
  providerHint.textContent = PROVIDER_COPY[provider];
  const info = providerInfo(provider);
  const isReady = Boolean(info?.ready);
  const stateText = provider === 'ollama'
    ? (info?.models?.length ? `${info.models.length} local model${info.models.length === 1 ? '' : 's'} detected` : 'Ollama not detected yet · you can still enter a model')
    : provider === 'compatible'
      ? (isReady ? 'API endpoint is configured in .env' : 'API base URL is missing from .env')
      : (isReady ? 'API key is configured in .env' : 'API key is missing from .env');
  providerStatus.classList.toggle('needs-config', provider !== 'ollama' && !isReady);
  providerStatus.innerHTML = `<span class="status-dot"></span><span></span>`;
  providerStatus.lastElementChild.textContent = stateText;
  const models = provider === 'ollama' ? (info?.models || []) : [];
  installedModels.replaceChildren();
  installedModels.hidden = !models.length;
  if (models.length) {
    const label = document.createElement('span');
    label.textContent = 'INSTALLED';
    installedModels.append(label);
    for (const model of models) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = model;
      chip.addEventListener('click', () => { modelInput.value = model; });
      installedModels.append(chip);
    }
  }
}

function openSettings() {
  closeThemeMenu();
  providerSelect.value = llm.provider || serverSettings?.defaultProvider || 'ollama';
  modelInput.value = llm.model || providerModel(providerSelect.value);
  if (systemPromptInput) systemPromptInput.value = loadSystemPrompt();
  updateProviderDetail();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  refreshProviderSettings()
    .then(() => { if (dialog.open || dialog.hasAttribute('open')) updateProviderDetail(); })
    .catch(() => { serverSettings = null; if (dialog.open || dialog.hasAttribute('open')) updateProviderDetail(); });
}

function closeSettings() {
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}

function openAccessDialog() {
  accessStatus.textContent = '';
  if (typeof accessDialog.showModal === 'function' && !accessDialog.open) accessDialog.showModal();
  else accessDialog.setAttribute('open', '');
  window.setTimeout(() => accessPassword.focus(), 0);
}

async function initializeAccess() {
  try {
    const response = await safeFetch('/api/auth', { cache: 'no-store' }, 'Authentication check');
    const access = await response.json();
    const online = Boolean(access.required);
    hostStatus.textContent = online ? 'ONLINE / PRIVATE' : 'LOCAL / PRIVATE';
    hostNote.textContent = online ? 'ONLINE SITE · MODEL IS SERVED BY THIS SITE' : 'RUNNING ON THIS COMPUTER · MODEL STAYS IN YOUR FOLDER';
    settingsCopy.textContent = online
      ? 'Choose a model for this site. Provider credentials stay on the private app server.'
      : 'Select a local model or connect a provider. Credentials stay in this folder on your computer.';
    document.querySelector('#open-model-folder').hidden = online;
    credentialsNote.innerHTML = online
      ? '<b>Need credentials?</b> Add provider keys in the host’s private environment settings. Never paste API keys into chat.'
      : '<b>Need credentials?</b> Edit <code>.env</code> next to <code>Start Vesper.bat</code>, then restart the app. Never paste API keys into chat.';
    if (access.required && !access.authenticated) {
      lockButton.hidden = true;
      openAccessDialog();
      return;
    }
    lockButton.hidden = !access.required;
  } catch {
    lockButton.hidden = true;
    hostStatus.textContent = 'LOCAL / PRIVATE';
    hostNote.textContent = 'RUNNING ON THIS COMPUTER · MODEL STAYS IN YOUR FOLDER';
  }
  window.dispatchEvent(new Event('vesper-authenticated'));
  loadProviderSettings();
}

accessForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  accessStatus.textContent = 'Checking…';
  const submit = accessForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const response = await safeFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: accessPassword.value }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'That password did not unlock Vesper.');
    accessPassword.value = '';
    accessStatus.textContent = '';
    if (typeof accessDialog.close === 'function' && accessDialog.open) accessDialog.close();
    else accessDialog.removeAttribute('open');
    lockButton.hidden = false;
    window.dispatchEvent(new Event('vesper-authenticated'));
    await loadProviderSettings();
    input.focus();
  } catch (error) {
    accessStatus.textContent = error.message;
    accessPassword.select();
  } finally { submit.disabled = false; }
});

lockButton.addEventListener('click', async () => {
  stopSpeech();
  await safeFetch('/api/logout', { method: 'POST' }, 'Logout request').catch(() => {});
  window.location.reload();
});

document.querySelector('#settings-open').addEventListener('click', openSettings);
quickstartSettings.addEventListener('click', openSettings);
document.querySelector('#settings-close').addEventListener('click', closeSettings);
document.querySelector('#settings-cancel').addEventListener('click', closeSettings);
document.querySelector('#settings-save').addEventListener('click', () => {
  const model = modelInput.value.trim();
  if (!model) {
    modelInput.setCustomValidity('Enter a model name.');
    modelInput.reportValidity();
    return;
  }
  modelInput.setCustomValidity('');
  llm = { provider: providerSelect.value, model };
  saveLlmChoice();
  if (systemPromptInput) appStore.set('settings.persona.systemPrompt', systemPromptInput.value.trim().slice(0, 4000));
  updateProviderBadge();
  updateQuickstart();
  connectionLabel.classList.remove('error-note');
  connectionLabel.textContent = 'YOUR TURN';
  closeSettings();
});
providerSelect.addEventListener('change', () => {
  modelInput.value = providerModel(providerSelect.value);
  updateProviderDetail();
});
modelInput.addEventListener('input', () => modelInput.setCustomValidity(''));
dialog.addEventListener('click', (event) => { if (event.target === dialog) closeSettings(); });

async function sendMessage(text, { appendUser = true } = {}) {
  const content = appendUser ? String(text || '').trim() : String(messages.at(-1)?.content || '').trim();
  if (!content || isSending) return;
  stopSpeech();
  if (!llm.provider) {
    openSettings();
    connectionLabel.textContent = 'CHOOSE A MODEL TO BEGIN';
    return;
  }
  setSending(true);
  if (appendUser) {
    compactConversationIfNeeded();
    messages.push({ role: 'user', content });
    messages = messages.slice(-MAX_HISTORY);
    saveMessages();
    render();
    input.value = '';
    input.style.height = 'auto';
  }
  const localContext = findLocalWorkspaceContext(content);
  if (localContextStatus) localContextStatus.textContent = localContext.count ? `LOCAL NOTES · ${localContext.count}` : 'NO LOCAL NOTE MATCH';
  const localCredentialEnabled = Boolean(appStore.get('settings.security.pinHash', '') || appStore.get('settings.security.biometricId', ''));
  const protectedMemory = (localCredentialEnabled || appStore.get('settings.security.protectInbox', false)) && sessionStorage.getItem('vesper-unlocked-v1') !== '1';
  const memoryContext = protectedMemory ? '' : relationshipMemory.relevantContext(content);

  const typing = makeMessage('assistant', '···', 'typing');
  messagesEl.append(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  let replyToRead = null;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.slice(-MAX_HISTORY), provider: llm.provider, model: llm.model, personality: personalityMode, systemPrompt: loadPersonaInstructions(content), localContext: localContext.text, memoryContext, conversationSummary, visionFrame: pendingVisionFrame ? { mediaType: pendingVisionFrame.mediaType, data: pendingVisionFrame.data } : null }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      openAccessDialog();
      const error = new Error('Unlock Vesper, then send your message again.');
      error.requiresLogin = true;
      throw error;
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('The model returned an empty reply. Try again.');
    messages.push({ role: 'assistant', content: data.reply.trim() });
    messages = messages.slice(-MAX_HISTORY);
    saveMessages();
    reactToAssistantReply(data.reply.trim(), content);
    clearVisionFrame();
    if (appendUser && !protectedMemory) void relationshipMemory.rememberExchange(content).catch(() => {});
    replyToRead = data.reply.trim();
  } catch (error) {
    if (!error.requiresLogin) {
      messages.push({ role: 'assistant', content: `Tch, something got in the way, senpai: ${error.message}` });
      messages = messages.slice(-MAX_HISTORY);
      saveMessages();
      connectionLabel.textContent = 'CHECK MODEL SETTINGS';
      connectionLabel.classList.add('error-note');
      window.setTimeout(() => connectionLabel.classList.remove('error-note'), 3500);
      showToast(error.message || 'The chat request failed.', 'error');
    }
  } finally {
    setSending(false);
    render();
    if (replyToRead && autoSpeak.checked) {
      const speakButton = [...messagesEl.querySelectorAll('.message.assistant .speak-button')].at(-1);
      if (speakButton) speakReply(replyToRead, speakButton);
    }
    input.focus();
  }
}

function reactToAssistantReply(reply, userText = '') {
  const text = `${userText} ${reply}`.toLowerCase();
  let mood = 'neutral';
  let expression = 'neutral';
  let gesture = '';
  if (/\b(hello|hi there|hey there|welcome back)\b/.test(text)) gesture = 'wave';
  else if (/\b(thank you|thanks|appreciate|congratulations|congrats|proud of you)\b/.test(text)) { mood = 'joy'; expression = 'joy'; gesture = 'bow'; }
  else if (/\b(let's dance|dance with me|celebrate|we did it)\b/.test(text)) { mood = 'joy'; expression = 'fun'; gesture = 'dance'; }
  else if (/\b(i agree|exactly|you're right|yes, that is right)\b/.test(text)) gesture = 'nod';
  else if (/\b(i don't know|maybe|not sure|it depends)\b/.test(text)) gesture = 'shrug';
  else if (/\b(i care about you|i'm here for you|you matter|that sounds painful|i'm sorry)\b/.test(text)) { mood = 'tender'; expression = 'soft'; }
  else if (/\b(let me think|thinking through|on reflection|considering this)\b/.test(text)) { mood = 'thinking'; expression = 'thinking'; gesture = 'thinking'; }
  else if (/\b(that's difficult|that sounds hard|grief|i understand this hurts)\b/.test(text)) { mood = 'sad'; expression = 'soft'; }
  window.setAvatarMood?.(mood);
  window.setAvatarExpression?.(expression);
  if (gesture) window.playAvatarGesture?.(gesture, 1800);
}

window.addEventListener('avatar-touch', (event) => {
  const { emoji = '✨', line = 'Vesper noticed your touch.' } = event.detail || {};
  showToast(`${emoji} ${line}`, 'success', { timeout: 2200 });
});

form.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  voiceInput.disabled = true;
  voiceInput.title = 'Speech input is not available in this browser';
} else {
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
  voiceInput.addEventListener('click', () => { if (voiceInput.classList.contains('is-listening')) recognition.stop(); else recognition.start(); });
  recognition.onstart = () => { voiceInput.classList.add('is-listening'); voiceInput.setAttribute('aria-label', 'Stop listening'); voiceInput.title = 'Stop listening'; connectionLabel.textContent = 'LISTENING…'; window.setAvatarPerformance?.('listen'); };
  recognition.onresult = (event) => { input.value = event.results[0][0].transcript; input.dispatchEvent(new Event('input')); form.requestSubmit(); };
  recognition.onerror = () => { connectionLabel.textContent = 'MICROPHONE NOT READY'; };
  recognition.onend = () => { voiceInput.classList.remove('is-listening'); voiceInput.setAttribute('aria-label', 'Speak to Vesper'); voiceInput.title = 'Speak to Vesper'; if (!isSending) connectionLabel.textContent = 'YOUR TURN'; };
}
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => sendMessage(button.textContent)));

document.querySelector('#clear-chat').addEventListener('click', () => {
  if (isSending) return;
  stopSpeech();
  messages = [];
  conversationSummary = '';
  appStore.set('session.summary', '');
  saveMessages();
  render();
  input.focus();
});

function currentWorkspaceSnapshot() {
  const snapshot = workspaceSnapshot({ messages, settings: { llm, voice: voiceSettings, personality: personalityMode, persona: { systemPrompt: loadSystemPrompt(), card: appStore.get('settings.persona.card', null) }, stage: stageSettings, theme: appStore.get('settings.theme', 'omarchy-quattro') }, route: location.pathname });
  snapshot.conversationSummary = conversationSummary;
  snapshot.branches = conversationBranches.map((branch) => ({ ...branch, messages: branch.messages.map((message) => ({ ...message })) }));
  return snapshot;
}
function exportWorkspace(format = 'md') {
  const snapshot = currentWorkspaceSnapshot(); const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') downloadText(`vesper-workspace-${stamp}.json`, JSON.stringify(snapshot, null, 2), 'application/json;charset=utf-8');
  else if (format === 'csv') downloadText(`vesper-messages-${stamp}.csv`, toCsv(snapshot), 'text/csv;charset=utf-8');
  else downloadText(`vesper-transcript-${stamp}.md`, toMarkdown(snapshot), 'text/markdown;charset=utf-8');
  commandStatus.textContent = `${format.toUpperCase()} EXPORT READY · LOCAL FILE`;
  showToast(`${format.toUpperCase()} export downloaded.`, 'success');
}
async function shareWorkspace() {
  const summary = shareSummary(currentWorkspaceSnapshot());
  try {
    if (navigator.share) await navigator.share({ title: 'Vesper conversation', text: summary });
    else await copyText(summary);
    showToast(navigator.share ? 'Share sheet opened.' : 'Share summary copied to the clipboard.', 'success');
  } catch (error) { if (error?.name !== 'AbortError') { showToast('Could not share the summary. Try copying it instead.', 'warning'); } }
}
exportChat.addEventListener('click', () => exportWorkspace('md'));
document.querySelector('#share-chat')?.addEventListener('click', shareWorkspace);
chatSearch.addEventListener('input', () => { chatFilter = chatSearch.value.trim().toLowerCase(); render(); });

function openCommandPalette() {
  if (typeof commandDialog.showModal === 'function') commandDialog.showModal(); else commandDialog.setAttribute('open', '');
  commandSearch.value = ''; commandList.querySelectorAll('button').forEach((button) => { button.hidden = false; });
  window.setTimeout(() => commandSearch.focus(), 0);
}
function closeCommandPalette() { if (typeof commandDialog.close === 'function' && commandDialog.open) commandDialog.close(); else commandDialog.removeAttribute('open'); }
async function runHealthCheck() {
  commandStatus.textContent = 'CHECKING LOCAL SYSTEM…';
  try {
    const [healthResponse, settingsResponse] = await Promise.all([safeFetch('/api/health', { cache: 'no-store' }, 'Health check'), safeFetch('/api/settings', { cache: 'no-store' }, 'Settings check')]);
    const settings = await settingsResponse.json(); const ollama = settings.providers?.ollama;
    commandStatus.textContent = healthResponse.ok && ollama?.models?.length ? `READY · OLLAMA · ${ollama.models.length} MODEL${ollama.models.length === 1 ? '' : 'S'} · AVATAR ${document.querySelector('#stage-status').textContent}` : 'ACTION NEEDED · OPEN LLM SETTINGS TO CHECK OLLAMA';
  } catch { commandStatus.textContent = 'LOCAL SERVER CHECK FAILED · RESTART VESPER'; }
}
function runCommand(name) {
  if (name === 'focus') { closeCommandPalette(); input.focus(); }
  else if (name === 'export' || name === 'export-md') exportWorkspace('md');
  else if (name === 'export-json') exportWorkspace('json');
  else if (name === 'export-csv') exportWorkspace('csv');
  else if (name === 'share') shareWorkspace();
  else if (name === 'health') runHealthCheck();
  else if (name === 'model') { closeCommandPalette(); modelOnlyOpen?.click(); }
  else if (name === 'clear') { messages = []; saveMessages(); render(); commandStatus.textContent = 'CONVERSATION CLEARED'; }
}
commandOpen.addEventListener('click', openCommandPalette); commandClose.addEventListener('click', closeCommandPalette);
commandDialog.addEventListener('click', (event) => { if (event.target === commandDialog) closeCommandPalette(); });
commandList.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => runCommand(button.dataset.command)));
commandSearch.addEventListener('input', () => { const query = commandSearch.value.trim().toLowerCase(); commandList.querySelectorAll('button').forEach((button) => { button.hidden = query && !button.textContent.toLowerCase().includes(query); }); });
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommandPalette(); }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 's') { event.preventDefault(); shareWorkspace(); }
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); exportWorkspace('md'); }
  if (event.key === 'Escape' && (commandDialog.open || commandDialog.hasAttribute('open'))) closeCommandPalette();
});

document.querySelectorAll('[data-expression]').forEach((button) => {
  button.addEventListener('click', () => {
    if (window.setAvatarExpression?.(button.dataset.expression) === false) return;
    document.querySelectorAll('[data-expression]').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
  });
});
document.querySelectorAll('[data-background]').forEach((button) => button.addEventListener('click', () => applyBackground(button.dataset.background)));

const performanceStatus = document.querySelector('#performance-status');
document.querySelectorAll('[data-performance]').forEach((button) => {
  button.addEventListener('click', () => {
    const performance = button.dataset.performance;
    document.querySelectorAll('[data-performance]').forEach((option) => option.classList.toggle('is-active', option === button && performance !== 'reset'));
    const labels = { wave: 'WAVING / HELLO, SENPAI', blush: 'BLUSHING / SHY MODE', listen: 'LISTENING / SOFT FOCUS', auto: 'AUTO REACT / SPEAK + BLUSH', reset: 'IDLE / READY' };
    performanceStatus.textContent = labels[performance] || labels.reset;
    if (performance === 'auto') window.setAvatarAutoPerformance?.(true);
    else if (performance === 'reset') { window.setAvatarAutoPerformance?.(false); window.setAvatarPerformance?.('reset'); }
    else window.setAvatarPerformance?.(performance);
    window.setTimeout(() => { if (!['listen', 'auto'].includes(performance)) { performanceStatus.textContent = 'IDLE / READY'; button.classList.remove('is-active'); } }, performance === 'blush' ? 2600 : 1800);
  });
});
document.querySelectorAll('[data-pose]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-pose]').forEach((option) => option.classList.toggle('is-active', option === button));
  window.playAvatarGesture?.(button.dataset.pose, 2400);
  performanceStatus.textContent = `${button.dataset.pose.toUpperCase()} / NATURAL POSE`;
  window.setTimeout(() => { button.classList.remove('is-active'); performanceStatus.textContent = 'IDLE / READY'; }, 2200);
}));

window.addEventListener('avatar-ready', (event) => {
  window.setAvatarZoom?.(stageSettings.zoom);
  window.setAvatarAutoRotate?.(stageSettings.orbit);
  window.setAvatarPersonality?.(personalityMode);
  availableWardrobeLayers = event.detail?.wardrobeLayers || [];
  window.setAvatarTint?.(avatarCustomization.tint);
  window.setAvatarParticles?.(avatarCustomization.particles);
  renderWardrobeLayers(availableWardrobeLayers);
  const supported = new Set(event.detail?.expressions || []);
  unavailableVisemes = event.detail?.missingVisemes || [];
  refreshVoiceList();
  document.querySelectorAll('[data-expression]').forEach((button) => {
    if (supported.has(button.dataset.expression)) return;
    button.disabled = true;
    button.title = `This avatar does not include the ${button.textContent.toLowerCase()} expression.`;
  });
});

const modelFolderButton = document.querySelector('#open-model-folder');
modelFolderButton.addEventListener('click', async () => {
  const label = modelFolderButton.querySelector('span');
  const original = label.textContent;
  label.textContent = 'OPENING FOLDER…';
  modelFolderButton.disabled = true;
  try {
    const response = await safeFetch('/api/open-model-folder', { method: 'POST' }, 'Open model folder');
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not open the folder.');
    label.textContent = 'FOLDER OPENED';
  } catch { label.textContent = 'OPEN IT IN DOWNLOADS'; }
  finally {
    window.setTimeout(() => { label.textContent = original; modelFolderButton.disabled = false; }, 2200);
  }
});

async function loadProviderSettings() {
  try {
    await refreshProviderSettings();
    providerSelect.value = llm.provider;
    updateProviderDetail();
    updateQuickstart();
  } catch {
    serverSettings = null;
    if (!llm.provider) llm = { provider: 'ollama', model: 'llama3.2' };
    updateProviderBadge();
    updateQuickstart();
  }
}

async function refreshProviderSettings() {
    const response = await safeFetch('/api/settings', { cache: 'no-store' }, 'Provider settings request');
  if (!response.ok) throw new Error('Settings unavailable');
  serverSettings = await response.json();
  if (!llm.provider) llm.provider = serverSettings.defaultProvider || 'ollama';
  if (!llm.model) llm.model = providerModel(llm.provider);
  updateProviderBadge();
  saveLlmChoice();
  updateQuickstart();
}

render();
initializeAccess();
appStore.ready.then(() => {
  messages = loadMessages();
  conversationBranches = loadConversationBranches();
  conversationSummary = String(appStore.get('session.summary', '') || '').slice(0, 2600);
  const card = appStore.get('settings.persona.card', null);
  if (card && characterCardStatus) characterCardStatus.textContent = 'Loaded ' + card.name + (card.character_book ? ' · lorebook ready' : '');
  refreshConversationBranches();
  const savedAvatar = appStore.get('settings.avatar', {});
  avatarCustomization = {
    tint: typeof savedAvatar.tint === 'string' && /^#[0-9a-f]{6}$/i.test(savedAvatar.tint) ? savedAvatar.tint : '#ffffff',
    particles: savedAvatar.particles !== false,
    layers: savedAvatar.layers && typeof savedAvatar.layers === 'object' ? savedAvatar.layers : {},
  };
  avatarTintInput.value = avatarCustomization.tint;
  avatarParticlesInput.checked = avatarCustomization.particles;
  window.setAvatarTint?.(avatarCustomization.tint);
  window.setAvatarParticles?.(avatarCustomization.particles);
  if (availableWardrobeLayers.length) renderWardrobeLayers(availableWardrobeLayers);
  llm = loadLlmChoice();
  personalityMode = loadPersonalityMode();
  stageSettings = loadStageSettings();
  applyBackground(appStore.get('settings.background', 'atelier'));
  applyTheme(appStore.get('settings.theme', 'omarchy-quattro'));
  render();
  showToast('Your saved Vesper session was restored.', 'success', { timeout: 2600 });
}).catch(() => {});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}), { once: true });
}
