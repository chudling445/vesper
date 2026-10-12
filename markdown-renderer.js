const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function safeLinkTarget(value) {
  const href = String(value || '').trim();
  if (href.includes('\\')) return '';
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(href) && !/^\/\//.test(href)) return href;
  return '';
}

function inlineMarkdown(value) {
  const tokens = [];
  const protect = (html) => {
    const token = `\uE000${tokens.length}\uE001`;
    tokens.push(html);
    return token;
  };
  let text = String(value);

  text = text.replace(/`([^`\n]+)`/g, (_, code) => protect(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label, rawHref) => {
    const href = safeLinkTarget(rawHref);
    if (!href) return label;
    const external = /^https?:\/\//i.test(href);
    return protect(`<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>`);
  });
  text = escapeHtml(text);
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_(?=$|[^_])/g, '$1<em>$2</em>');
  return text.replace(/\uE000(\d+)\uE001/g, (_, index) => tokens[Number(index)] || '');
}

function codeBlock(code, language, index) {
  const label = /^[a-z0-9+#.-]{1,20}$/i.test(language.trim()) ? language.trim().toUpperCase() : 'CODE';
  return `<div class="markdown-code-block"><div class="markdown-code-toolbar"><span>${escapeHtml(label)}</span><button type="button" data-copy-code="${index}" aria-label="Copy code block ${index + 1}">COPY CODE</button></div><pre><code data-code-index="${index}">${escapeHtml(code.replace(/\n$/, ''))}</code></pre></div>`;
}

/** Render a conservative Markdown subset. Raw HTML is always escaped. */
export function renderMarkdown(content) {
  const codeBlocks = [];
  const source = String(content || '').replace(/```([^\r\n`]*)\r?\n([\s\S]*?)```/g, (_, language, code) => {
    const index = codeBlocks.length;
    codeBlocks.push(codeBlock(code, language, index));
    return `\uE100${index}\uE101`;
  });
  const output = [];
  let paragraph = [];
  let listType = '';
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = '';
  };
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    const codeMatch = line.match(/^\uE100(\d+)\uE101$/);
    if (codeMatch) {
      flushParagraph(); closeList(); output.push(codeBlocks[Number(codeMatch[1])] || '');
      continue;
    }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { flushParagraph(); closeList(); const level = heading[1].length; output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue; }
    if (/^\s*(---+|\*\s*\*\s*\*|___+)\s*$/.test(line)) { flushParagraph(); closeList(); output.push('<hr>'); continue; }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) { flushParagraph(); closeList(); output.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`); continue; }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? 'ul' : 'ol';
      if (listType !== nextType) { closeList(); listType = nextType; output.push(`<${listType}>`); }
      output.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  flushParagraph(); closeList();
  const html = output.join('');
  return `<div class="markdown-body">${html || '<p></p>'}</div>`;
}
