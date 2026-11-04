/**
 * ui-kit/vesper-ui.js — the shared Vesper component kit.
 *
 * TileCard, MetricBadge, DataChart, and TerminalBox are the four primitives
 * every module renders through. Using them everywhere is what makes the
 * Dashboard, Chat Hub, 3D Studio, PC Builder, Markets, Health, and Arcade read
 * as one product: identical borders, radii, shadows, and hover states, all
 * sourced from tokens.css.
 *
 * Every factory returns a detached HTMLElement so callers can compose freely.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an element with attributes and children in one call. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node && key !== 'style') node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Format a number for display with grouped digits and optional decimals. */
export function formatNumber(value, { decimals = 0, compact = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (compact && Math.abs(number) >= 1000) {
    return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(number);
  }
  return number.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Format rupees with an optional compact form for dense tiles. */
export function formatINR(value, { compact = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (compact && Math.abs(number) >= 10_000) {
    return `₹${new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(number)}`;
  }
  return `₹${Math.round(number).toLocaleString('en-IN')}`;
}

/**
 * A standardized glassmorphic panel. Every view lives inside one of these.
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.kicker]
 * @param {Node|Node[]} [options.body]
 * @param {Node[]} [options.actions]
 * @param {boolean} [options.interactive] adds a drag grip and cursor
 * @param {boolean} [options.flush] removes body padding (for canvas/terminal)
 * @param {string} [options.span] grid-column CSS value
 * @param {string} [options.id]
 */
export function TileCard({ title = 'Untitled', kicker = '', body = [], actions = [], interactive = false, flush = false, span = '', id = '' } = {}) {
  const head = el('div', { class: 'vt-tile__head' }, [
    interactive ? el('span', { class: 'vt-tile__grip', text: '⠿', 'aria-hidden': 'true' }) : null,
    el('div', { class: 'vt-tile__head-copy' }, [
      kicker ? el('span', { class: 'vt-tile__kicker', text: kicker }) : null,
      el('span', { class: 'vt-tile__title', text: title }),
    ]),
    actions.length ? el('div', { class: 'vt-tile__actions' }, actions) : null,
  ]);
  const tile = el('section', {
    class: `vt-tile${interactive ? ' vt-tile--interactive' : ''}${flush ? ' vt-tile--flush' : ''}`,
    id: id || null,
    'aria-label': title,
  }, [head, el('div', { class: 'vt-tile__body' }, body)]);
  if (span) tile.style.gridColumn = span;
  return tile;
}

/**
 * A compact label/value/unit badge with an optional delta and tone.
 * @param {object} options
 * @param {string} options.label
 * @param {string|number} options.value
 * @param {string} [options.unit]
 * @param {string} [options.delta]
 * @param {'good'|'bad'|'warn'|''} [options.tone]
 * @param {string} [options.title] tooltip
 */
export function MetricBadge({ label = '', value = '—', unit = '', delta = '', tone = '', title = '' } = {}) {
  return el('div', { class: `vt-metric${tone ? ` vt-metric--${tone}` : ''}`, title: title || null }, [
    el('span', { class: 'vt-metric__label', text: label }),
    el('span', { class: 'vt-metric__value' }, [
      document.createTextNode(String(value)),
      unit ? el('span', { class: 'vt-metric__unit', text: unit }) : null,
    ]),
    delta ? el('span', { class: 'vt-metric__delta', text: delta }) : null,
  ]);
}

/** Read a token's computed value so canvas drawing matches the active theme. */
export function readToken(name, fallback = '#888') {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  } catch { return fallback; }
}

/** Map a value series to plot coordinates inside a padded box. */
export function projectSeries(values, { width, height, padding = 14, min = null, max = null } = {}) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return [];
  const low = min ?? Math.min(...finite);
  const high = max ?? Math.max(...finite);
  const span = high - low || 1;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  return values.map((value, index) => ({
    x: padding + (values.length === 1 ? innerW / 2 : (index / (values.length - 1)) * innerW),
    y: padding + innerH - (Number.isFinite(value) ? ((value - low) / span) * innerH : 0),
    value,
    defined: Number.isFinite(value),
  }));
}

/**
 * A themed canvas line/area chart. Redraws on theme change and resize.
 * @param {object} options
 * @param {Array<{name:string,color?:string,values:number[],fill?:boolean}>} options.series
 * @param {string[]} [options.labels]
 * @param {number} [options.height]
 * @param {string} [options.title]
 * @param {string} [options.valueFormat] 'number' | 'inr'
 */
export function DataChart({ series = [], labels = [], height = 190, title = '', valueFormat = 'number' } = {}) {
  const canvas = el('canvas', { class: 'vt-chart__canvas', height, 'aria-label': title || 'Data chart', role: 'img' });
  const format = (value) => (valueFormat === 'inr' ? formatINR(value, { compact: true }) : formatNumber(value, { decimals: 0, compact: true }));
  const legend = el('div', { class: 'vt-chart__legend' });

  function draw() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cssWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 480;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);

    const bg = readToken('--bg-primary', '#111');
    const border = readToken('--border', '#333');
    const muted = readToken('--text-secondary', '#888');
    const accent = readToken('--accent', '#38bdf8');

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cssWidth - 1, height - 1);

    const finiteValues = series.flatMap((line) => line.values).filter((value) => Number.isFinite(value));
    const min = finiteValues.length ? Math.min(...finiteValues) : 0;
    const max = finiteValues.length ? Math.max(...finiteValues) : 1;

    // Horizontal gridlines with min/max value annotations.
    ctx.strokeStyle = border;
    ctx.globalAlpha = .5;
    for (let i = 0; i <= 4; i += 1) {
      const y = 14 + ((height - 28) * i) / 4;
      ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(cssWidth - 14, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted;
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(format(max), 16, 12);
    ctx.fillText(format(min), 16, height - 4);
    if (labels.length) {
      ctx.fillText(labels[0], 16, height - 16);
      const lastWidth = ctx.measureText(labels.at(-1)).width;
      ctx.fillText(labels.at(-1), cssWidth - lastWidth - 16, height - 16);
    }

    series.forEach((line, index) => {
      const color = line.color || [accent, readToken('--tone-good', '#7fd6a8'), readToken('--tone-warn', '#f0c274')][index % 3];
      const points = projectSeries(line.values, { width: cssWidth, height, min, max });
      if (!points.length) return;
      if (line.fill !== false) {
        const gradient = ctx.createLinearGradient(0, 14, 0, height - 14);
        gradient.addColorStop(0, hexToRgba(color, .26));
        gradient.addColorStop(1, hexToRgba(color, 0));
        ctx.beginPath();
        ctx.moveTo(points[0].x, height - 14);
        for (const point of points) ctx.lineTo(point.x, point.y);
        ctx.lineTo(points.at(-1).x, height - 14);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      points.forEach((point, pointIndex) => (pointIndex ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      ctx.stroke();
      // Latest value marker.
      const last = points.at(-1);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
    ctx.fillStyle = bg;
  }

  legend.replaceChildren(...series.map((line, index) => el('span', { class: 'vt-chart__key' }, [
    el('span', { class: 'vt-chart__swatch' }),
    document.createTextNode(line.name || `Series ${index + 1}`),
  ])).map((node, index) => {
    const color = series[index].color || [readToken('--accent'), readToken('--tone-good'), readToken('--tone-warn')][index % 3];
    node.querySelector('.vt-chart__swatch').style.background = color;
    return node;
  }));

  const card = el('div', { class: 'vt-chart' }, [canvas, legend]);
  const redraw = () => requestAnimationFrame(draw);
  if (typeof ResizeObserver === 'function') new ResizeObserver(redraw).observe(card);
  window.addEventListener('vesper-palette-change', redraw);
  window.addEventListener('resize', redraw);
  requestAnimationFrame(draw);
  card.redraw = redraw;
  return card;
}

function hexToRgba(color, alpha) {
  const value = String(color).trim();
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return value;
  const int = parseInt(match[1], 16);
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

/**
 * A themed terminal/log surface for sync logs, solver traces, and diagnostics.
 * @param {object} options
 * @param {string} [options.title]
 * @param {Array<{text:string,tone?:string,prompt?:boolean}>|string[]} [options.lines]
 * @param {number} [options.maxLines]
 */
export function TerminalBox({ title = 'log', lines = [], maxLines = 200 } = {}) {
  const scroll = el('div', { class: 'vt-term__scroll', role: 'log', 'aria-live': 'polite' });
  const box = el('div', { class: 'vt-term' }, [
    el('div', { class: 'vt-term__bar' }, [el('span', { class: 'vt-term__dot' }), document.createTextNode(title)]),
    scroll,
  ]);
  box.write = (entry) => {
    const line = typeof entry === 'string' ? { text: entry } : entry;
    scroll.append(el('span', { class: `vt-term__line${line.tone ? ` vt-term__line--${line.tone}` : ''}` }, [
      line.prompt !== false ? el('span', { class: 'vt-term__prompt', text: '›' }) : null,
      document.createTextNode(line.text || ''),
    ]));
    while (scroll.childElementCount > maxLines) scroll.firstElementChild.remove();
    scroll.scrollTop = scroll.scrollHeight;
  };
  for (const line of lines) box.write(line);
  return box;
}

export const VesperUI = { el, TileCard, MetricBadge, DataChart, TerminalBox, formatNumber, formatINR, readToken, projectSeries };
