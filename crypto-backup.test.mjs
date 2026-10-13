import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { BACKUP_FORMAT, decryptBackup, encryptBackup } from './crypto-backup.mjs';

const state = {
  schemaVersion: 4,
  session: { messages: [{ role: 'user', content: 'local notes' }] },
  settings: { theme: 'aurora-glass' },
  workspace: { health: { nutritionEntries: [{ name: 'private data' }] } },
};
const passphrase = 'correct horse battery staple';
const options = { cryptoApi: webcrypto, iterations: 100_000 };

test('encrypted backup round-trips local state without exposing its payload', async () => {
  const envelope = await encryptBackup(state, passphrase, options);
  assert.equal(envelope.format, BACKUP_FORMAT);
  assert.equal(JSON.stringify(envelope).includes('private data'), false);
  assert.deepEqual(await decryptBackup(envelope, passphrase, { cryptoApi: webcrypto }), state);
});

test('encrypted backup rejects weak passphrases and malformed state', async () => {
  await assert.rejects(encryptBackup(state, 'short', options), /12–1,024 characters/);
  await assert.rejects(encryptBackup(state, 'x'.repeat(1025), options), /12–1,024 characters/);
  await assert.rejects(encryptBackup({ settings: {}, workspace: {}, session: {} }, passphrase, options), /valid Vesper state/);
});

test('encrypted backup rejects a wrong passphrase and tampered ciphertext', async () => {
  const envelope = await encryptBackup(state, passphrase, options);
  await assert.rejects(decryptBackup(envelope, 'wrong passphrase here', { cryptoApi: webcrypto }), /Could not decrypt/);
  const tampered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` };
  await assert.rejects(decryptBackup(tampered, passphrase, { cryptoApi: webcrypto }), /Could not decrypt/);
});

test('encrypted backup enforces envelope metadata and KDF work factor bounds', async () => {
  const envelope = await encryptBackup(state, passphrase, options);
  await assert.rejects(decryptBackup({ ...envelope, iterations: 1 }, passphrase, { cryptoApi: webcrypto }), /settings are invalid/);
  await assert.rejects(decryptBackup({ ...envelope, version: 2 }, passphrase, { cryptoApi: webcrypto }), /not a supported/);
});
