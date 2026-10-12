/*
 * Disposable runner for the Code Lab. The server serves this file with its own
 * CSP: no network connections, no imports, no child workers, and eval allowed
 * only so this in-memory editor source can execute. A parent timeout terminates
 * runaway loops and never reuses this worker between runs.
 */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const MAX_LOGS = 60;
const MAX_TEXT = 4_000;

function stringify(value) {
  if (typeof value === 'string') return value.slice(0, MAX_TEXT);
  try {
    const serialized = JSON.stringify(value);
    return (serialized === undefined ? String(value) : serialized).slice(0, MAX_TEXT);
  } catch {
    try { return String(value).slice(0, MAX_TEXT); }
    catch { return '[unprintable value]'; }
  }
}

self.addEventListener('message', async (event) => {
  const logs = [];
  const write = (level, args) => {
    if (logs.length >= MAX_LOGS) return;
    logs.push({ level, text: args.map(stringify).join(' ').slice(0, MAX_TEXT) });
  };
  const sandboxConsole = Object.freeze({
    log: (...args) => write('log', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
    debug: (...args) => write('log', args),
  });
  try {
    try { Object.defineProperty(globalThis, 'console', { value: sandboxConsole, configurable: false, writable: false }); }
    catch { /* The console argument below remains the isolated output channel. */ }
    const run = new AsyncFunction('console', `"use strict";\n${String(event.data?.code || '').slice(0, 20_000)}`);
    const result = await run(sandboxConsole);
    self.postMessage({ logs, result: result === undefined ? '' : `↳ ${stringify(result)}` });
  } catch (error) {
    self.postMessage({ logs, error: `${error?.name || 'Error'}: ${error?.message || 'The code could not be evaluated.'}`.slice(0, MAX_TEXT) });
  }
});
