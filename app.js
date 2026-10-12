import { appStore } from './persistence.js';
import { initGlobalFeedback, safeFetch, showToast } from './feedback.js';
import { initThemeProvider } from './theme-provider.js';
import { copyText, downloadText, shareSummary, toCsv, toMarkdown, workspaceSnapshot } from './export-utils.js';
import { initDialogAccessibility } from './a11y.js';
import { initOfflineSync } from './offline-sync.js';
import { initSecurityLock } from './security-lock.js';

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
const exportChat = document.querySelector('#export-chat');
const commandOpen = document.querySelector('#command-open');
const commandDialog = document.querySelector('#command-dialog');
const commandClose = document.querySelector('#command-close');
const commandSearch = document.querySelector('#command-search');
const commandList = document.querySelector('#command-list');
const commandStatus = document.querySelector('#command-status');
const quickCaptureOpen = document.querySelector('#quick-capture-open');
const STORAGE_KEY = 'vesper-chat-v1';
const THEME_KEY = 'vesper-theme-v3';
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
const VOICE_PROFILE = { rate: 0.99, pitch: 1.16, label: 'BRIGHT ANIME DUB' };
const THEMES = [
  { id: 'sakura', name: 'Sakura Senpai' }, { id: 'mica', name: 'Mica Night' },
  { id: 'velvet', name: 'Velvet' },
  { id: 'petal', name: 'Petal' },
  { id: 'moonstone', name: 'Moonstone' },
  { id: 'jade', name: 'Jade' },
  { id: 'riko', name: 'Riko Atelier' },
  { id: 'portrait', name: 'Portrait Stage' },
];
const PERSONALITY_MODES = {
  playful: { description: 'Playful · quick-witted warmth' },
  tender: { description: 'Tender · gentle affection' },
  thoughtful: { description: 'Thoughtful · curious reflection' },
};
const PERSONALITY_EXPRESSIONS = { playful: 'smirk', tender: 'fond', thoughtful: 'thinking' };
const PROVIDER_COPY = {
  ollama: 'Runs on this computer through Ollama. Install Ollama and a model first; chat messages stay local.',
  openai: 'Uses the OpenAI API. Your recent chat messages are sent to OpenAI with the key stored in .env.',
  compatible: 'Uses a compatible chat-completions endpoint. Configure its base URL and optional key in .env.',
};

let messages = loadMessages();
let isSending = false;
let llm = loadLlmChoice();
let serverSettings = null;
let activeUtterance = null;
let activeSpeakButton = null;
let activeSpeechFallbackTimer = null;
let voiceSettings = loadVoiceSettings();
let stageSettings = loadStageSettings();
let personalityMode = loadPersonalityMode();
let preferredWaifuVoice = null;
let chatFilter = '';
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
    ? `${voiceSettings.language === 'ja' ? 'JAPANESE' : 'ENGLISH'} ANIME DUB · WORD-TIMED LIP SYNC READY`
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
    return { provider: ['ollama', 'openai', 'compatible'].includes(saved.provider) ? saved.provider : '', model: typeof saved.model === 'string' ? saved.model : '' };
  } catch { return { provider: '', model: '' }; }
}

function saveLlmChoice() {
  appStore.set('settings.llm', llm);
}

function saveMessages() {
  appStore.set('session.messages', messages.slice(-MAX_HISTORY));
}

function loadPersonalityMode() {
  try {
    const saved = appStore.get('settings.personality', 'playful');
    return Object.hasOwn(PERSONALITY_MODES, saved) ? saved : 'playful';
  } catch { return 'playful'; }
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
  document.body.dataset.theme = selected.id;
  themeName.textContent = selected.name.toUpperCase();
  themeSwatch.className = `theme-swatch ${selected.id}-dot`;
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.themeOption === selected.id));
  });
  appStore.set('settings.theme', selected.id);
}

function closeThemeMenu() {
  themeMenu.hidden = true;
  themeToggle.setAttribute('aria-expanded', 'false');
}

applyTheme(appStore.get('settings.theme', 'sakura'));

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
  if ('speechSynthesis' in window && activeUtterance) {
    activeUtterance.onend = null;
    activeUtterance.onerror = null;
    window.speechSynthesis.cancel();
  }
  if (activeSpeechFallbackTimer) window.clearInterval(activeSpeechFallbackTimer);
  activeSpeechFallbackTimer = null;
  activeUtterance = null;
  if (activeSpeakButton) {
    activeSpeakButton.textContent = '▶';
    activeSpeakButton.title = 'Read this reply aloud';
    activeSpeakButton.setAttribute('aria-label', 'Read this reply aloud');
  }
  activeSpeakButton = null;
  window.setAvatarSpeaking?.(false);
  if (voiceStatus) voiceStatus.textContent = voiceSelect.disabled
    ? 'SYSTEM SPEECH IS NOT AVAILABLE IN THIS BROWSER'
    : preferredWaifuVoice
      ? 'VOICE READY · WORD-TIMED LIP SYNC'
      : 'NO SYSTEM VOICE FOUND · ADD A WINDOWS SPEECH VOICE';
  setPresence(isSending ? 'thinking' : 'idle');
}

function speakReply(text, button) {
  if (!('speechSynthesis' in window)) return;
  if (activeSpeakButton === button) { stopSpeech(); return; }
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  const punctuation = text.trim().at(-1);
  utterance.lang = preferredWaifuVoice?.lang || (voiceSettings.language === 'ja' ? 'ja-JP' : 'en-US');
  utterance.rate = Number(speechRate.value) * (punctuation === '!' ? 1.03 : 1);
  utterance.pitch = Number(speechPitch.value) + (punctuation === '!' ? 0.04 : punctuation === '?' ? 0.02 : 0);
  if (preferredWaifuVoice) utterance.voice = preferredWaifuVoice;
  activeUtterance = utterance;
  activeSpeakButton = button;
  let boundarySeen = false;
  let fallbackIndex = 0;
  const fallbackWords = text.match(/\S+/g) || [text];
  button.textContent = '■';
  button.title = 'Stop reading';
  button.setAttribute('aria-label', 'Stop reading');
  utterance.onstart = () => {
    if (activeUtterance !== utterance) return;
    window.setAvatarSpeaking?.(true);
    window.setAvatarSpeechWord?.(fallbackWords[0], '');
    activeSpeechFallbackTimer = window.setInterval(() => { if (!boundarySeen) { const word = fallbackWords[Math.min(++fallbackIndex, fallbackWords.length - 1)]; window.setAvatarSpeechWord?.(word, /[!?]$/.test(word) ? word.slice(-1) : ''); } }, Math.max(180, 60000 / (150 * Number(utterance.rate || 1))));
    voiceStatus.textContent = 'VESPER IS SPEAKING · LIP SYNC ACTIVE';
    setPresence('speaking');
  };
  utterance.onboundary = (event) => {
    boundarySeen = true;
    if (activeSpeechFallbackTimer) { window.clearInterval(activeSpeechFallbackTimer); activeSpeechFallbackTimer = null; }
    const start = event.charIndex || 0;
    const end = start + Math.max(event.charLength || 1, 1);
    const word = text.slice(start, end) || text.slice(start).split(/\s+/)[0];
    window.setAvatarSpeechWord?.(word, text.slice(end, end + 4));
  };
  const finish = () => { if (activeSpeechFallbackTimer) window.clearInterval(activeSpeechFallbackTimer); activeSpeechFallbackTimer = null; if (activeUtterance === utterance) stopSpeech(); };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
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
  bubble.textContent = content;
  messageContent.append(bubble);
  row.append(avatar, messageContent);
  if (!extraClass) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
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

function setSending(sending) {
  isSending = sending;
  sendButton.disabled = sending;
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
  const names = { ollama: 'LOCAL', openai: 'OPENAI', compatible: 'CUSTOM API' };
  const model = llm.model || providerModel(llm.provider);
  providerBadge.textContent = llm.provider ? `${names[llm.provider]} · ${model}` : 'CHOOSE A MODEL';
  providerBadge.title = llm.provider ? `Selected model: ${model}` : 'Open LLM settings to choose a model';
}

function providerInfo(provider) { return serverSettings?.providers?.[provider] || null; }

function providerModel(provider) { return providerInfo(provider)?.model || ({ ollama: 'llama3.2', openai: 'gpt-4.1-mini', compatible: 'local-model' }[provider]); }

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
    : provider === 'openai'
      ? (isReady ? 'API key is configured in .env' : 'API key is missing from .env')
      : (isReady ? 'API endpoint is configured in .env' : 'API base URL is missing from .env');
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

async function sendMessage(text) {
  const content = text.trim();
  if (!content || isSending) return;
  stopSpeech();
  if (!llm.provider) {
    openSettings();
    connectionLabel.textContent = 'CHOOSE A MODEL TO BEGIN';
    return;
  }
  messages.push({ role: 'user', content });
  messages = messages.slice(-MAX_HISTORY);
  saveMessages();
  render();
  input.value = '';
  input.style.height = 'auto';
  setSending(true);

  const typing = makeMessage('assistant', '···', 'typing');
  messagesEl.append(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  window.setAvatarSpeaking?.(false);
  let replyToRead = null;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.slice(-MAX_HISTORY), provider: llm.provider, model: llm.model, personality: personalityMode }),
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
  saveMessages();
  render();
  input.focus();
});

function currentWorkspaceSnapshot() { return workspaceSnapshot({ messages, settings: { llm, voice: voiceSettings, personality: personalityMode, stage: stageSettings, theme: appStore.get('settings.theme', 'sakura') }, route: location.pathname }); }
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
  window.setAvatarPose?.(button.dataset.pose, 0.45);
  performanceStatus.textContent = `${button.dataset.pose.toUpperCase()} / NATURAL POSE`;
  window.setTimeout(() => { button.classList.remove('is-active'); performanceStatus.textContent = 'IDLE / READY'; }, 2200);
}));

window.addEventListener('avatar-ready', (event) => {
  window.setAvatarZoom?.(stageSettings.zoom);
  window.setAvatarAutoRotate?.(stageSettings.orbit);
  window.setAvatarPersonality?.(personalityMode);
  const supported = new Set(event.detail?.expressions || []);
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
  llm = loadLlmChoice();
  personalityMode = loadPersonalityMode();
  stageSettings = loadStageSettings();
  applyBackground(appStore.get('settings.background', 'atelier'));
  applyTheme(appStore.get('settings.theme', 'sakura'));
  render();
  showToast('Your saved Vesper session was restored.', 'success', { timeout: 2600 });
}).catch(() => {});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}), { once: true });
}
