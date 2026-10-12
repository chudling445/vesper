import { audioVisemeManager } from './audio-viseme-manager.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

/** SpeechSynthesis adapter with boundary visemes and a timer fallback for browsers without boundaries. */
export class WaifuVoiceController {
  constructor({ visemes = audioVisemeManager, pitch = 1.4, rate = 1.1, closeDelay = 220 } = {}) {
    this.visemes = visemes;
    this.pitch = pitch;
    this.rate = rate;
    this.closeDelay = closeDelay;
    this.utterance = null;
    this.fallbackTimer = 0;
    this.closeTimer = 0;
    this.generation = 0;
  }

  get supported() { return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'; }
  get speaking() { return Boolean(this.utterance); }

  speak(text, { voice = null, language = 'en-US', pitch = this.pitch, rate = this.rate, onStart, onBoundary, onEnd, onError } = {}) {
    if (!this.supported) return null;
    const content = String(text || '').trim();
    if (!content) return null;
    this.cancel();
    const generation = ++this.generation;
    const utterance = new window.SpeechSynthesisUtterance(content);
    utterance.voice = voice || null;
    utterance.lang = voice?.lang || language;
    utterance.pitch = clamp(pitch, 0.5, 2);
    utterance.rate = clamp(rate, 0.5, 2);
    this.utterance = utterance;
    let lastBoundaryAt = 0;
    const words = content.match(/\S+/gu) || [content];
    let fallbackIndex = 0;

    utterance.onstart = () => {
      if (this.utterance !== utterance) return;
      this.visemes.startSpeech({ rate: utterance.rate });
      this.visemes.setWord(words[0], { rate: utterance.rate });
      window.setAvatarSpeechWord?.(words[0], '');
      const wordMs = clamp(60000 / (150 * utterance.rate), 180, 700);
      this.fallbackTimer = window.setInterval(() => {
        if (generation !== this.generation || Date.now() - lastBoundaryAt < Math.max(1100, wordMs * 3)) return;
        fallbackIndex = Math.min(fallbackIndex + 1, words.length - 1);
        this.visemes.setWord(words[fallbackIndex], { rate: utterance.rate });
        window.setAvatarSpeechWord?.(words[fallbackIndex], '');
        if (fallbackIndex >= words.length - 1) {
          window.clearInterval(this.fallbackTimer);
          this.fallbackTimer = 0;
        }
      }, wordMs);
      onStart?.(utterance);
    };
    utterance.onboundary = (event) => {
      if (generation !== this.generation) return;
      lastBoundaryAt = Date.now();
      const start = Math.max(0, Number(event.charIndex) || 0);
      const length = Math.max(1, Number(event.charLength) || 1);
      let word = content.slice(start, start + length);
      if (utterance.lang.toLowerCase().startsWith('ja') && length <= 1) word = content.slice(start, start + 1);
      else if (length <= 1) word = content.slice(start).match(/^[\p{L}\p{N}]+/u)?.[0] || word;
      if (!word.trim()) word = content.slice(start).match(/^\S+/u)?.[0] || '';
      if (!word) return;
      this.visemes.setWord(word, { rate: utterance.rate });
      window.setAvatarSpeechWord?.(word, content.slice(start + word.length, start + word.length + 4));
      onBoundary?.({ event, word, utterance });
    };
    const finish = (error = null) => {
      if (generation !== this.generation) return;
      if (this.fallbackTimer) window.clearInterval(this.fallbackTimer);
      this.fallbackTimer = 0;
      this.utterance = null;
      this.visemes.finish({ delay: this.closeDelay });
      if (error) onError?.(error, utterance);
      if (this.closeTimer) window.clearTimeout(this.closeTimer);
      this.closeTimer = window.setTimeout(() => {
        this.closeTimer = 0;
        if (generation === this.generation) onEnd?.(utterance, error);
      }, this.closeDelay + 30);
    };
    utterance.onend = () => finish();
    utterance.onerror = (event) => finish(event);
    window.speechSynthesis.speak(utterance);
    return utterance;
  }

  cancel() {
    this.generation += 1;
    if (this.fallbackTimer) window.clearInterval(this.fallbackTimer);
    if (this.closeTimer) window.clearTimeout(this.closeTimer);
    this.fallbackTimer = 0;
    this.closeTimer = 0;
    if (this.utterance) {
      this.utterance.onstart = null;
      this.utterance.onboundary = null;
      this.utterance.onend = null;
      this.utterance.onerror = null;
    }
    this.utterance = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.visemes.stop({ immediate: true });
  }
}

export const waifuVoice = new WaifuVoiceController();
