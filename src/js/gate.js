// GATE — shape checks and the address scanner. Pure functions, no DOM, safe in Node and in the browser.
const B58 = '1-9A-HJ-NP-Za-km-z';
const SOL_RE = new RegExp(`^[${B58}]{32,44}$`);
const SOL_SCAN = new RegExp(`(?<![0-9A-Za-z])[${B58}]{32,44}(?![0-9A-Za-z])`, 'g');
const EVM_SCAN = /(?<![0-9A-Za-z])0x[0-9a-fA-F]{40}(?![0-9A-Za-z])/g;

export const isSolanaAddress = (s) => typeof s === 'string' && SOL_RE.test(s);

// Normalise a record: a CA only counts as stated when it is address-shaped; socials only when the URL is https on the right host.
export function resolveRecord(kind, rec) {
  const r = rec || { state: 'absent' };
  if (r.state !== 'stated') return { state: r.state === 'unconfirmed' ? 'unconfirmed' : 'absent' };
  if (kind === 'ca') return isSolanaAddress(r.value) ? { state: 'stated', value: r.value } : { state: 'unconfirmed' };
  const hosts = kind === 'x' ? ['x.com', 'twitter.com'] : ['github.com'];
  try {
    const u = new URL(r.url);
    const host = u.hostname.replace(/^www\./, '');
    if (u.protocol !== 'https:' || !hosts.includes(host)) return { state: 'unconfirmed' };
    return { state: 'stated', url: u.href, handle: deriveHandle(kind, u) };
  } catch {
    return { state: 'unconfirmed' };
  }
}
// LINK RULE: the URL is stored, the handle is derived from it. No URL, no href.
export function deriveHandle(kind, u) {
  const parts = u.pathname.split('/').filter(Boolean);
  if (kind === 'x') return parts[0] ? `@${parts[0]}` : null;
  return parts.length ? parts.slice(0, 2).join('/') : null;
}
export const hrefOf = (resolved) => (resolved.state === 'stated' ? resolved.url : null);

// GATE WARNING: never blanket-reject 0x hex. Address-shaped strings are matched against the stated registry.
// The CA itself is exempt (it IS the registry entry). Short hex like 0xff is not address-shaped and never flagged.
export function statedAddresses(register) {
  const ca = resolveRecord('ca', register.ca);
  return new Set(ca.state === 'stated' ? [ca.value.toLowerCase()] : []);
}
export function scanAddresses(text, register) {
  const ok = statedAddresses(register);
  const bad = [];
  for (const re of [SOL_SCAN, EVM_SCAN]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) if (!ok.has(m[0].toLowerCase())) bad.push(m[0]);
  }
  return bad;
}
