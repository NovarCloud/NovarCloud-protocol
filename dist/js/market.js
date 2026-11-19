// MARKET — live data engine. Pure logic + injectable fetch so it is testable in Node.
// The trending board follows ONLY register.market. CA state never touches it.
import { resolveRecord } from './gate.js';

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};
const safeUrl = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' ? x.href : null;
  } catch {
    return null;
  }
};

export async function fetchJson(fetchFn, url, { retries = 3, base = 700, factor = 2, max = 8000, timeout = 9000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
    try {
      const res = await fetchFn(url, ctl ? { signal: ctl.signal } : undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        if (onRetry) onRetry(attempt + 1);
        await sleep(Math.min(max, base * factor ** attempt));
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastErr;
}

// Solana only, highest totalAmount first, one entry per token, top n.
export function pickTop(boosts, n = 10) {
  const seen = new Set();
  return (Array.isArray(boosts) ? boosts : [])
    .filter((b) => b && b.chainId === 'solana' && typeof b.tokenAddress === 'string')
    .sort((a, b) => (num(b.totalAmount) ?? 0) - (num(a.totalAmount) ?? 0))
    .filter((b) => (seen.has(b.tokenAddress) ? false : (seen.add(b.tokenAddress), true)))
    .slice(0, n);
}
// Pair selection: volume.h24 descending, first wins.
export function pickPair(pairs) {
  const list = (Array.isArray(pairs) ? pairs : Array.isArray(pairs?.pairs) ? pairs.pairs : []).filter(Boolean);
  return [...list].sort((a, b) => (num(b.volume?.h24) ?? 0) - (num(a.volume?.h24) ?? 0))[0] || null;
}
export function toRow(pair, { address, logos = [], own = false } = {}) {
  if (!pair) return null;
  const base = pair.baseToken || {};
  const logoList = [...logos, pair.info?.imageUrl].map((u) => (u ? safeUrl(u) : null)).filter(Boolean);
  return {
    key: address || base.address,
    address: address || base.address,
    symbol: base.symbol || '?',
    name: base.name || '',
    price: num(pair.priceUsd),
    change: num(pair.priceChange?.h24),
    volume: num(pair.volume?.h24),
    liquidity: num(pair.liquidity?.usd),
    logos: [...new Set(logoList)],
    url: safeUrl(pair.url),
    own,
  };
}
export const blankRow = (address, own = false) => ({ key: address, address, symbol: '?', name: '', price: null, change: null, volume: null, liquidity: null, logos: [], url: null, own, failed: true });

export function createMarket({ register, fetch: fetchFn, onState, hidden = () => false, sleep, retries = 3, setTimer = setTimeout, clearTimer = clearTimeout, interval = 60000 }) {
  const m = register.market;
  const state = { phase: 'loading', rows: [], own: null, ownSettled: false, stale: false, error: null };
  let timer = null;
  let busy = null;
  let started = false;
  const emit = () => onState && onState({ ...state, rows: state.rows.slice() });
  const opt = { retries, sleep };

  async function loadTrending() {
    const boosts = await fetchJson(fetchFn, m.boosts, opt);
    const top = pickTop(boosts, 10);
    if (!top.length) throw new Error('empty source');
    const settled = await Promise.allSettled(top.map((t) => fetchJson(fetchFn, m.tokens + encodeURIComponent(t.tokenAddress), { ...opt, retries: Math.min(retries, 2) })));
    return top.map((t, i) => {
      const r = settled[i];
      const row = r.status === 'fulfilled' ? toRow(pickPair(r.value), { address: t.tokenAddress }) : null;
      return row || blankRow(t.tokenAddress);
    });
  }

  // Own token: DexScreener and pump.fun run in PARALLEL; neither waits on, or fails because of, the other.
  async function loadOwn(ca) {
    const [dex, pump] = await Promise.allSettled([fetchJson(fetchFn, m.ownDex + encodeURIComponent(ca), opt), fetchJson(fetchFn, m.ownPump + encodeURIComponent(ca), { ...opt, retries: Math.min(retries, 1) })]);
    const pair = dex.status === 'fulfilled' ? pickPair(dex.value) : null;
    const pumpLogo = pump.status === 'fulfilled' ? pump.value?.image_uri : null;
    if (!pair && pump.status !== 'fulfilled') return null;
    const row = toRow(pair || { baseToken: { address: ca, symbol: pump.value?.symbol, name: pump.value?.name } }, { address: ca, logos: [pumpLogo], own: true });
    if (!pair && pump.status === 'fulfilled') {
      row.price = null;
      row.volume = num(pump.value?.volume_24h) ?? null;
    }
    return row;
  }

  // Trending and own-token loads are independent: each publishes its own result the moment it lands.
  async function refresh() {
    if (busy) return busy;
    const ca = resolveRecord('ca', register.ca);
    const dedup = () => { if (state.own) state.rows = state.rows.filter((r) => r.address !== state.own.address); };
    const ownTask = (async () => {
      if (ca.state !== 'stated') { state.own = null; return; }
      const own = await loadOwn(ca.value).catch(() => null);
      if (own) state.own = own; // keep last good own row if a refresh returned nothing
      state.ownSettled = true;
      dedup();
      emit();
    })();
    const trendTask = (async () => {
      let rows = null, error = null;
      try { rows = await loadTrending(); } catch (e) { error = e; }
      if (rows) { state.rows = rows; state.phase = 'ready'; state.stale = false; state.error = null; }
      else if (state.rows.length) { state.stale = true; state.phase = 'ready'; } // last good data kept
      else { state.phase = 'error'; state.error = String(error?.message || error); }
      dedup();
      emit();
    })();
    busy = Promise.all([ownTask, trendTask]).then(() => {}).finally(() => { busy = null; });
    return busy;
  }
  function schedule() {
    clearTimer(timer);
    timer = setTimer(async () => {
      if (!hidden()) await refresh();
      schedule();
    }, interval);
  }
  return {
    state,
    refresh,
    start() {
      if (started) return;
      started = true;
      emit();
      if (!hidden()) refresh();
      schedule();
    },
    // Called on visibilitychange: pause while hidden, fetch immediately on visible.
    visibility(isHidden) {
      if (isHidden) {
        clearTimer(timer);
        timer = null;
      } else if (started) {
        refresh();
        schedule();
      }
    },
    stop() {
      clearTimer(timer);
      started = false;
    },
  };
}

export const fmt = {
  price(v) {
    if (v == null) return '—';
    if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (v >= 1) return '$' + v.toFixed(2);
    if (v >= 0.01) return '$' + v.toFixed(4);
    if (v === 0) return '$0';
    const d = Math.min(10, Math.max(4, 2 - Math.floor(Math.log10(v)) + 1));
    return '$' + v.toFixed(d);
  },
  compact(v) {
    if (v == null) return '—';
    const a = Math.abs(v);
    const u = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
    return '$' + (v / u[0]).toFixed(u[0] === 1 ? 0 : 2) + u[1];
  },
  change(v) {
    if (v == null) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '%';
  },
};
