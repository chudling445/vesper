import { appStore } from './persistence.js';
import { migrateLegacyVoiceSettings } from './voice-selection.mjs';

const voiceSelect = document.querySelector('#voice-list');
const filter = document.querySelector('#lang-filter');
const pitch = document.querySelector('#lab-pitch');
const rate = document.querySelector('#lab-rate');
const pitchValue = document.querySelector('#lab-pitch-value');
const rateValue = document.querySelector('#lab-rate-value');
const sample = document.querySelector('#lab-sample');
const status = document.querySelector('#lab-status');
const LEGACY_STORAGE_KEY = 'vesper-voice-v1';
let voices = [];
let selectedVoice = '';
let selectedLanguage = 'en';

function loadSettings() {
  let saved = appStore.get('settings.voice', {});
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '{}');
    const migrated = migrateLegacyVoiceSettings(saved, legacy);
    if (migrated.voiceURI !== saved.voiceURI) appStore.set('settings.voice', migrated);
    saved = migrated;
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch { /* The shared store remains authoritative if legacy data is unreadable. */ }
  selectedVoice = typeof saved.voiceURI === 'string' ? saved.voiceURI : '';
  selectedLanguage = saved.language === 'ja' ? 'ja' : 'en';
  pitch.value = Number.isFinite(saved.pitch) ? Math.min(1.4, Math.max(0.7, saved.pitch)) : 1.12;
  rate.value = Number.isFinite(saved.rate) ? Math.min(1.3, Math.max(0.7, saved.rate)) : 0.94;
  pitchValue.value = `${Number(pitch.value).toFixed(2)}×`;
  rateValue.value = `${Number(rate.value).toFixed(2)}×`;
}
function saveSettings() {
  appStore.set('settings.voice', {
    ...appStore.get('settings.voice', {}),
    voiceURI: selectedVoice,
    language: selectedLanguage,
    pitch: Number(pitch.value),
    rate: Number(rate.value),
  });
}
function matches(lang, voice) { return lang === 'all' || voice.lang.toLowerCase().startsWith(lang); }
function preferred(lang) { return voices.filter((voice) => matches(lang, voice)).sort((a, b) => Number(/female|zira|samantha|aria|nanami|haruka/i.test(b.name)) - Number(/female|zira|samantha|aria|nanami|haruka/i.test(a.name)))[0]; }
function speak(text, lang = 'en') {
  if (!('speechSynthesis' in window)) { status.textContent = 'Speech is not available in this browser.'; return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text); const savedVoice = voices.find((item) => item.voiceURI === selectedVoice && item.lang.toLowerCase().startsWith(lang)); const voice = savedVoice || preferred(lang);
  if (voice) utterance.voice = voice; utterance.lang = voice?.lang || (lang === 'ja' ? 'ja-JP' : 'en-US'); utterance.rate = Number(rate.value); utterance.pitch = Number(pitch.value);
  utterance.onstart = () => { status.textContent = `SPEAKING · ${voice?.name || 'SYSTEM DEFAULT'}`; };
  utterance.onend = () => { status.textContent = 'READY'; };
  window.speechSynthesis.speak(utterance);
}
function renderList() {
  if (!voiceSelect) return;
  voiceSelect.replaceChildren();
  const lang = filter.value;
  const visible = voices.filter((voice) => matches(lang, voice) && (voice.lang.toLowerCase().startsWith('en') || voice.lang.toLowerCase().startsWith('ja'))).sort((a, b) => {
    const preferredVoice = (voice) => /female|zira|samantha|aria|nanami|haruka/i.test(voice.name) ? 1 : 0;
    return preferredVoice(b) - preferredVoice(a) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name);
  });
  if (!visible.length) { voiceSelect.innerHTML = '<p class="fine-note">No matching system voices were found.</p>'; return; }
  for (const voice of visible) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'voice-list-item'; button.dataset.voice = voice.voiceURI;
    const details = document.createElement('span');
    const name = document.createElement('b'); name.textContent = voice.name;
    const metadata = document.createElement('small'); metadata.textContent = `${voice.lang}${voice.localService ? ' · installed' : ' · online'}`;
    const action = document.createElement('i'); action.textContent = 'USE';
    details.append(name, metadata); button.append(details, action);
    button.addEventListener('click', () => { selectedVoice = voice.voiceURI; selectedLanguage = voice.lang.toLowerCase().startsWith('ja') ? 'ja' : 'en'; saveSettings(); renderList(); status.textContent = `SELECTED · ${voice.name}`; });
    if (voice.voiceURI === selectedVoice) button.classList.add('is-selected'); voiceSelect.append(button);
  }
}
function refresh() {
  voices = 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
  const english = preferred('en'); const japanese = preferred('ja');
  document.querySelector('#preset-en-voice').textContent = english ? `Playful, energetic, teasing · ${english.name} · ${english.lang}` : 'No English voice found · install an English speech voice';
  document.querySelector('#preset-ja-voice').textContent = japanese ? `明るく元気で、いたずらっぽい · ${japanese.name} · ${japanese.lang}` : '日本語の音声が見つかりません · 日本語の音声を追加してください';
  renderList();
}
loadSettings(); refresh();
appStore.ready.then(() => { loadSettings(); refresh(); });
if ('speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', refresh);
filter.addEventListener('change', renderList);
pitch.addEventListener('input', () => { pitchValue.value = `${Number(pitch.value).toFixed(2)}×`; saveSettings(); });
rate.addEventListener('input', () => { rateValue.value = `${Number(rate.value).toFixed(2)}×`; saveSettings(); });
document.querySelectorAll('[data-preview]').forEach((button) => button.addEventListener('click', () => speak(button.dataset.preview === 'ja' ? '先輩、待っていたわけじゃないからね。' : sample.value, button.dataset.preview)));
document.querySelectorAll('[data-use]').forEach((button) => button.addEventListener('click', () => { selectedLanguage = button.dataset.use; const voice = preferred(selectedLanguage); if (voice) { selectedVoice = voice.voiceURI; saveSettings(); renderList(); status.textContent = `READY · ${voice.name} IS VESPER'S ${selectedLanguage === 'ja' ? 'JAPANESE' : 'ENGLISH'} VOICE`; } else { saveSettings(); status.textContent = `NO ${selectedLanguage === 'ja' ? 'JAPANESE' : 'ENGLISH'} VOICE FOUND`; } }));
document.querySelector('#lab-speak').addEventListener('click', () => speak(selectedLanguage === 'ja' ? '先輩、待っていたわけじゃないからね。' : sample.value, selectedLanguage));
document.querySelector('#lab-stop').addEventListener('click', () => { window.speechSynthesis?.cancel(); status.textContent = 'STOPPED'; });
