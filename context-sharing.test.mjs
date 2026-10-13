import assert from 'node:assert/strict';
import test from 'node:test';
import { canShareLocalContext } from './context-sharing.mjs';

test('local Ollama may use matching on-device context without hosted-sharing consent', () => {
  assert.equal(canShareLocalContext('ollama', false), true);
});

test('hosted providers do not receive local context until the user opts in', () => {
  for (const provider of ['openai', 'anthropic', 'xai', 'compatible', 'unknown']) {
    assert.equal(canShareLocalContext(provider, false), false, `${provider} should default to local-context off`);
    assert.equal(canShareLocalContext(provider, true), true, `${provider} may use context after opt-in`);
  }
});
