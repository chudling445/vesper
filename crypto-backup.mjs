export const BACKUP_FORMAT = 'vesper-encrypted-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_ITERATIONS = 310_000;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_BACKUP_PLAINTEXT_BYTES = 36 * 1024 * 1024;
const KDF = 'PBKDF2-SHA-256';
const CIPHER = 'AES-256-GCM';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getSubtle(cryptoApi) {
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Web Crypto is unavailable in this browser context.');
  }
  return cryptoApi.subtle;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Backup encoding is invalid.');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || !Number.isInteger(state.schemaVersion) || state.schemaVersion < 1
    || !state.session || typeof state.session !== 'object' || Array.isArray(state.session)
    || !state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)
    || !state.workspace || typeof state.workspace !== 'object' || Array.isArray(state.workspace)) {
    throw new Error('The decrypted file does not contain a valid Vesper state backup.');
  }
  return state;
}

function additionalData(iterations) {
  return encoder.encode(`${BACKUP_FORMAT}:${BACKUP_VERSION}:${KDF}:${iterations}:${CIPHER}`);
}

async function deriveKey(passphrase, salt, iterations, subtle) {
  const material = await subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBackup(state, passphrase, {
  cryptoApi = globalThis.crypto,
  iterations = BACKUP_ITERATIONS,
} = {}) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) {
    throw new Error('Use a backup passphrase with 12–1,024 characters.');
  }
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) {
    throw new Error('Backup key-derivation settings are invalid.');
  }
  validateState(state);
  const subtle = getSubtle(cryptoApi);
  const plaintext = encoder.encode(JSON.stringify(state));
  if (plaintext.byteLength > MAX_BACKUP_PLAINTEXT_BYTES) throw new Error('Vesper data is too large for one encrypted backup (36 MB maximum).');
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations, subtle);
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(iterations), tagLength: 128 },
    key,
    plaintext,
  );
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kdf: KDF,
    iterations,
    cipher: CIPHER,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptBackup(envelope, passphrase, { cryptoApi = globalThis.crypto } = {}) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) {
    throw new Error('Enter the backup passphrase (12–1,024 characters).');
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || envelope.format !== BACKUP_FORMAT || envelope.version !== BACKUP_VERSION
    || envelope.kdf !== KDF || envelope.cipher !== CIPHER) {
    throw new Error('This is not a supported Vesper encrypted backup.');
  }
  if (!Number.isInteger(envelope.iterations) || envelope.iterations < 100_000 || envelope.iterations > 1_000_000) {
    throw new Error('Backup key-derivation settings are invalid.');
  }
  if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > Math.ceil(MAX_BACKUP_BYTES * 4 / 3)) {
    throw new Error('Backup data exceeds the 50 MB limit.');
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > MAX_BACKUP_PLAINTEXT_BYTES) {
    throw new Error('Backup data is incomplete or exceeds the 36 MB encrypted payload limit.');
  }
  const subtle = getSubtle(cryptoApi);
  try {
    const key = await deriveKey(passphrase, salt, envelope.iterations, subtle);
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(envelope.iterations), tagLength: 128 },
      key,
      ciphertext,
    );
    return validateState(JSON.parse(decoder.decode(decrypted)));
  } catch {
    throw new Error('Could not decrypt this backup. Check the passphrase and file integrity.');
  }
}
