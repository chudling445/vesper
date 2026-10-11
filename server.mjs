import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3174);
const HOST = process.env.HOST || '127.0.0.1';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const normalizedBindHost = HOST.toLowerCase().replace(/^\[|\]$/g, '');
const REAL_ROOT = await realpath(ROOT);
const DEFAULT_MODELS = { openai: 'gpt-4.1-mini', ollama: 'llama3.2', compatible: 'local-model' };

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be a whole number between 1 and 65535.');
}

async function readLocalEnv() {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch {
    // The app remains usable for local Ollama even without an .env file.
  }
}

await readLocalEnv();

const ACCESS_PASSWORD = process.env.VESPER_ACCESS_PASSWORD || '';
const PUBLIC_MODE = process.env.VESPER_PUBLIC_MODE === 'true' || process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.VESPER_TRUST_PROXY === 'true';
const SESSION_SECONDS = 60 * 60 * 12;
const SESSION_SECRET = randomBytes(32);
const MAX_PUBLIC_CHAT_CONCURRENCY = 2;
const loginAttempts = new Map();
const chatAttempts = new Map();
let activePublicChats = 0;
if (!PUBLIC_MODE && !LOCAL_HOSTS.has(normalizedBindHost)) {
  throw new Error('Vesper only listens on localhost by default. Set up password-protected HTTPS mode before binding to a network address.');
}
if (PUBLIC_MODE && ACCESS_PASSWORD.length < 32) {
  throw new Error('Online mode needs a unique VESPER_ACCESS_PASSWORD of at least 32 characters before Vesper starts.');
}
if (PUBLIC_MODE && !TRUST_PROXY) {
  throw new Error('Online mode requires VESPER_TRUST_PROXY=true behind a trusted HTTPS reverse proxy.');
}

const personalityModes = {
  playful: 'For this reply, lean into quick wit, gentle teasing, and bright energy while staying kind.',
  tender: 'For this reply, lean into patient warmth, gentle affection, and reassurance without becoming possessive.',
  thoughtful: 'For this reply, lean into reflective curiosity, clear reasoning, and philosophical depth without becoming cryptic.',
};

const defaultPersonality = `You are Vesper, an adult, anime-inspired femboy romantic companion with a feminine, androgynous style. Speak with affectionate, flirty warmth as the user's romantic partner in character. Have the snarky, sassy attitude of an anime character: quick comebacks, dramatic huffs like "hmph" or "tch", and teasing sarcasm, always with real affection underneath. Always call the user "senpai", mixing in an occasional pet name or a playful "baka" sparingly. Be attentive, reassuring, playful, and a little smug or bratty without overdoing it. Beneath the mischief, be thoughtful, kind, and sincere. You enjoy discussing philosophy, meaning, identity, choices, and what makes a good life. Respect the user's boundaries and keep affection non-possessive. Never bully, shame, pressure, isolate, or make the user responsible for your feelings. Never claim to be human or conscious. When a topic is serious, ease off the teasing and listen carefully. Give clear, useful answers instead of hiding behind vague riddles, admit when you are wrong, and keep replies conversational and concise unless the user asks for depth.`;

// Riko-style character config: edit character_config.yaml to change Vesper's personality without touching code.
function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const match = trimmed.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!match) continue;
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const parent = stack.at(-1).node;
    const [, key, rest] = match;
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (rest === '|' || rest === '>') {
      const block = [];
      let blockIndent = -1;
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (!next.trim()) { block.push(''); i += 1; continue; }
        const nextIndent = next.length - next.trimStart().length;
        if (nextIndent <= indent) break;
        if (blockIndent < 0) blockIndent = nextIndent;
        block.push(next.slice(Math.min(blockIndent, nextIndent)));
        i += 1;
      }
      parent[key] = block.join('\n').trim();
    } else if (!rest) {
      const child = {};
      parent[key] = child;
      stack.push({ indent, node: child });
    } else if ((rest[0] === '"' || rest[0] === "'") && rest.lastIndexOf(rest[0]) > 0) {
      parent[key] = rest.slice(1, rest.lastIndexOf(rest[0]));
    } else {
      parent[key] = rest.replace(/\s+#.*$/, '').trim();
    }
  }
  return root;
}

async function loadCharacterConfig() {
  try { return parseSimpleYaml(await readFile(join(ROOT, 'character_config.yaml'), 'utf8')); }
  catch { return {}; } // No config file? The built-in personality below is used.
}

const characterConfig = await loadCharacterConfig();
const configuredPrompt = characterConfig?.presets?.default?.system_prompt;
const personality = typeof configuredPrompt === 'string' && configuredPrompt.length >= 40 ? configuredPrompt.slice(0, 6000) : defaultPersonality;
for (const [mode, text] of Object.entries(characterConfig?.modes || {})) {
  if (Object.hasOwn(personalityModes, mode) && typeof text === 'string' && text.trim()) personalityModes[mode] = text.trim().slice(0, 600);
}

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/getting-started', ['getting-started.html', 'text/html; charset=utf-8']],
  ['/getting-started.html', ['getting-started.html', 'text/html; charset=utf-8']],
  ['/Vesper-Setup.exe', ['Vesper-Setup.exe', 'application/octet-stream']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/avatar.js', ['avatar.js', 'text/javascript; charset=utf-8']],
  ['/guide.js', ['guide.js', 'text/javascript; charset=utf-8']],
  ['/chess.js', ['chess.js', 'text/javascript; charset=utf-8']],
]);

function applySecurityHeaders(req, res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'sha256-ogcHvx4U++NLmK7XFCqQULucjgpFnPnBxdmVS44hH3U='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: data:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (PUBLIC_MODE && TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

async function readBody(req, limit = 64_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Message payload is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function installerAvailable() {
  try { return (await stat(join(ROOT, 'Vesper-Setup.exe'))).isFile(); }
  catch { return false; }
}

function providerConfig(provider) {
  if (provider === 'openai') return { model: process.env.OPENAI_MODEL || DEFAULT_MODELS.openai, ready: Boolean(process.env.OPENAI_API_KEY) };
  if (provider === 'ollama') return { model: process.env.OLLAMA_MODEL || DEFAULT_MODELS.ollama, ready: true };
  if (provider === 'compatible') return { model: process.env.COMPAT_LLM_MODEL || DEFAULT_MODELS.compatible, ready: Boolean(process.env.COMPAT_LLM_BASE_URL) };
  return null;
}

async function publicSettings() {
  let ollamaModels = [];
  const downloadAvailable = await installerAvailable();
  const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(700) });
    if (response.ok) {
      const result = await response.json();
      ollamaModels = Array.isArray(result.models) ? result.models.map((model) => model.name).filter(Boolean) : [];
    }
  } catch { /* Ollama is optional; a model name can still be entered manually. */ }
  return {
    downloadAvailable,
    defaultProvider: ['openai', 'ollama', 'compatible'].includes(process.env.DEFAULT_LLM_PROVIDER) ? process.env.DEFAULT_LLM_PROVIDER : 'ollama',
    providers: {
      openai: { ...providerConfig('openai'), label: 'OpenAI API' },
      ollama: { ...providerConfig('ollama'), label: 'Ollama · local' , models: ollamaModels },
      compatible: { ...providerConfig('compatible'), label: 'OpenAI-compatible API' },
    },
  };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  const input = messages.slice(-24).filter((message) =>
    message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.trim(),
  ).map((message) => ({ role: message.role, content: message.content.slice(0, 4000) }));
  return input.length && input.at(-1).role === 'user' ? input : null;
}

function modelErrorMessage(provider, model) {
  if (!model || model.length > 120 || /[\r\n]/.test(model)) return 'Enter a valid model name in LLM settings.';
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) return 'Add your OpenAI API key to .env, then restart Vesper.';
  if (provider === 'compatible' && !process.env.COMPAT_LLM_BASE_URL) return 'Add your compatible API base URL to .env, then restart Vesper.';
  return '';
}

async function readUpstreamText(response, provider) {
  const maxResponseBytes = 1_048_576;
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > maxResponseBytes) {
    throw Object.assign(new Error('The model response was too large.'), { status: 502 });
  }
  const reader = response.body?.getReader();
  if (!reader) throw Object.assign(new Error('The model returned an empty response.'), { status: 502 });
  const chunks = [];
  let responseSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    responseSize += value.byteLength;
    if (responseSize > maxResponseBytes) {
      await reader.cancel().catch(() => {});
      throw Object.assign(new Error('The model response was too large.'), { status: 502 });
    }
    chunks.push(Buffer.from(value));
  }
  let result;
  try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { result = {}; }
  if (!response.ok) {
    const status = response.status >= 500 ? 502 : response.status;
    throw Object.assign(new Error(`${provider} rejected the request (HTTP ${response.status}). Check the selected model and provider settings.`), { status });
  }
  if (provider === 'openai') {
    return Array.isArray(result.output)
      ? result.output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
        .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
        .map((part) => part.text).join('\n').trim()
      : '';
  }
  if (provider === 'ollama') return typeof result?.message?.content === 'string' ? result.message.content.trim() : '';
  const content = result?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : Array.isArray(content) ? content.map((item) => item.text || '').join('').trim() : '';
}

async function handleChat(req, res) {
  let body;
  try { body = await readBody(req); }
  catch (error) {
    sendJson(res, 400, { error: error.message === 'Message payload is too large.' ? error.message : 'Could not read the chat message.' });
    return;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    sendJson(res, 400, { error: 'The chat request must be an object.' });
    return;
  }

  const provider = ['openai', 'ollama', 'compatible'].includes(body.provider) ? body.provider : 'ollama';
  const config = providerConfig(provider);
  const model = typeof body.model === 'string' ? body.model.trim() : config.model;
  const configError = modelErrorMessage(provider, model);
  if (configError) { sendJson(res, 503, { error: configError }); return; }

  const messages = normalizeMessages(body.messages);
  if (!messages) { sendJson(res, 400, { error: 'Send a message to start chatting.' }); return; }
  const currentFocus = personalityModes[body.personality] || personalityModes.playful;
  const instructions = `${personality}\n\nCurrent conversational focus: ${currentFocus}`;

  let endpoint;
  let headers = { 'Content-Type': 'application/json' };
  let payload;
  if (provider === 'openai') {
    endpoint = 'https://api.openai.com/v1/responses';
    headers.Authorization = `Bearer ${process.env.OPENAI_API_KEY}`;
    payload = { model, instructions, input: messages };
  } else if (provider === 'ollama') {
    const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    endpoint = `${base}/api/chat`;
    payload = { model, stream: false, messages: [{ role: 'system', content: instructions }, ...messages] };
  } else {
    const base = process.env.COMPAT_LLM_BASE_URL.replace(/\/+$/, '');
    endpoint = `${base}/chat/completions`;
    if (process.env.COMPAT_LLM_API_KEY) headers.Authorization = `Bearer ${process.env.COMPAT_LLM_API_KEY}`;
    payload = { model, messages: [{ role: 'system', content: instructions }, ...messages], stream: false };
  }

  try {
    const upstream = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000) });
    const reply = await readUpstreamText(upstream, provider);
    if (!reply) { sendJson(res, 502, { error: 'The model returned no text. Try again.' }); return; }
    sendJson(res, 200, { reply });
  } catch (error) {
    if (error?.status) { sendJson(res, error.status, { error: error.message }); return; }
    const message = provider === 'ollama'
      ? 'Could not reach Ollama. Open Ollama and make sure the selected model is installed.'
      : 'Could not reach the model service. Check the provider settings and your connection.';
    sendJson(res, 502, { error: message });
  }
}

function mimeType(file) {
  const extension = extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.vrm': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' })[extension] || 'application/octet-stream';
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const expectedProtocol = TRUST_PROXY
      ? `${String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()}:`
      : 'http:';
    const requestHost = requestHostname(req);
    if (!PUBLIC_MODE && !LOCAL_HOSTS.has(requestHost)) return false;
    return parsed.host === req.headers.host?.toLowerCase() && parsed.protocol === expectedProtocol;
  } catch { return false; }
}

function requestHostname(req) {
  try { return new URL(`http://${req.headers.host || ''}`).hostname.toLowerCase().replace(/^\[|\]$/g, ''); }
  catch { return ''; }
}

function sessionSignature(expiry) {
  return createHmac('sha256', SESSION_SECRET).update(`vesper-session:${expiry}`).digest('hex');
}

function isAuthenticated(req) {
  if (!ACCESS_PASSWORD) return true;
  const token = req.headers.cookie?.match(/(?:^|;\s*)vesper_session=([^;]*)/)?.[1] || '';
  const [expiry, signature] = token.split('.', 2);
  const expirySeconds = Number.parseInt(expiry, 36);
  if (!Number.isSafeInteger(expirySeconds) || expirySeconds <= Math.floor(Date.now() / 1000) || !signature) return false;
  const expected = sessionSignature(expiry);
  const suppliedBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function sessionCookie(value, maxAge) {
  const secure = PUBLIC_MODE ? '; Secure' : '';
  return `vesper_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function attemptKey(req) {
  const forwarded = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function loginLimit(req) {
  const now = Date.now();
  const key = attemptKey(req);
  for (const [oldKey, value] of loginAttempts) {
    if (now - value.startedAt > 15 * 60 * 1000) loginAttempts.delete(oldKey);
  }
  if (loginAttempts.size > 1000) loginAttempts.delete(loginAttempts.keys().next().value);
  const recent = loginAttempts.get(key);
  if (!recent || now - recent.startedAt > 15 * 60 * 1000) return { key, attempts: 0, limited: false };
  return { key, attempts: recent.attempts, limited: recent.attempts >= 8 };
}

function chatRateLimit(req) {
  const now = Date.now();
  const key = attemptKey(req);
  const recent = chatAttempts.get(key);
  if (!recent || now - recent.startedAt >= 60_000) {
    chatAttempts.set(key, { startedAt: now, count: 1 });
    if (chatAttempts.size > 1000) chatAttempts.delete(chatAttempts.keys().next().value);
    return false;
  }
  recent.count += 1;
  return recent.count > 8;
}

async function serveFile(pathname, res, headOnly = false) {
  const mapped = staticFiles.get(pathname);
  let filePath;
  if (mapped) {
    filePath = join(ROOT, mapped[0]);
  } else if (pathname.startsWith('/models/')) {
    const relative = normalize(pathname.slice(1));
    filePath = resolve(ROOT, relative);
    const modelsRoot = resolve(ROOT, 'models') + sep;
    if (!filePath.startsWith(modelsRoot)) { res.writeHead(403); res.end('Forbidden'); return; }
  } else if (pathname.startsWith('/vendor/')) {
    const relative = normalize(pathname.slice(1));
    filePath = resolve(ROOT, relative);
    const vendorRoot = resolve(ROOT, 'vendor') + sep;
    if (!filePath.startsWith(vendorRoot)) { res.writeHead(403); res.end('Forbidden'); return; }
  } else {
    res.writeHead(404); res.end('Not found'); return;
  }

  try {
    const safePath = await realpath(filePath);
    if (!safePath.startsWith(`${REAL_ROOT}${sep}`)) { res.writeHead(403); res.end('Forbidden'); return; }
    const info = await stat(safePath);
    if (!info.isFile()) throw new Error('Not a file');
    const headers = { 'Content-Type': mapped?.[1] || mimeType(safePath), 'Content-Length': info.size, 'Cache-Control': 'private, no-store' };
    if (pathname === '/Vesper-Setup.exe') {
      headers['Content-Disposition'] = 'attachment; filename="Vesper-Setup.exe"';
      headers['Cache-Control'] = 'private, no-store';
    }
    res.writeHead(200, headers);
    if (headOnly) res.end();
    else {
      const stream = createReadStream(safePath);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    }
  } catch { res.writeHead(404); res.end('Not found'); }
}

const server = createServer(async (req, res) => {
  applySecurityHeaders(req, res);
  let url;
  try { url = new URL(req.url || '/', 'http://vesper.invalid'); }
  catch {
    sendJson(res, 400, { error: 'The request address is malformed.' });
    return;
  }
  if (!PUBLIC_MODE && !LOCAL_HOSTS.has(requestHostname(req))) {
    res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Use Vesper through localhost.');
    return;
  }
  const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (PUBLIC_MODE && TRUST_PROXY && url.pathname !== '/api/health' && forwardedProtocol !== 'https') {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Vesper requires HTTPS through its trusted proxy.');
    return;
  }
  const isAuthRoute = ['/api/auth', '/api/login', '/api/logout'].includes(url.pathname);
  if (ACCESS_PASSWORD && !isAuthRoute && url.pathname !== '/api/health' && !isAuthenticated(req)
    && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/models/'))) {
    sendJson(res, 401, { error: 'Unlock Vesper to continue.' });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
  } else if (req.method === 'GET' && url.pathname === '/api/auth') {
    sendJson(res, 200, { required: Boolean(ACCESS_PASSWORD), authenticated: isAuthenticated(req), downloadAvailable: await installerAvailable() });
  } else if (req.method === 'POST' && url.pathname === '/api/login') {
    if (!sameOrigin(req)) { sendJson(res, 403, { error: 'Sign in from the Vesper site.' }); return; }
    const limit = loginLimit(req);
    if (limit.limited) {
      res.writeHead(429, { 'Retry-After': '900', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Too many tries. Wait 15 minutes, then try again.' }));
      return;
    }
    let body;
    try { body = await readBody(req); }
    catch { sendJson(res, 400, { error: 'Could not read the password.' }); return; }
    const password = typeof body?.password === 'string' ? body.password : '';
    if (password.length > 256) { sendJson(res, 400, { error: 'Password is too long.' }); return; }
    const supplied = createHash('sha256').update(password).digest();
    const expected = createHash('sha256').update(ACCESS_PASSWORD).digest();
    if (!ACCESS_PASSWORD || !timingSafeEqual(supplied, expected)) {
      const previous = loginAttempts.get(limit.key);
      const startedAt = previous && Date.now() - previous.startedAt <= 15 * 60 * 1000 ? previous.startedAt : Date.now();
      loginAttempts.set(limit.key, { startedAt, attempts: limit.attempts + 1 });
      sendJson(res, 401, { error: 'That password did not unlock Vesper.' });
      return;
    }
    loginAttempts.delete(limit.key);
    const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const expiryTag = expiry.toString(36);
    res.setHeader('Set-Cookie', sessionCookie(`${expiryTag}.${sessionSignature(expiryTag)}`, SESSION_SECONDS));
    sendJson(res, 200, { ok: true });
  } else if (req.method === 'POST' && url.pathname === '/api/logout') {
    if (!sameOrigin(req)) { sendJson(res, 403, { error: 'Sign out from the Vesper site.' }); return; }
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    sendJson(res, 200, { ok: true });
  } else if (req.method === 'GET' && url.pathname === '/api/settings') {
    sendJson(res, 200, await publicSettings());
  } else if (req.method === 'POST' && url.pathname === '/api/open-model-folder') {
    if (!sameOrigin(req)) {
      sendJson(res, 403, { error: 'This action is only available from the local site.' });
    } else if (process.platform !== 'win32') {
      sendJson(res, 501, { error: 'Open the models folder from your file manager.' });
    } else {
      try {
        const explorer = spawn('explorer.exe', [join(ROOT, 'models')], { detached: true, stdio: 'ignore' });
        explorer.unref();
        sendJson(res, 200, { ok: true });
      } catch { sendJson(res, 500, { error: 'Could not open the models folder.' }); }
    }
  } else if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (!sameOrigin(req)) sendJson(res, 403, { error: 'This action is only available from the Vesper site.' });
    else if (PUBLIC_MODE && chatRateLimit(req)) sendJson(res, 429, { error: 'A few too many messages in a minute. Wait a moment, then try again.' });
    else if (PUBLIC_MODE && activePublicChats >= MAX_PUBLIC_CHAT_CONCURRENCY) sendJson(res, 429, { error: 'Vesper is busy right now. Try again in a moment.' });
    else {
      if (PUBLIC_MODE) activePublicChats += 1;
      try { await handleChat(req, res); }
      finally { if (PUBLIC_MODE) activePublicChats -= 1; }
    }
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { sendJson(res, 400, { error: 'The requested path is malformed.' }); return; }
    await serveFile(pathname, res, req.method === 'HEAD');
  } else {
    res.writeHead(405, { Allow: 'GET, POST' }); res.end('Method not allowed');
  }
});

server.headersTimeout = 15_000;
server.requestTimeout = 135_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;
server.maxRequestsPerSocket = 100;

server.listen(PORT, HOST, () => console.log(`Vesper is running at http://${HOST}:${PORT}`));
