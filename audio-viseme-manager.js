const VISEMES = ['aa', 'ih', 'ou', 'ee', 'oh'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const LATIN_VOWELS = { a: 'aa', e: 'ee', i: 'ih', o: 'oh', u: 'ou', y: 'ih' };
const KANA_VOWEL = new Map();
const addKanaRow = (chars, vowels) => [...chars].forEach((char, index) => KANA_VOWEL.set(char, vowels[index]));
[
  'あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの',
  'はひふへほ', 'まみむめも', 'らりるれろ', 'がぎぐげご', 'ざじずぜぞ',
  'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ',
].forEach((row) => addKanaRow(row, 'aiueo'));
addKanaRow('やゆよ', 'auo');
addKanaRow('ゃゅょ', 'auo');
addKanaRow('わをん', 'aou');

function visemesForWord(word) {
  const text = String(word || '').toLowerCase().normalize('NFKC');
  const shapes = [];
  for (const char of text) {
    const kana = char >= '\u30a1' && char <= '\u30f6' ? String.fromCodePoint(char.codePointAt(0) - 0x60) : char;
    const shape = KANA_VOWEL.get(kana) || LATIN_VOWELS[char];
    if (shape && shapes.at(-1) !== shape) shapes.push(shape);
  }
  return shapes;
}

function asArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  throw new TypeError('Audio chunks must be AudioBuffer, ArrayBuffer, or a typed array.');
}

/**
 * Drives Vesper's five VRM vowel expressions from speech boundaries or audio.
 * Web Speech does not expose its rendered audio, so browser TTS uses vowel
 * timing estimated from each word; audio sources use a Web Audio analyser.
 */
export class AudioVisemeManager {
  constructor({ silenceDelay = 150 } = {}) {
    this.silenceDelay = silenceDelay;
    this.context = null;
    this.analyser = null;
    this.outputConnected = false;
    this.analyserSource = null;
    this.mediaSources = new WeakMap();
    this.mediaBindings = new WeakMap();
    this.activeMediaElement = null;
    this.audioSources = new Set();
    this.active = false;
    this.mode = 'idle';
    this.currentViseme = 'aa';
    this.envelope = 0;
    this.speechRate = 1;
    this.wordTimer = 0;
    this.closeTimer = 0;
    this.analysisFrame = 0;
    this.streamDone = false;
    this.audioCompletion = null;
    this.resolveAudioCompletion = null;
    this.lastScheduledEnd = 0;
    this.playbackHints = [];
    this.timeData = null;
    this.frequencyData = null;
    this.audioBands = { low: 0, mid: 0, high: 0 };
  }

  emit(viseme, weight) {
    const shape = VISEMES.includes(viseme) ? viseme : 'aa';
    this.currentViseme = shape;
    window.setAvatarViseme?.(shape, clamp(Number(weight) || 0, 0, 1));
  }

  startSpeech({ rate = 1 } = {}) {
    this.clearTimer('closeTimer');
    this.clearTimer('wordTimer');
    this.active = true;
    this.mode = 'phoneme';
    this.speechRate = clamp(Number(rate) || 1, 0.5, 2);
    this.streamDone = false;
    window.setAvatarSpeaking?.(true);
  }

  /** Approximate vowel timing for SpeechSynthesisUtterance word boundaries. */
  setWord(word, { rate = this.speechRate } = {}) {
    if (!this.active || this.mode !== 'phoneme') this.startSpeech({ rate });
    this.clearTimer('wordTimer');
    const shapes = visemesForWord(word);
    if (!shapes.length) {
      this.emit(this.currentViseme, 0);
      return;
    }
    const textLength = [...String(word || '')].length;
    const duration = clamp((textLength * 68) / clamp(Number(rate) || this.speechRate, 0.5, 2), 170, 950);
    const segment = duration / shapes.length;
    let index = 0;
    const step = () => {
      if (!this.active || this.mode !== 'phoneme') return;
      const shape = shapes[Math.min(index, shapes.length - 1)];
      const syllablePulse = 0.76 + 0.12 * Math.sin((index / Math.max(1, shapes.length)) * Math.PI);
      this.emit(shape, syllablePulse);
      index += 1;
      if (index < shapes.length) {
        this.wordTimer = window.setTimeout(step, segment);
      } else {
        this.wordTimer = window.setTimeout(() => this.emit(shape, 0.06), Math.max(55, segment * 0.72));
      }
    };
    step();
  }

  ensureAudioGraph() {
    if (this.context && this.analyser) return this.context;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('Web Audio is unavailable in this browser.');
    this.context = new AudioContextCtor();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.62;
    this.timeData = new Uint8Array(this.analyser.fftSize);
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    return this.context;
  }

  connectOutput() {
    if (this.outputConnected || !this.analyser || !this.context) return;
    this.analyser.connect(this.context.destination);
    this.outputConnected = true;
  }

  disconnectOutput() {
    if (!this.outputConnected || !this.analyser) return;
    this.analyser.disconnect();
    this.outputConnected = false;
  }

  beginAnalysis() {
    if (this.analysisFrame || !this.analyser) return;
    const sampleRate = this.context.sampleRate;
    const tick = () => {
      this.analysisFrame = 0;
      if (!this.active || this.mode !== 'audio' || !this.analyser) return;
      this.analyser.getByteTimeDomainData(this.timeData);
      this.analyser.getByteFrequencyData(this.frequencyData);
      let squareSum = 0;
      for (const sample of this.timeData) {
        const normalized = (sample - 128) / 128;
        squareSum += normalized * normalized;
      }
      const rms = Math.sqrt(squareSum / this.timeData.length);
      const target = clamp((rms - 0.009) * 8.5, 0, 0.86);
      this.envelope += (target - this.envelope) * (target > this.envelope ? 0.48 : 0.2);
      const bandEnergy = (minimum, maximum) => {
        let sum = 0;
        let count = 0;
        for (let index = 1; index < this.frequencyData.length; index += 1) {
          const frequency = (index * sampleRate) / (this.analyser.fftSize * 2);
          if (frequency < minimum || frequency >= maximum) continue;
          sum += this.frequencyData[index] / 255;
          count += 1;
        }
        return count ? clamp((sum / count) * 2.4, 0, 1) : 0;
      };
      const low = bandEnergy(65, 260);
      const mid = bandEnergy(260, 2400);
      const high = bandEnergy(2400, 8000);
      this.audioBands.low += (low - this.audioBands.low) * (low > this.audioBands.low ? 0.38 : 0.16);
      this.audioBands.mid += (mid - this.audioBands.mid) * (mid > this.audioBands.mid ? 0.38 : 0.16);
      this.audioBands.high += (high - this.audioBands.high) * (high > this.audioBands.high ? 0.38 : 0.16);
      window.setAvatarAudioBands?.(this.audioBands);
      const mouthEnergy = clamp(this.envelope * 0.58 + this.audioBands.mid * 0.42 + this.audioBands.high * 0.12, 0, 0.92);
      if (mouthEnergy < 0.035) {
        this.emit(this.currentViseme, 0);
      } else {
        let weighted = 0;
        let energy = 0;
        for (let index = 2; index < this.frequencyData.length; index += 1) {
          const frequency = (index * sampleRate) / (this.analyser.fftSize * 2);
          if (frequency < 180 || frequency > 4200) continue;
          const magnitude = this.frequencyData[index];
          weighted += frequency * magnitude;
          energy += magnitude;
        }
        const centroid = energy ? weighted / energy : 1350;
        const now = this.context.currentTime;
        this.playbackHints = this.playbackHints.filter((hint) => hint.endAt > now);
        const activeHint = this.playbackHints.find((hint) => hint.startAt <= now);
        const shape = activeHint?.shape || (centroid < 700 ? 'ou' : centroid < 1050 ? 'oh' : centroid < 1750 ? 'aa' : centroid < 2450 ? 'ee' : 'ih');
        this.emit(shape, mouthEnergy);
      }
      this.analysisFrame = window.requestAnimationFrame(tick);
    };
    this.analysisFrame = window.requestAnimationFrame(tick);
  }

  async connectAudioElement(element) {
    if (!(element instanceof HTMLMediaElement)) throw new TypeError('Pass an audio or video element.');
    const context = this.ensureAudioGraph();
    try { await context.resume(); } catch { /* A later user-initiated play event can resume audio. */ }
    this.connectOutput();
    let source = this.mediaSources.get(element);
    if (!source) {
      source = context.createMediaElementSource(element);
      source.connect(this.analyser);
      this.mediaSources.set(element, source);
    }
    this.clearMediaBinding(element);
    const begin = () => {
      void context.resume();
      this.stop({ immediate: true, pauseMedia: false });
      this.clearTimer('wordTimer');
      this.active = true;
      this.mode = 'audio';
      this.activeMediaElement = element;
      this.streamDone = false;
      this.clearTimer('closeTimer');
      window.setAvatarSpeaking?.(true);
      this.beginAnalysis();
    };
    const finish = () => {
      if (this.activeMediaElement === element) this.activeMediaElement = null;
      this.finish();
    };
    const bindings = [['play', begin], ['ended', finish], ['pause', finish], ['emptied', finish]];
    bindings.forEach(([name, handler]) => element.addEventListener(name, handler));
    this.mediaBindings.set(element, bindings);
    if (!element.paused) begin();
    return () => this.clearMediaBinding(element);
  }

  clearMediaBinding(element) {
    const bindings = this.mediaBindings.get(element);
    if (!bindings) return;
    bindings.forEach(([name, handler]) => element.removeEventListener(name, handler));
    this.mediaBindings.delete(element);
  }

  async connectMediaStream(stream, { monitor = true } = {}) {
    if (!(stream instanceof MediaStream)) throw new TypeError('Pass a MediaStream.');
    const context = this.ensureAudioGraph();
    await context.resume();
    this.stop({ immediate: true });
    const source = context.createMediaStreamSource(stream);
    source.connect(this.analyser);
    if (monitor) this.connectOutput();
    else this.disconnectOutput();
    this.analyserSource = source;
    this.active = true;
    this.mode = 'audio';
    this.streamDone = false;
    this.clearTimer('closeTimer');
    window.setAvatarSpeaking?.(true);
    this.beginAnalysis();
    const onEnded = () => {
      if (stream.getAudioTracks().every((track) => track.readyState === 'ended')) this.finish();
    };
    stream.getAudioTracks().forEach((track) => track.addEventListener('ended', onEnded, { once: true }));
    return () => {
      source.disconnect();
      if (this.analyserSource === source) this.analyserSource = null;
      stream.getAudioTracks().forEach((track) => track.removeEventListener('ended', onEnded));
      this.finish();
    };
  }

  /**
   * Plays a stream of AudioBuffers or independently decodable encoded chunks.
   * Each chunk is scheduled against AudioContext.currentTime, then analyzed as
   * it reaches the output. This works with chunked TTS services that emit
   * complete, separately decodable audio segments.
   */
  async playAudioChunks(chunks, { signal } = {}) {
    const context = this.ensureAudioGraph();
    await context.resume();
    this.stop({ immediate: true });
    this.connectOutput();
    this.active = true;
    this.mode = 'audio';
    this.streamDone = false;
    this.lastScheduledEnd = context.currentTime + 0.04;
    this.playbackHints = [];
    this.audioCompletion = new Promise((resolve) => { this.resolveAudioCompletion = resolve; });
    const completion = this.audioCompletion;
    this.clearTimer('closeTimer');
    window.setAvatarSpeaking?.(true);
    this.beginAnalysis();
    const abort = () => this.stop({ immediate: true });
    signal?.addEventListener('abort', abort, { once: true });
    let scheduled = 0;
    try {
      for await (const item of chunks) {
        if (signal?.aborted || !this.active) break;
        const audio = item && typeof item === 'object' && !ArrayBuffer.isView(item) && !(item instanceof ArrayBuffer) && !(item instanceof AudioBuffer) ? item.audio : item;
        const buffer = audio instanceof AudioBuffer ? audio : await context.decodeAudioData(asArrayBuffer(audio));
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.analyser);
        const startAt = Math.max(this.lastScheduledEnd, context.currentTime + 0.025);
        const endAt = startAt + buffer.duration;
        if (item?.viseme && VISEMES.includes(item.viseme)) {
          this.playbackHints.push({ shape: item.viseme, startAt, endAt });
        }
        this.audioSources.add(source);
        source.onended = () => {
          this.audioSources.delete(source);
          if (this.streamDone && this.audioSources.size === 0) this.finish();
        };
        source.start(startAt);
        this.lastScheduledEnd = endAt;
        scheduled += 1;
      }
    } catch (error) {
      this.streamDone = true;
      this.stop();
      signal?.removeEventListener('abort', abort);
      throw error;
    }
    if (!this.active) {
      signal?.removeEventListener('abort', abort);
      return completion;
    }
    this.streamDone = true;
    if (!scheduled || this.audioSources.size === 0) this.finish();
    signal?.removeEventListener('abort', abort);
    return completion;
  }

  finish({ delay = this.silenceDelay } = {}) {
    this.clearTimer('wordTimer');
    this.playbackHints = [];
    this.emit(this.currentViseme, 0);
    if (this.closeTimer) window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      this.closeTimer = 0;
      this.active = false;
      this.mode = 'idle';
      this.envelope = 0;
      this.audioBands = { low: 0, mid: 0, high: 0 };
      window.setAvatarAudioBands?.(this.audioBands);
      this.activeMediaElement = null;
      this.emit('aa', 0);
      window.setAvatarSpeaking?.(false);
      const resolve = this.resolveAudioCompletion;
      this.resolveAudioCompletion = null;
      this.audioCompletion = null;
      resolve?.();
      if (this.analysisFrame) window.cancelAnimationFrame(this.analysisFrame);
      this.analysisFrame = 0;
    }, Math.max(0, delay));
  }

  stop({ immediate = false, pauseMedia = true } = {}) {
    const media = this.activeMediaElement;
    this.activeMediaElement = null;
    if (pauseMedia && media && !media.paused) media.pause();
    this.clearTimer('wordTimer');
    this.clearTimer('closeTimer');
    this.playbackHints = [];
    this.disconnectActiveSource();
    this.audioSources.forEach((source) => { try { source.stop(); } catch { /* Already ended. */ } });
    this.audioSources.clear();
    if (this.analysisFrame) window.cancelAnimationFrame(this.analysisFrame);
    this.analysisFrame = 0;
    this.active = false;
    this.mode = 'idle';
    this.envelope = 0;
    this.audioBands = { low: 0, mid: 0, high: 0 };
    window.setAvatarAudioBands?.(this.audioBands);
    this.emit('aa', 0);
    if (immediate) {
      window.setAvatarSpeaking?.(false);
      const resolve = this.resolveAudioCompletion;
      this.resolveAudioCompletion = null;
      this.audioCompletion = null;
      resolve?.();
    } else {
      this.finish();
    }
  }

  disconnectActiveSource() {
    this.analyserSource?.disconnect();
    this.analyserSource = null;
  }

  clearTimer(name) {
    if (!this[name]) return;
    window.clearTimeout(this[name]);
    this[name] = 0;
  }

  async destroy() {
    this.stop({ immediate: true });
    this.disconnectActiveSource();
    for (const element of document.querySelectorAll('audio, video')) this.clearMediaBinding(element);
    await this.context?.close?.();
    this.context = null;
    this.analyser = null;
  }
}

export const audioVisemeManager = new AudioVisemeManager();
if (typeof window !== 'undefined') window.vesperAudioVisemes = audioVisemeManager;
