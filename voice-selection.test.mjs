import assert from 'node:assert/strict';
import test from 'node:test';
import { findVoiceByLanguageAndUri, migrateLegacyVoiceSettings } from './voice-selection.mjs';

const voices = [
  { voiceURI: 'en-installed', lang: 'en-US', name: 'English installed' },
  { voiceURI: 'ja-installed', lang: 'ja_JP', name: 'Japanese installed' },
];

test('voice selection honors the selected installed voice for its language', () => {
  assert.equal(findVoiceByLanguageAndUri(voices, 'en', 'en-installed'), voices[0]);
  assert.equal(findVoiceByLanguageAndUri(voices, 'ja', 'ja-installed'), voices[1]);
});

test('voice selection ignores stale or mismatched language identifiers', () => {
  assert.equal(findVoiceByLanguageAndUri(voices, 'en', 'ja-installed'), null);
  assert.equal(findVoiceByLanguageAndUri(voices, 'ja', 'missing'), null);
  assert.equal(findVoiceByLanguageAndUri(voices, 'en', ''), null);
});

test('legacy Voice Lab choice migrates only when the shared store has no chosen voice', () => {
  assert.deepEqual(
    migrateLegacyVoiceSettings({ auto: true, voiceURI: '' }, { voiceURI: 'ja-installed', language: 'ja', rate: 1.5, pitch: 0.5 }),
    { auto: true, voiceURI: 'ja-installed', language: 'ja', rate: 1.3, pitch: 0.7 },
  );
  assert.deepEqual(
    migrateLegacyVoiceSettings({ voiceURI: 'en-installed', language: 'en', rate: 1 }, { voiceURI: 'ja-installed', language: 'ja' }),
    { voiceURI: 'en-installed', language: 'en', rate: 1 },
  );
});
