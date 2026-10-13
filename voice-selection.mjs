export function findVoiceByLanguageAndUri(voices, language, voiceURI) {
  const prefix = language === 'ja' ? 'ja' : 'en';
  if (!Array.isArray(voices) || typeof voiceURI !== 'string' || !voiceURI) return null;
  return voices.find((voice) => typeof voice?.voiceURI === 'string'
    && voice.voiceURI === voiceURI
    && String(voice.lang || '').toLowerCase().replaceAll('_', '-').startsWith(prefix)) || null;
}

export function migrateLegacyVoiceSettings(current = {}, legacy = {}) {
  if (typeof current.voiceURI === 'string' && current.voiceURI) return { ...legacy, ...current };
  if (typeof legacy.voiceURI !== 'string' || !legacy.voiceURI) return { ...current };
  return {
    ...current,
    voiceURI: legacy.voiceURI,
    language: legacy.language === 'ja' ? 'ja' : 'en',
    rate: Number.isFinite(legacy.rate) ? Math.min(1.3, Math.max(0.7, legacy.rate)) : current.rate,
    pitch: Number.isFinite(legacy.pitch) ? Math.min(1.4, Math.max(0.7, legacy.pitch)) : current.pitch,
  };
}
