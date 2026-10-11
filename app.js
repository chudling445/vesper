const form = document.querySelector('#chat-form');
const input = document.querySelector('#message-input');
const messagesEl = document.querySelector('#messages');
const sendButton = document.querySelector('#send-button');
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
const STORAGE_KEY = 'vesper-chat-v1';
const THEME_KEY = 'vesper-theme-v3';
const PERSONALITY_KEY = 'vesper-personality-v1';
const LLM_KEY = 'vesper-llm-v1';
const VOICE_KEY = 'vesper-voice-v1';
const STAGE_KEY = 'vesper-stage-v2';
const MAX_HISTORY = 24;
const THEMES = [
  { id: 'sakura', name: 'Sakura Senpai' }, { id: 'mica', name: 'Mica Night' },
  { id: 'velvet', name: 'Velvet' },
  { id: 'petal', name: 'Petal' },
  { id: 'moonstone', name: 'Moonstone' },
  { id: 'jade', name: 'Jade' },
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
let voiceSettings = loadVoiceSettings();
let stageSettings = loadStageSettings();
let personalityMode = loadPersonalityMode();
const moodLabel = document.querySelector('.mood-mark span');

function setPresence(state) {
  const labels = { idle: 'HERE', thinking: 'THINKING', speaking: 'SPEAKING' };
  moodLabel.textContent = labels[state] || labels.idle;
  document.querySelector('.mood-mark').title = state === 'thinking' ? 'Vesper is thinking' : state === 'speaking' ? 'Vesper is speaking' : 'Vesper is here';
}

function loadStageSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STAGE_KEY) || localStorage.getItem('vesper-stage-v1') || '{}');
    const savedZoom = saved.zoom === 2.7 ? 2.15 : saved.zoom;
    return { zoom: Number.isFinite(savedZoom) ? Math.min(3.6, Math.max(1.8, savedZoom)) : 2.15, orbit: saved.orbit === true };
  } catch { return { zoom: 2.15, orbit: false }; }
}

function saveStageSettings() {
  try { localStorage.setItem(STAGE_KEY, JSON.stringify(stageSettings)); } catch { /* Keep the view settings for this page. */ }
}

function loadVoiceSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_KEY) || '{}');
    return {
      auto: saved.auto === true,
      voiceURI: typeof saved.voiceURI === 'string' ? saved.voiceURI : '',
      rate: Number.isFinite(saved.rate) ? Math.min(1.3, Math.max(0.7, saved.rate)) : 0.95,
      pitch: Number.isFinite(saved.pitch) ? Math.min(1.4, Math.max(0.7, saved.pitch)) : 1.05,
    };
  } catch { return { auto: false, voiceURI: '', rate: 0.95, pitch: 1.05 }; }
}

function saveVoiceSettings() {
  voiceSettings = { auto: autoSpeak.checked, voiceURI: voiceSelect.value, rate: Number(speechRate.value), pitch: Number(speechPitch.value) };
  try { localStorage.setItem(VOICE_KEY, JSON.stringify(voiceSettings)); } catch { /* Keep the current voice choices for this page. */ }
}

function refreshVoiceList() {
  if (!('speechSynthesis' in window)) {
    voiceSelect.disabled = true;
    autoSpeak.disabled = true;
    voiceStatus.textContent = 'SYSTEM SPEECH IS NOT AVAILABLE IN THIS BROWSER';
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  const selected = voiceSelect.value || voiceSettings.voiceURI;
  voiceSelect.replaceChildren(new Option('SYSTEM DEFAULT', ''));
  for (const voice of voices) {
    const option = new Option(`${voice.name} · ${voice.lang}`, voice.voiceURI);
    voiceSelect.add(option);
  }
  if (voices.some((voice) => voice.voiceURI === selected)) voiceSelect.value = selected;
  const hasVoices = voices.length > 0;
  voiceSelect.disabled = !hasVoices;
  autoSpeak.disabled = !hasVoices;
  voiceStatus.textContent = hasVoices
    ? `${voices.length} SYSTEM VOICE${voices.length === 1 ? '' : 'S'} · WORD-TIMED LIP SYNC`
    : 'NO SYSTEM VOICE FOUND · ADD A WINDOWS SPEECH VOICE';
}

function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-MAX_HISTORY) : [];
  } catch { return []; }
}

function loadLlmChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(LLM_KEY) || '{}');
    return { provider: ['ollama', 'openai', 'compatible'].includes(saved.provider) ? saved.provider : '', model: typeof saved.model === 'string' ? saved.model : '' };
  } catch { return { provider: '', model: '' }; }
}

function saveLlmChoice() {
  try { localStorage.setItem(LLM_KEY, JSON.stringify(llm)); } catch { /* Use this choice for the current page even if storage is disabled. */ }
}

function saveMessages() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY))); } catch { /* Chat remains available for this page. */ }
}

function loadPersonalityMode() {
  try {
    const saved = localStorage.getItem(PERSONALITY_KEY);
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
    try { localStorage.setItem(PERSONALITY_KEY, personalityMode); } catch { /* Keep the selected style for this page. */ }
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
  try { localStorage.setItem(THEME_KEY, selected.id); } catch { /* The visual theme still applies for this page. */ }
}

function closeThemeMenu() {
  themeMenu.hidden = true;
  themeToggle.setAttribute('aria-expanded', 'false');
}

try { applyTheme(localStorage.getItem(THEME_KEY) || 'sakura'); } catch { applyTheme('sakura'); }

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
    : voiceSelect.options.length > 1
      ? 'VOICE READY · WORD-TIMED LIP SYNC'
      : 'NO SYSTEM VOICE FOUND · ADD A WINDOWS SPEECH VOICE';
  setPresence(isSending ? 'thinking' : 'idle');
}

function speakReply(text, button) {
  if (!('speechSynthesis' in window)) return;
  if (activeSpeakButton === button) { stopSpeech(); return; }
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Number(speechRate.value);
  utterance.pitch = Number(speechPitch.value);
  const selectedVoice = window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === voiceSelect.value);
  if (selectedVoice) utterance.voice = selectedVoice;
  activeUtterance = utterance;
  activeSpeakButton = button;
  button.textContent = '■';
  button.title = 'Stop reading';
  button.setAttribute('aria-label', 'Stop reading');
  utterance.onstart = () => {
    if (activeUtterance !== utterance) return;
    window.setAvatarSpeaking?.(true);
    voiceStatus.textContent = 'VESPER IS SPEAKING · LIP SYNC ACTIVE';
    setPresence('speaking');
  };
  utterance.onboundary = (event) => {
    const start = event.charIndex || 0;
    const end = start + Math.max(event.charLength || 1, 1);
    const word = text.slice(start, end);
    window.setAvatarSpeechWord?.(word, text.slice(end, end + 4));
  };
  const finish = () => { if (activeUtterance === utterance) stopSpeech(); };
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
voiceSelect.addEventListener('change', saveVoiceSettings);
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

function makeMessage(role, content, extraClass = '') {
  const row = document.createElement('div');
  row.className = `message ${role}${extraClass ? ` ${extraClass}` : ''}`;
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
  if (role === 'assistant' && !extraClass) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    if ('speechSynthesis' in window) {
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
    for (const message of messages) messagesEl.append(makeMessage(message.role, message.content));
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
    const response = await fetch('/api/auth', { cache: 'no-store' });
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
    const response = await fetch('/api/login', {
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
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
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
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => sendMessage(button.textContent)));

document.querySelector('#clear-chat').addEventListener('click', () => {
  if (isSending) return;
  stopSpeech();
  messages = [];
  saveMessages();
  render();
  input.focus();
});

document.querySelectorAll('[data-expression]').forEach((button) => {
  button.addEventListener('click', () => {
    if (window.setAvatarExpression?.(button.dataset.expression) === false) return;
    document.querySelectorAll('[data-expression]').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
  });
});

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
    const response = await fetch('/api/open-model-folder', { method: 'POST' });
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
  const response = await fetch('/api/settings', { cache: 'no-store' });
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
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}), { once: true });
}
