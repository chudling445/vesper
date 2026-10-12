import { appStore } from './persistence.js';
import { showToast } from './feedback.js';

const SESSION_KEY = 'vesper-unlocked-v1';
const DEFAULT_AUTO_LOCK = 15;
const PBKDF2_ITERATIONS = 310_000;
const $ = (selector) => document.querySelector(selector);

let overlay;
let settings = { pinSalt: '', pinHash: '', autoLockMinutes: DEFAULT_AUTO_LOCK, biometricId: '' };
let inactivityTimer;
let legacyBiometricRemoved = false;

const randomBytes = (length = 32) => crypto.getRandomValues(new Uint8Array(length));
const toBase64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
function fromBase64Url(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
const bytesToHex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

async function hashPin(secret, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return bytesToHex(bits);
}

async function legacyHash(secret, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${secret}`);
  return bytesToHex(await crypto.subtle.digest('SHA-256', bytes));
}

function matchesHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function loadSettings() {
  settings = { autoLockMinutes: DEFAULT_AUTO_LOCK, ...appStore.get('settings.security', {}) };
  // The previous biometric implementation accepted a credential prompt without
  // validating its assertion. Discard that registration rather than trusting it.
  if (settings.biometricId && (!settings.biometricPublicKey || !settings.pinHash)) {
    settings.biometricId = '';
    settings.biometricPublicKey = '';
    settings.biometricAlgorithm = 0;
    settings.biometricOrigin = '';
    settings.biometricRpId = '';
    legacyBiometricRemoved = true;
    saveSettings();
  }
}

function saveSettings() { appStore.set('settings.security', settings); }
function hasCredential() { return Boolean(settings.pinHash); }

function buildOverlay() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'security-lock-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<div class="lock-card"><div class="lock-emblem">✦</div><span class="eyebrow">VESPER / PRIVATE SPACE</span><h1>Welcome <em>back.</em></h1><p>Your local Vesper workspace is locked.</p><form id="unlock-form"><label class="studio-field">PIN OR MASTER PASSWORD<input id="unlock-secret" type="password" autocomplete="current-password" required /></label><button class="primary-button" type="submit">UNLOCK VESPER</button></form><button class="quiet-button" id="unlock-biometric" type="button" hidden>USE DEVICE BIOMETRIC</button><small id="unlock-status" aria-live="polite"></small></div>`;
  document.body.append(overlay);
  $('#unlock-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const ok = await unlock($('#unlock-secret').value);
      $('#unlock-status').textContent = ok ? '' : 'That credential did not match.';
    } catch {
      $('#unlock-status').textContent = 'This credential could not be verified. Check the saved PIN and try again.';
    }
  });
  $('#unlock-biometric').addEventListener('click', unlockBiometric);
}

function showLock() {
  buildOverlay();
  overlay.hidden = false;
  document.body.classList.add('is-locked');
  if (legacyBiometricRemoved) {
    $('#unlock-status').textContent = 'Unlock with your PIN, then register biometrics again in the Security workspace.';
  }
  window.setTimeout(() => $('#unlock-secret')?.focus(), 0);
}

function hideLock() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove('is-locked');
  sessionStorage.setItem(SESSION_KEY, '1');
  resetInactivity();
}

export function lockNow() {
  if (!hasCredential()) {
    showToast('Set a local PIN or master password in Workspace → Security before locking Vesper.', 'info');
    return;
  }
  sessionStorage.removeItem(SESSION_KEY);
  showLock();
  showToast('Vesper is locked.', 'info', { timeout: 1800 });
}

export async function setLocalCredential(secret) {
  if (!secret || secret.length < 4) throw new Error('Use at least 4 characters for the local credential.');
  const salt = randomBytes(16);
  settings.pinSalt = toBase64Url(salt);
  settings.pinHash = await hashPin(secret, salt);
  settings.pinHashAlgorithm = 'PBKDF2-SHA-256';
  settings.pinIterations = PBKDF2_ITERATIONS;
  saveSettings();
  sessionStorage.setItem(SESSION_KEY, '1');
  showToast('Local security credential saved.', 'success');
}

export function setAutoLock(minutes) {
  settings.autoLockMinutes = Math.max(0, Math.min(120, Number(minutes) || 0));
  saveSettings();
  resetInactivity();
}

async function unlock(secret) {
  if (!hasCredential()) return false;
  let valid = false;
  if (settings.pinHashAlgorithm === 'PBKDF2-SHA-256') {
    const salt = fromBase64Url(settings.pinSalt);
    const iterations = Math.max(100_000, Math.min(1_000_000, Number(settings.pinIterations) || PBKDF2_ITERATIONS));
    valid = matchesHash(await hashPin(secret, salt, iterations), settings.pinHash);
  } else {
    // Upgrade existing SHA-256 PINs on the first successful unlock.
    valid = matchesHash(await legacyHash(secret, settings.pinSalt), settings.pinHash);
    if (valid) {
      await setLocalCredential(secret);
      hideLock();
      return true;
    }
  }
  if (valid) hideLock();
  return valid;
}

function readClientData(buffer, expectedType, expectedChallenge) {
  let clientData;
  try { clientData = JSON.parse(new TextDecoder().decode(buffer)); } catch { return null; }
  if (clientData.type !== expectedType || clientData.challenge !== expectedChallenge) return null;
  if (clientData.origin !== location.origin || clientData.crossOrigin === true) return null;
  return clientData;
}

function derEcdsaSignatureToRaw(signature, coordinateSize = 32) {
  const der = new Uint8Array(signature);
  if (der.length < 8 || der[0] !== 0x30) throw new Error('The biometric signature format is invalid.');
  let offset = 1;
  let sequenceLength = der[offset++];
  if (sequenceLength & 0x80) {
    const lengthBytes = sequenceLength & 0x7f;
    if (lengthBytes < 1 || lengthBytes > 2 || offset + lengthBytes > der.length) throw new Error('The biometric signature format is invalid.');
    sequenceLength = 0;
    for (let index = 0; index < lengthBytes; index += 1) sequenceLength = (sequenceLength << 8) | der[offset++];
  }
  if (offset + sequenceLength !== der.length) throw new Error('The biometric signature format is invalid.');
  const readInteger = () => {
    if (der[offset++] !== 0x02 || offset >= der.length) throw new Error('The biometric signature format is invalid.');
    const length = der[offset++];
    if (length < 1 || offset + length > der.length) throw new Error('The biometric signature format is invalid.');
    let value = der.subarray(offset, offset + length);
    offset += length;
    while (value.length > coordinateSize && value[0] === 0) value = value.subarray(1);
    if (value.length > coordinateSize) throw new Error('The biometric signature is invalid.');
    return value;
  };
  const r = readInteger();
  const s = readInteger();
  if (offset !== der.length) throw new Error('The biometric signature format is invalid.');
  const raw = new Uint8Array(coordinateSize * 2);
  raw.set(r, coordinateSize - r.length);
  raw.set(s, coordinateSize * 2 - s.length);
  return raw;
}

async function verifyBiometricAssertion(credential, challenge) {
  if (!credential || credential.type !== 'public-key' || !settings.biometricPublicKey) return false;
  if (toBase64Url(credential.rawId) !== settings.biometricId) return false;
  const response = credential.response;
  const challengeText = toBase64Url(challenge);
  if (!readClientData(response.clientDataJSON, 'webauthn.get', challengeText)) return false;

  const authenticatorData = new Uint8Array(response.authenticatorData);
  if (authenticatorData.length < 37) return false;
  const flags = authenticatorData[32];
  // Require user presence and user verification (PIN, fingerprint, or face).
  if ((flags & 0x01) === 0 || (flags & 0x04) === 0) return false;

  const expectedRpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(settings.biometricRpId)));
  for (let index = 0; index < expectedRpHash.length; index += 1) {
    if (authenticatorData[index] !== expectedRpHash[index]) return false;
  }

  const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', response.clientDataJSON));
  const signedData = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signedData.set(authenticatorData);
  signedData.set(clientDataHash, authenticatorData.length);

  const algorithm = Number(settings.biometricAlgorithm);
  if (![-7, -257].includes(algorithm)) return false;
  const publicKey = await crypto.subtle.importKey('spki', fromBase64Url(settings.biometricPublicKey),
    algorithm === -7 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']);
  const signature = algorithm === -7 ? derEcdsaSignatureToRaw(response.signature) : response.signature;
  const verifyAlgorithm = algorithm === -7 ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' };
  return crypto.subtle.verify(verifyAlgorithm, publicKey, signature, signedData);
}

async function registerBiometric() {
  if (!hasCredential()) throw new Error('Set and save a PIN or master password before enabling biometric unlock.');
  if (!window.PublicKeyCredential || !navigator.credentials || !crypto.subtle) throw new Error('Biometric unlock is not available in this browser.');
  if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable && !await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) {
    throw new Error('This device does not offer a biometric or PIN-backed platform authenticator.');
  }

  const challenge = randomBytes();
  const challengeText = toBase64Url(challenge);
  const credential = await navigator.credentials.create({ publicKey: {
    challenge,
    rp: { name: 'Vesper', id: location.hostname },
    user: { id: new TextEncoder().encode('vesper-local-user'), name: 'vesper-local', displayName: 'Vesper local user' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'discouraged', userVerification: 'required' },
    attestation: 'none',
    timeout: 60_000,
  } });
  if (!credential) throw new Error('Biometric registration was cancelled.');
  const response = credential.response;
  const algorithm = response.getPublicKeyAlgorithm?.();
  const publicKey = response.getPublicKey?.();
  if (!readClientData(response.clientDataJSON, 'webauthn.create', challengeText) || !publicKey || ![-7, -257].includes(algorithm)) {
    throw new Error('This browser could not safely verify the new biometric credential.');
  }

  settings.biometricId = toBase64Url(credential.rawId);
  settings.biometricPublicKey = toBase64Url(publicKey);
  settings.biometricAlgorithm = algorithm;
  settings.biometricOrigin = location.origin;
  settings.biometricRpId = location.hostname;
  saveSettings();
  $('#unlock-biometric').hidden = false;
  showToast('Device biometric unlock enabled. Your PIN remains the recovery method.', 'success');
}

async function unlockBiometric() {
  try {
    if (!settings.biometricPublicKey || !settings.pinHash) throw new Error('Unlock with your PIN and register biometrics again.');
    if (settings.biometricOrigin !== location.origin || settings.biometricRpId !== location.hostname) throw new Error('Biometrics are registered for a different Vesper address.');
    const challenge = randomBytes();
    const credential = await navigator.credentials.get({ publicKey: {
      challenge,
      rpId: settings.biometricRpId,
      allowCredentials: [{ id: fromBase64Url(settings.biometricId), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60_000,
    } });
    if (!await verifyBiometricAssertion(credential, challenge)) throw new Error('Biometric verification could not be validated. Use your PIN instead.');
    hideLock();
  } catch (error) {
    $('#unlock-status').textContent = error.name === 'NotAllowedError' ? 'Biometric verification was cancelled or unavailable.' : error.message;
  }
}

function resetInactivity() {
  window.clearTimeout(inactivityTimer);
  if (!hasCredential() || !settings.autoLockMinutes) return;
  inactivityTimer = window.setTimeout(lockNow, settings.autoLockMinutes * 60_000);
}

export function initSecurityLock() {
  loadSettings();
  buildOverlay();
  window.vesperLockNow = lockNow;
  const lockButton = $('#lock-app');
  if (lockButton) {
    lockButton.hidden = false;
    lockButton.addEventListener('click', lockNow);
  }
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      lockNow();
    }
  });
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((eventName) => document.addEventListener(eventName, resetInactivity, { passive: true }));
  $('#security-save')?.addEventListener('click', async () => {
    try {
      const secret = $('#security-secret').value.trim();
      if (secret) await setLocalCredential(secret);
      settings.protectInbox = $('#security-protect-inbox')?.checked === true;
      saveSettings();
      setAutoLock($('#security-autolock').value);
      $('#security-secret').value = '';
    } catch (error) { showToast(error.message, 'error'); }
  });
  const inboxProtection = $('#security-protect-inbox');
  if (inboxProtection) inboxProtection.checked = settings.protectInbox === true;
  const autoLockSelect = $('#security-autolock');
  if (autoLockSelect) autoLockSelect.value = String(settings.autoLockMinutes ?? DEFAULT_AUTO_LOCK);
  $('#security-biometric')?.addEventListener('click', async () => {
    try { await registerBiometric(); } catch (error) { showToast(error.message, 'warning'); }
  });
  if (settings.biometricPublicKey && settings.biometricId) $('#unlock-biometric').hidden = false;
  if (hasCredential() && sessionStorage.getItem(SESSION_KEY) !== '1') showLock();
  else if (legacyBiometricRemoved) showToast('An older unverified biometric setting was removed. Set a PIN to protect Vesper, then register biometrics again.', 'warning');
  resetInactivity();
  return { lockNow, setAutoLock, setLocalCredential };
}
