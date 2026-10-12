// Shared voice helpers for Vesper: used by the chat page, the Voices page and the Arcade.
export const VOICE_KEY = 'vesper-voice-v1';

export const WAIFU_PRESETS = {
  en: { lang: 'en', pitch: 1.3, rate: 1.04, prefer: [/aria/i, /jenny/i, /\bana\b/i, /sonia/i, /michelle/i, /libby/i, /maisie/i, /zira/i, /hazel/i, /susan/i, /samantha/i, /karen/i, /female/i] },
  ja: { lang: 'ja', pitch: 1.3, rate: 1.05, prefer: [/nanami/i, /haruka/i, /ayumi/i, /sayaka/i, /mayu/i, /shiori/i, /female/i] },
};

const MALE = /\b(david|mark|guy|ryan|george|james|richard|brian|andrew|eric|steffan|roger|christopher|davis|keita|ichiro|ryo|daichi|naoki|takumi|male)\b/i;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function loadVoicePrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_KEY) || '{}');
    const hasStyle = saved.style === 'waifu' || saved.style === 'custom';
    const language = ['en', 'ja', 'mix'].includes(saved.language) ? saved.language : 'en';
    const preset = WAIFU_PRESETS[language === 'ja' ? 'ja' : 'en'];
    return {
      auto: saved.auto === true,
      voiceURI: typeof saved.voiceURI === 'string' ? saved.voiceURI : '',
      style: saved.style === 'custom' ? 'custom' : 'waifu',
      language,
      rate: hasStyle && Number.isFinite(saved.rate) ? clamp(saved.rate, 0.7, 1.3) : preset.rate,
      pitch: hasStyle && Number.isFinite(saved.pitch) ? clamp(saved.pitch, 0.7, 1.6) : preset.pitch,
    };
  } catch {
    return { auto: false, voiceURI: '', style: 'waifu', language: 'en', rate: 1.04, pitch: 1.3 };
  }
}

export function saveVoicePrefs(prefs) {
  try { localStorage.setItem(VOICE_KEY, JSON.stringify(prefs)); } catch { /* Keep the choices for this page only. */ }
}

export function getVoices() {
  return 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
}

// Picks the most "waifu" sounding installed voice: female, natural/online first, in the wanted language.
export function pickWaifuVoice(lang) {
  const preset = WAIFU_PRESETS[lang === 'ja' ? 'ja' : 'en'];
  const matching = getVoices().filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith(preset.lang));
  if (!matching.length) return null;
  const notMale = matching.filter((voice) => !MALE.test(voice.name));
  const base = notMale.length ? notMale : matching;
  const natural = base.filter((voice) => /natural|online/i.test(voice.name));
  const pool = natural.length ? natural : base;
  for (const pattern of preset.prefer) {
    const hit = pool.find((voice) => pattern.test(voice.name));
    if (hit) return hit;
  }
  return pool[0];
}

export function describeVoice(lang) {
  const voice = pickWaifuVoice(lang);
  return voice ? `${voice.name} (${voice.lang})` : null;
}

export function isMostlyJapanese(text) {
  const value = String(text || '');
  const japanese = (value.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  return japanese > 0 && japanese >= latin * 0.5;
}

// The avatar's mouth is driven by vowels, so Japanese kana are mapped to their vowel sound.
const KANA_VOWELS = new Map();
const addRow = (chars, vowels) => [...chars].forEach((char, index) => KANA_VOWELS.set(char, vowels[index]));
['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'らりるれろ', 'がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ'].forEach((row) => addRow(row, 'aiueo'));
addRow('やゆよ', 'auo'); addRow('ゃゅょ', 'auo'); addRow('わをん', 'aou'); addRow('っー', 'uo');

export function toMouthWord(word) {
  const value = String(word || '');
  if (!/[\u3040-\u30ff\u4e00-\u9fff]/.test(value)) return value;
  for (const char of value) {
    const code = char.codePointAt(0);
    const hira = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
    const vowel = KANA_VOWELS.get(hira) || (/[\u4e00-\u9fff]/.test(char) ? 'a' : '');
    if (vowel) return vowel;
  }
  return 'a';
}

// Speaks a short line with the saved waifu settings (used by the Arcade and the Voice Lab).
export function speakWaifu(text, { onEnd, forceLang } = {}) {
  if (!('speechSynthesis' in window)) return false;
  const prefs = loadVoicePrefs();
  const lang = forceLang || (isMostlyJapanese(text) ? 'ja' : 'en');
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = prefs.style === 'waifu'
    ? pickWaifuVoice(lang)
    : getVoices().find((item) => item.voiceURI === prefs.voiceURI) || pickWaifuVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || (lang === 'ja' ? 'ja-JP' : 'en-US');
  utterance.pitch = prefs.pitch;
  utterance.rate = prefs.rate;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}
