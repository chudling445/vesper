const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const encoder = new TextEncoder();

function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ''));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function parsePngCard(bytes) {
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) throw new Error('This PNG is not a character card image.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) break;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'tEXt') {
      const separator = data.indexOf(0);
      if (separator > 0) {
        const key = new TextDecoder().decode(data.subarray(0, separator)).toLowerCase();
        if (key === 'chara' || key === 'ccv3') {
          const jsonBytes = decodeBase64(new TextDecoder().decode(data.subarray(separator + 1)));
          return JSON.parse(new TextDecoder().decode(jsonBytes));
        }
      }
    }
    offset += length + 12;
    if (type === 'IEND') break;
  }
  throw new Error('No SillyTavern or Character Card metadata was found in this PNG.');
}

export async function readCharacterCard(file) {
  if (file.size > 5_000_000) throw new Error('Character card files must be smaller than 5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw;
  if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') raw = JSON.parse(new TextDecoder().decode(bytes));
  else raw = parsePngCard(bytes);
  const data = raw && raw.data && typeof raw.data === 'object' ? raw.data : raw;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !String(data.name || data.char_name || '').trim()) {
    throw new Error('The character card is missing a valid name.');
  }
  return {
    spec: raw.spec || 'chara_card_v2',
    spec_version: raw.spec_version || '2.0',
    name: String(data.name || data.char_name).slice(0, 100),
    description: String(data.description || data.char_persona || '').slice(0, 12_000),
    personality: String(data.personality || '').slice(0, 6000),
    scenario: String(data.scenario || data.world_scenario || '').slice(0, 6000),
    first_mes: String(data.first_mes || data.char_greeting || '').slice(0, 3000),
    mes_example: String(data.mes_example || data.example_dialogue || '').slice(0, 6000),
    creator_notes: String(data.creator_notes || '').slice(0, 3000),
    system_prompt: String(data.system_prompt || '').slice(0, 6000),
    post_history_instructions: String(data.post_history_instructions || '').slice(0, 3000),
    alternate_greetings: Array.isArray(data.alternate_greetings) ? data.alternate_greetings.map((item) => String(item).slice(0, 3000)).slice(0, 12) : [],
    character_book: normalizeCharacterBook(data.character_book),
    tags: Array.isArray(data.tags) ? data.tags.map((item) => String(item).slice(0, 80)).slice(0, 30) : [],
  };
}

function normalizeCharacterBook(book) {
  if (!book || typeof book !== 'object') return null;
  const entries = Array.isArray(book.entries) ? book.entries : Object.values(book.entries || {});
  return {
    name: String(book.name || '').slice(0, 100),
    description: String(book.description || '').slice(0, 1000),
    entries: entries.slice(0, 100).map((entry) => ({
      keys: Array.isArray(entry && entry.keys) ? entry.keys.map((key) => String(key).slice(0, 100)).slice(0, 12) : [],
      content: String(entry && entry.content || '').slice(0, 1800),
      disabled: entry && entry.disabled === true,
      enabled: entry && entry.enabled !== false,
      selective: entry && entry.selective === true,
      constant: entry && entry.constant === true,
    })).filter((entry) => entry.content),
  };
}

function matchingLore(card, query) {
  const entries = Array.isArray(card && card.character_book && card.character_book.entries) ? card.character_book.entries : [];
  const text = String(query).toLocaleLowerCase();
  return entries.filter((entry) => entry && entry.disabled !== true && entry.enabled !== false && (entry.constant === true || (Array.isArray(entry.keys) && entry.keys.some((key) => key && text.includes(String(key).toLocaleLowerCase())))))
    .slice(0, 4).map((entry) => String(entry.content || '').slice(0, 900));
}

export function characterCardPrompt(card, query = '') {
  if (!card) return '';
  const parts = [card.system_prompt, 'Character card for ' + card.name + ':', card.description, card.personality ? 'Personality: ' + card.personality : '', card.scenario ? 'Scenario: ' + card.scenario : '', card.mes_example ? 'Example dialogue:\n' + card.mes_example : '', card.post_history_instructions ? 'Additional character guidance: ' + card.post_history_instructions : '', card.first_mes ? 'Opening greeting example: ' + card.first_mes : ''].filter(Boolean);
  const lore = matchingLore(card, query);
  if (lore.length) parts.push('Relevant character lorebook entries (reference context):\n' + lore.map((text, index) => '[Lore ' + (index + 1) + '] ' + text).join('\n'));
  return parts.join('\n\n').slice(0, 9000);
}

export function exportCharacterJson(card) {
  return { spec: 'chara_card_v2', spec_version: '2.0', data: { ...card } };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = encoder.encode(type);
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(typeBytes, 4);
  bytes.set(data, 8);
  view.setUint32(8 + data.length, crc32(bytes.subarray(4, 8 + data.length)));
  return bytes;
}

function joinBytes(parts) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function encodeBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export async function downloadCharacterPng(card) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, '#292343'); gradient.addColorStop(1, '#b86e9a');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '600 46px Georgia'; ctx.fillText(card.name.slice(0, 24), 256, 270, 440);
  ctx.font = '24px sans-serif'; ctx.fillStyle = '#f4cfea'; ctx.fillText('VESPER CHARACTER CARD', 256, 330);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the character card image.');
  const png = new Uint8Array(await blob.arrayBuffer());
  const encoded = encodeBase64(encoder.encode(JSON.stringify(exportCharacterJson(card))));
  const cardData = encoder.encode('chara\0' + encoded);
  const textChunk = pngChunk('tEXt', cardData);
  const iend = png.length - 12;
  const result = joinBytes([png.subarray(0, iend), textChunk, png.subarray(iend)]);
  const url = URL.createObjectURL(new Blob([result], { type: 'image/png' }));
  const link = document.createElement('a');
  link.href = url; link.download = card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-card.png';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
