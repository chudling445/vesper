export function workspaceSnapshot({ messages = [], settings = {}, route = location.pathname } = {}) {
  return { exportedAt: new Date().toISOString(), route, settings, messages: messages.map(({ role, content, pinned }) => ({ role, content, ...(pinned ? { pinned: true } : {}) })) };
}

export function toMarkdown(snapshot) {
  const lines = [`# Vesper workspace export`, ``, `- Exported: ${snapshot.exportedAt}`, `- Route: ${snapshot.route}`, ``];
  for (const message of snapshot.messages) lines.push(`## ${message.role === 'assistant' ? 'Vesper' : 'You'}${message.pinned ? ' · pinned' : ''}`, ``, message.content, ``);
  return lines.join('\n');
}

export function toCsv(snapshot) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""').replaceAll(/\r?\n/g, ' ')}"`;
  return ['role,content,pinned', ...snapshot.messages.map((message) => [message.role, message.content, Boolean(message.pinned)].map(quote).join(','))].join('\n');
}

export function downloadText(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); const result = document.execCommand('copy'); area.remove(); if (!result) throw new Error('Clipboard is unavailable'); return true;
}

export function shareSummary(snapshot) {
  const latest = snapshot.messages.slice(-6).map((message) => `${message.role === 'assistant' ? 'Vesper' : 'You'}: ${message.content}`).join('\n\n');
  return `Vesper conversation summary\n${new Date(snapshot.exportedAt).toLocaleString()}\n\n${latest || 'No messages yet.'}`;
}
