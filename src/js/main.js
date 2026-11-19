import { REGISTER } from './register.js';
import { resolveRecord } from './gate.js';
import { createMarket, fmt } from './market.js';
import { isReduced, initReveal, initScrollChrome, initParallax, initSpotlight, countTo } from './motion.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const BRAND_LOGO = 'assets/logo-128.png';
const TILE_PAIRS = [['--c-ring-3', '--c-ring-6'], ['--c-ring-2', '--c-ring-4'], ['--c-ring-5', '--c-darkest'], ['--c-ring-7', '--c-ring-6'], ['--c-ring-1', '--c-ring-3']];

/* ---------- copy to clipboard (CA + RPC) ---------- */
function initCopy() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn || !btn.dataset.copy) return;
    const value = btn.dataset.copy;
    let ok = false;
    try { await navigator.clipboard.writeText(value); ok = true; } catch {
      const t = el('textarea'); t.value = value; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      t.remove();
    }
    const fb = btn.querySelector('[data-feedback]');
    if (fb) fb.textContent = ok ? 'Copied' : 'Select and copy';
    btn.classList.toggle('is-copied', ok);
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { if (fb) fb.textContent = 'Copy'; btn.classList.remove('is-copied'); }, 1400);
    const toast = $('#toast');
    if (toast && ok) {
      toast.hidden = true; void toast.offsetWidth; toast.hidden = false;
      clearTimeout(toast._t);
      toast._t = setTimeout(() => { toast.hidden = true; }, 1400);
    }
  });
}

/* ---------- hexagon field (rotation band), built from the logo's own geometry + ring colours ---------- */
function initHexField() {
  const host = $('[data-hexfield]');
  if (!host) return;
  const NS = 'http://www.w3.org/2000/svg';
  const R = 70, d = Math.sqrt(3) * R * 1.06;
  const cells = [[-90, '--c-ring-1'], [-30, '--c-ring-3'], [30, '--c-ring-6'], [90, '--c-ring-7'], [150, '--c-ring-5'], [210, '--c-ring-2'], [null, '--c-ring-4']];
  const poly = (r) => Array.from({ length: 6 }, (_, k) => `${(r * Math.cos((Math.PI / 3) * k)).toFixed(2)},${(r * Math.sin((Math.PI / 3) * k)).toFixed(2)}`).join(' ');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-240 -230 480 460');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Seven hexagon cells');
  const gs = cells.map(([a, v]) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'hx');
    const x = a == null ? 0 : d * Math.cos((a * Math.PI) / 180), y = a == null ? 0 : d * Math.sin((a * Math.PI) / 180);
    g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    g.style.setProperty('--cell', `var(${v})`);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill-rule', 'evenodd');
    p.setAttribute('d', `M${poly(R)}Z M${poly(R * 0.5)}Z`);
    g.appendChild(p);
    svg.appendChild(g);
    return g;
  });
  host.appendChild(svg);
  const seats = [...document.querySelectorAll('[data-seats] li')];
  let t = 0;
  const paint = () => {
    const lead = new Set([t % 7, (t + 2) % 7, (t + 4) % 7]);
    gs.forEach((g, i) => g.classList.toggle('lead', lead.has(i)));
    seats.forEach((s, i) => {
      const on = i === t % 3;
      if (on && !s.classList.contains('on') && !isReduced()) { s.classList.remove('hub-roll'); void s.offsetWidth; s.classList.add('hub-roll'); }
      s.classList.toggle('on', on);
    });
  };
  paint();
  if (isReduced()) return;
  let timer = setInterval(() => { t++; paint(); }, 1100);
  document.addEventListener('visibilitychange', () => {
    clearInterval(timer);
    if (!document.hidden) timer = setInterval(() => { t++; paint(); }, 1100);
  });
}

/* ---------- market board ---------- */
function makeLogo(row, extra = []) {
  const cands = [...row.logos, ...extra];
  const tile = () => {
    const t = el('span', 'tile', (row.symbol || '?').trim().charAt(0).toUpperCase() || '?');
    let h = 0; for (const c of row.address || row.symbol || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const [a, b] = TILE_PAIRS[h % TILE_PAIRS.length];
    t.style.setProperty('--tile-a', `var(${a})`); t.style.setProperty('--tile-b', `var(${b})`);
    t.setAttribute('aria-hidden', 'true');
    return t;
  };
  if (!cands.length) return tile();
  const img = el('img', 'logo');
  img.width = 40; img.height = 40; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
  let i = 0;
  img.onerror = () => { i++; if (i < cands.length) img.src = cands[i]; else img.replaceWith(tile()); };
  img.src = cands[0];
  return img;
}
const COLS = [['price', 'Price', fmt.price], ['change', '24h', (v) => (v == null ? '—' : (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + fmt.change(v))], ['volume', 'Volume', fmt.compact], ['liquidity', 'Liquidity', fmt.compact]];

function setCell(cell, key, value, format) {
  const prev = cell._v;
  cell._v = value;
  if (key === 'change') cell.classList.toggle('up', value > 0), cell.classList.toggle('dn', value < 0);
  if (value == null) { cell.textContent = '—'; return; }
  countTo(cell, prev, value, format, (dir) => {
    cell.classList.remove('flash-up', 'flash-dn');
    void cell.offsetWidth;
    cell.classList.add(dir === 'up' ? 'flash-up' : 'flash-dn');
  });
}
function fillRow(li, row) {
  COLS.forEach(([key, label, f], i) => {
    const cell = li.children[i + 1];
    if (!cell.classList.contains('live')) { cell.className = 'cell live'; cell.dataset.label = label; cell.textContent = ''; cell._v = null; }
    setCell(cell, key, row[key], f);
  });
}
function buildRow(row, rank, index) {
  const li = el('li', 'row in');
  li.dataset.key = row.key; li.dataset.spot = ''; li.style.setProperty('--i', String(index));
  const tok = el('div', 'cell cell--tok');
  const rk = el('span', 'rank', String(rank)); rk.dataset.rank = '';
  const tk = el('span', 'tk'); tk.append(el('b', '', row.failed ? 'Unavailable' : row.symbol), el('small', '', row.name || (row.failed ? row.address.slice(0, 4) + '…' + row.address.slice(-4) : '')));
  tok.append(rk, makeLogo(row), tk);
  li.append(tok);
  for (let i = 0; i < 4; i++) li.append(el('div', 'cell'));
  fillRow(li, row);
  if (row.url) { const a = el('a', 'row-link'); a.href = row.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', `${row.symbol} on DexScreener`); li.append(a); }
  return li;
}
function skeletonRow(i) {
  const li = el('li', 'row is-skel');
  li.setAttribute('aria-hidden', 'true');
  const tok = el('div', 'cell cell--tok');
  const tk = el('span', 'tk');
  const a = el('span', 'skel'); a.style.width = '84px'; const b = el('span', 'skel'); b.style.width = '120px'; b.style.marginTop = '6px';
  tk.append(a, b);
  tok.append(el('span', 'rank', String(i + 2)), el('span', 'skel logo-skel'), tk);
  li.append(tok);
  for (let k = 0; k < 4; k++) { const c = el('div', 'cell'); const s = el('span', 'skel'); s.style.width = '64px'; c.append(s); li.append(c); }
  return li;
}

function initBoard() {
  const board = $('#board'), note = $('#board-note'), ownLi = $('#own-row');
  const tickTrack = $('[data-ticker-track]');
  const pills = [...document.querySelectorAll('[data-status]')];
  const ca = resolveRecord('ca', REGISTER.ca);
  const skels = Array.from({ length: 10 }, (_, i) => skeletonRow(i));
  skels.forEach((s) => board.append(s));
  let ownKey = null, tickSig = '';

  const setStatus = (text, tone) => pills.forEach((p) => { p.textContent = text; p.closest('.pill').dataset.tone = tone; });
  setStatus('Connecting', 'wait');

  function paintOwn(own, phase) {
    if (ca.state !== 'stated') return; // absent / unconfirmed: placeholder stays, inert
    const tk = ownLi.querySelector('.tk');
    if (!own) {
      if (phase !== 'loading') { tk.querySelector('small').textContent = 'Pair data unavailable'; [...ownLi.querySelectorAll('.cell:not(.cell--tok)')].forEach((c) => { c.textContent = '—'; }); }
      return;
    }
    if (ownKey !== own.key) {
      ownKey = own.key;
      const tok = ownLi.querySelector('.cell--tok');
      const old = tok.querySelector('.logo, .tile');
      old.replaceWith(makeLogo(own, [BRAND_LOGO]));
      tk.querySelector('b').textContent = own.symbol && own.symbol !== '?' ? own.symbol : 'Novar';
      ownLi.querySelectorAll('a.row-link').forEach((a) => a.remove());
      if (own.url) { const a = el('a', 'row-link'); a.href = own.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.setAttribute('aria-label', 'Novar on DexScreener'); ownLi.append(a); }
    }
    tk.querySelector('small').textContent = own.name || 'Live pair';
    fillRow(ownLi, own);
  }

  function reconcile(rows) {
    const existing = new Map([...board.querySelectorAll('li[data-key]')].map((n) => [n.dataset.key, n]));
    const keep = new Set(rows.map((r) => r.key));
    skels.forEach((s) => s.remove());
    existing.forEach((n, k) => { if (!keep.has(k)) n.remove(); });
    let anchor = ownLi, fresh = 0;
    rows.forEach((row, i) => {
      let li = existing.get(row.key);
      if (!li || !li.isConnected) { li = buildRow(row, i + 2, fresh++); }
      else { fillRow(li, row); li.querySelector('[data-rank]').textContent = String(i + 2); }
      if (anchor.nextSibling !== li) anchor.after(li);
      anchor = li;
    });
  }

  function paintTicker(own, rows) {
    const items = [own, ...rows].filter((r) => r && !r.failed);
    if (!items.length) return;
    const sig = items.map((r) => r.key).join('|');
    const mk = (r) => {
      const s = el('span', 'tick');
      const lg = makeLogo(r, r.own ? [BRAND_LOGO] : []); s.append(lg, el('b', '', r.symbol), el('span', 'tk-p', fmt.price(r.price)));
      const c = el('span', r.change > 0 ? 'up' : r.change < 0 ? 'dn' : '', (r.change > 0 ? '▲ ' : r.change < 0 ? '▼ ' : '') + fmt.change(r.change)); s.append(c);
      s.dataset.key = r.key;
      return s;
    };
    if (sig !== tickSig) {
      tickSig = sig;
      tickTrack.replaceChildren(...items.map(mk), ...items.map((r) => { const n = mk(r); n.setAttribute('aria-hidden', 'true'); return n; }));
    } else {
      tickTrack.querySelectorAll('.tick').forEach((n) => {
        const r = items.find((x) => x.key === n.dataset.key); if (!r) return;
        n.children[2].textContent = fmt.price(r.price);
        const c = n.children[3]; c.textContent = (r.change > 0 ? '▲ ' : r.change < 0 ? '▼ ' : '') + fmt.change(r.change); c.className = r.change > 0 ? 'up' : r.change < 0 ? 'dn' : '';
      });
    }
  }

  const market = createMarket({
    register: REGISTER,
    fetch: (...a) => fetch(...a),
    hidden: () => document.hidden,
    onState(s) {
      paintOwn(s.own, s.ownSettled ? 'settled' : 'loading');
      if (s.phase === 'ready') {
        board.setAttribute('aria-busy', 'false');
        reconcile(s.rows);
        paintTicker(s.own, s.rows);
        note.hidden = !s.stale;
        if (s.stale) note.textContent = 'The source did not answer. Showing the last good reading while we retry.';
        setStatus(s.stale ? 'Reconnecting' : 'Live', s.stale ? 'stale' : 'live');
      } else if (s.phase === 'error') {
        board.setAttribute('aria-busy', 'false');
        skels.forEach((n) => n.remove());
        board.querySelectorAll('li.row:not(#own-row)').forEach((n) => n.remove());
        for (let i = 0; i < 10; i++) { const li = buildRow({ key: 'x' + i, address: 'xxxx', symbol: '—', name: '', price: null, change: null, volume: null, liquidity: null, logos: [], failed: true }, i + 2, i); li.querySelector('.tk b').textContent = '—'; li.querySelector('.tk small').textContent = 'No reading'; board.append(li); }
        note.hidden = false; note.textContent = 'Market source unreachable. Retrying on its own.';
        setStatus('Offline', 'down');
      }
    },
  });
  document.addEventListener('visibilitychange', () => market.visibility(document.hidden));
  market.start();
  window.__novarMarket = market; // read-only handle for diagnostics
}

initCopy();
initScrollChrome();
initReveal();
initParallax();
initSpotlight();
initHexField();
initBoard();
