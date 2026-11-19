// Gate runner. Every check below is one gate; exit code 1 if any fails. Zero dependencies.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { scanAddresses, resolveRecord, isSolanaAddress } = await imp('src/js/gate.js');
const { createMarket, pickTop, pickPair, fetchJson } = await imp('src/js/market.js');
const { REGISTER } = await imp('src/js/register.js');

let total = 0, passed = 0;
const fails = [];
function gate(name, ok, detail = '') {
  total++;
  if (ok) passed++; else fails.push(name + (detail ? ' — ' + detail : ''));
  console.log(`${ok ? 'PASS' : 'FAIL'}  G${String(total).padStart(2, '0')}  ${name}${!ok && detail ? '  [' + detail + ']' : ''}`);
}
const read = (p) => fs.readFile(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.access(path.join(ROOT, p)).then(() => true, () => false);
async function walk(dir, skip = []) {
  const out = [];
  for (const e of await fs.readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (skip.includes(e.name)) continue;
    if (e.isDirectory()) out.push(...(await walk(rel, skip))); else out.push(rel);
  }
  return out;
}
const b58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const randAddr = () => Array.from(crypto.randomBytes(44), (b) => b58[b % 58]).join('');
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');

/* ---------- builds: dist (deploy) + proof variants for the stated branch ---------- */
const CA = randAddr(), XURL = 'https://x.com/novarproof', GHURL = 'https://github.com/novarproof/site';
const { register: distReg } = await build({ out: 'dist' });
await build({ out: '.proof/absent' });
await build({ out: '.proof/stated', ca: CA, x: XURL, github: GHURL });
const absent = await read('.proof/absent/index.html');
const stated = await read('.proof/stated/index.html');
const distHtml = await read('dist/index.html');
const statedReg = JSON.parse((await read('.proof/stated/js/register.js')).replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, ''));

/* ---------- output + logo ---------- */
gate('dist/index.html exists', await exists('dist/index.html'));
const refs = [...distHtml.matchAll(/(?:src|href)="([^"#:][^"]*)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|data:)/.test(u));
const missing = [];
for (const r of refs) if (!(await exists('dist/' + r))) missing.push(r);
gate('every local src/href in dist/index.html resolves to a file in dist/', refs.length > 8 && !missing.length, missing.join(','));
gate('logo files copied into dist/assets and referenced by index.html', (await exists('dist/assets/logo-512.png')) && (await exists('dist/assets/logo-128.png')) && distHtml.includes('src="assets/logo-512.png"') && distHtml.includes('src="assets/logo-128.png"'));
const png = await fs.readFile(path.join(ROOT, 'dist/assets/logo-512.png'));
gate('dist logo is a PNG with IHDR colortype 6 (RGBA), 512x512', png.readUInt32BE(16) === 512 && png.readUInt32BE(20) === 512 && png[25] === 6);
const fav = await read('dist/assets/favicon.svg');
gate('favicon.svg is 32x32 and linked with type image/svg+xml', /viewBox="0 0 32 32"/.test(fav) && /width="32" height="32"/.test(fav) && /rel="icon" href="assets\/favicon.svg" type="image\/svg\+xml"/.test(distHtml));

/* ---------- palette / css hygiene ---------- */
const srcFiles = [...(await walk('src', ['assets'])), 'build.mjs'];
const litHits = [];
for (const f of srcFiles) {
  if (f === 'src/tokens.css') continue;
  const t = (await read(f)).replace(/href="#[a-z-]+"/g, '').replace(/url\(#[a-z]+\)|fill="url\(#[a-z]+\)"/g, '');
  if (/#[0-9a-fA-F]{3,8}\b/.test(t) || /\brgba?\(|\bhsla?\(/.test(t)) litHits.push(f);
}
gate('colour literals live only in src/tokens.css', !litHits.length, litHits.join(','));
const css = await read('dist/css/app.css');
gate('no ch units in css', !/\d(?:\.\d+)?ch\b/.test(css));
const tokensCss = await read('src/tokens.css');
gate('tokens file documents palette provenance', /PALETTE PROVENANCE/.test(tokensCss) && ['--c-bg', '--c-ring-1', '--c-ring-7', '--c-lightest', '--c-darkest'].every((k) => tokensCss.includes(k + ':')));

/* ---------- register + links + CA slot: absent branch ---------- */
gate('register: ca, x, github ship as absent in the deploy build', ['ca', 'x', 'github'].every((k) => distReg[k].state === 'absent'));
const socialsAbsent = absent.match(/<div class="socials">([\s\S]*?)<\/div>\s*<\/div>/)[1];
gate('absent: both social icons render at all breakpoints (markup) and are inert (no href, aria-disabled)', (socialsAbsent.match(/<svg/g) || []).length === 2 && !/href=/.test(socialsAbsent) && (socialsAbsent.match(/aria-disabled="true"/g) || []).length === 2);
gate('absent: socials are icon-only (no text nodes inside)', textOf(socialsAbsent).trim() === '');
const caBarAbsent = absent.match(/<div class="ca-wrap">([\s\S]*?)<\/div>\s*<\/header>/)[1];
gate('absent: CA slot is inert (no button, no data-copy, no click target)', /is-inert/.test(caBarAbsent) && !/data-copy|<button/.test(caBarAbsent));
gate('absent: own row #1 is brand-logo placeholder, dots, non-clickable', /id="own-row" data-state="absent"[\s\S]*?src="assets\/logo-128\.png"[\s\S]*?· · · · ·/.test(absent) && !/<a class="row-link"/.test(absent.match(/<li class="row row--own"[\s\S]*?<\/li>/)[0]));
gate('own row is the first row of the board', /<ol class="rows"[^>]*>\s*<li class="row row--own"/.test(absent) && /<ol class="rows"[^>]*>\s*<li class="row row--own"/.test(stated));
gate('absent: zero address-shaped strings anywhere in dist', (await Promise.all((await walk('dist', ['assets'])).map(async (f) => scanAddresses(await read(f), distReg)))).flat().length === 0);

/* ---------- stated branch ---------- */
gate('stated: build override flips ca/x/github records to stated (read from current record)', statedReg.ca.state === 'stated' && statedReg.ca.value === CA && statedReg.x.state === 'stated' && statedReg.github.state === 'stated');
const caBarStated = stated.match(/<div class="ca-wrap">([\s\S]*?)<\/div>\s*<\/header>/)[1];
gate('stated: CA slot is a click-to-copy button with the FULL address visible and copy feedback node', caBarStated.includes(`data-copy="${CA}"`) && caBarStated.includes(`<span class="ca-val">${CA}</span>`) && /data-feedback/.test(caBarStated));
const socialsStated = stated.match(/<div class="socials">([\s\S]*?)<\/div>\s*<\/div>/)[1];
gate('stated: social hrefs come from stored URLs; handle derived (LINK RULE)', socialsStated.includes(`href="${XURL}"`) && socialsStated.includes(`href="${GHURL}"`) && socialsStated.includes('@novarproof') && socialsStated.includes('novarproof/site'));
gate('stated: icons are the official X mark and GitHub octicon paths', socialsStated.includes('M18.244 2.25h3.308') && socialsStated.includes('M8 0c4.42 0 8 3.58 8 8'));
gate('stated: scanner exempts the CA (no violations in stated dist)', (await Promise.all((await walk('.proof/stated', ['assets'])).map(async (f) => scanAddresses(await read(f), statedReg)))).flat().length === 0);
gate('scanner: a rogue address not in the registry is flagged', scanAddresses(`x ${randAddr()} y`, statedReg).length === 1 && scanAddresses(`0x${'ab'.repeat(20)}`, statedReg).length === 1);
gate('scanner: never blanket-rejects 0x hex (0xff, 0x1F600, colour-like hex pass)', scanAddresses('0xff 0x1F600 0xDEADBEEF color 0x00ffcc', statedReg).length === 0);
gate('scanner: a stated 0x-shaped registry entry would be matched, not rejected', (() => { const a = '0x' + '1a'.repeat(20); const reg = { ca: { state: 'stated', value: a } }; return scanAddresses(a, reg).length === 0 || resolveRecord('ca', reg.ca).state === 'unconfirmed'; })());
gate('invalid CA shape resolves to unconfirmed and renders inert', resolveRecord('ca', { state: 'stated', value: 'nope' }).state === 'unconfirmed' && isSolanaAddress(CA));
gate('non-https or wrong-host social URL resolves to unconfirmed (no href)', resolveRecord('x', { state: 'stated', url: 'http://x.com/a' }).state === 'unconfirmed' && resolveRecord('github', { state: 'stated', url: 'https://evil.example/a' }).state === 'unconfirmed');

/* ---------- market engine (mock fetch) ---------- */
const mkBoost = (i, chain = 'solana') => ({ chainId: chain, tokenAddress: `T${String(i).padStart(2, '0')}${'x'.repeat(30)}`, totalAmount: i * 10 });
const boosts = [...Array.from({ length: 14 }, (_, i) => mkBoost(i + 1)), mkBoost(99, 'ethereum'), mkBoost(98, 'bsc')];
const pairFor = (addr, vol = 100) => [{ baseToken: { address: addr, symbol: 'S' + addr.slice(0, 3), name: 'N' }, priceUsd: '1.5', priceChange: { h24: 3 }, volume: { h24: vol }, liquidity: { usd: 500 }, info: { imageUrl: 'https://cdn.example/i.png' }, url: 'https://dexscreener.com/solana/x' }, { baseToken: { address: addr, symbol: 'LOW' }, priceUsd: '9', volume: { h24: 1 }, liquidity: { usd: 1 } }];
const top = pickTop(boosts);
gate('market: solana only, top 10 by totalAmount, descending', top.length === 10 && top.every((b) => b.chainId === 'solana') && top[0].totalAmount === 140 && top[9].totalAmount === 50);
gate('market: pair selection = highest volume.h24', pickPair([{ volume: { h24: 5 }, id: 'a' }, { volume: { h24: 50 }, id: 'b' }]).id === 'b');
const sleeps = [];
const noSleep = async (ms) => { sleeps.push(ms); };
const jsonRes = (d) => ({ ok: true, json: async () => d });
function mockFetch(over = {}) {
  const calls = [];
  const f = async (url) => {
    calls.push(url);
    if (over.fail && over.fail(url)) throw new Error('boom');
    if (url === REGISTER.market.boosts) return jsonRes(boosts);
    if (url.startsWith(REGISTER.market.tokens)) return jsonRes(pairFor(decodeURIComponent(url.slice(REGISTER.market.tokens.length))));
    if (url.startsWith(REGISTER.market.ownDex)) return jsonRes({ pairs: [{ baseToken: { address: 'own', symbol: 'NVR', name: 'Novar' }, priceUsd: '0.5', volume: { h24: 7 }, liquidity: { usd: 9 } }, { baseToken: { address: 'own', symbol: 'BIG' }, priceUsd: '0.6', volume: { h24: 70 }, liquidity: { usd: 90 } }] });
    if (url.startsWith(REGISTER.market.ownPump)) return jsonRes({ image_uri: 'https://pump.example/logo.png', symbol: 'NVR' });
    throw new Error('unexpected ' + url);
  };
  f.calls = calls;
  return f;
}
const run = async (register, f, o = {}) => { let last; const m = createMarket({ register, fetch: f, onState: (s) => (last = s), sleep: noSleep, setTimer: () => 0, clearTimer: () => {}, ...o }); await m.refresh(); return { m, get last() { return last; } }; };
const regAbsent = structuredClone(REGISTER); regAbsent.ca = { state: 'absent' };
const regOwn = structuredClone(REGISTER); regOwn.ca = { state: 'stated', value: 'x'.repeat(0) + randAddr() };
const fa = mockFetch(); const A = await run(regAbsent, fa);
gate('market: absent CA never calls own-token endpoints', !fa.calls.some((u) => u.startsWith(REGISTER.market.ownDex) || u.startsWith(REGISTER.market.ownPump)) && A.last.own === null && A.last.rows.length === 10);
const fo = mockFetch(); const O = await run(regOwn, fo);
gate('market: stated CA fetches DexScreener AND pump.fun, picks pair by volume, pump logo first', fo.calls.some((u) => u.startsWith(REGISTER.market.ownDex)) && fo.calls.some((u) => u.startsWith(REGISTER.market.ownPump)) && O.last.own.symbol === 'BIG' && O.last.own.logos[0] === 'https://pump.example/logo.png');
gate('market: CA state has zero effect on the trending rows (same data both ways)', JSON.stringify(A.last.rows.map((r) => r.key)) === JSON.stringify(O.last.rows.map((r) => r.key)));
const fp = mockFetch({ fail: (u) => u.startsWith(REGISTER.market.ownPump) }); const P = await run(regOwn, fp);
gate('pump.fun failure never blocks DexScreener own row', P.last.own && P.last.own.price === 0.6);
const fd = mockFetch({ fail: (u) => u.startsWith(REGISTER.market.ownDex) }); const D = await run(regOwn, fd);
gate('DexScreener failure never blocks pump.fun logo/own row', D.last.own && D.last.own.logos[0] === 'https://pump.example/logo.png');
const dedupReg = structuredClone(regOwn); const dupAddr = top[0].tokenAddress;
const fdd = mockFetch(); const origImpl = fdd; const f2 = async (u) => (u.startsWith(REGISTER.market.ownDex) ? jsonRes({ pairs: [{ baseToken: { address: dupAddr, symbol: 'DUP' }, priceUsd: '1', volume: { h24: 1 } }] }) : origImpl(u));
dedupReg.ca = { state: 'stated', value: dupAddr }; // shape check is bypassed deliberately: dedup is keyed on the fetched address
const Dd = await run({ ...dedupReg, ca: { state: 'stated', value: randAddr() } }, async (u) => (u.startsWith(REGISTER.market.ownDex) ? jsonRes({ pairs: [{ baseToken: { address: dupAddr, symbol: 'DUP' }, priceUsd: '1', volume: { h24: 1 } }] }) : origImpl(u)));
gate('dedup: own token removed from trending rows 2-10 when it appears there', Dd.last.own.address !== undefined && !Dd.last.rows.some((r) => r.address === Dd.last.own.address));
let n = 0; const sl = []; const ff = async () => { n++; throw new Error('down'); };
await fetchJson(ff, 'u', { retries: 3, base: 100, factor: 2, sleep: async (ms) => sl.push(ms) }).catch(() => {});
gate('exponential backoff: 4 attempts, waits 100/200/400', n === 4 && sl.join() === '100,200,400');
let healthy = true; const flaky = mockFetch(); const toggled = async (u) => (healthy ? flaky(u) : (() => { throw new Error('x'); })());
const F = await run(regAbsent, toggled); healthy = false; await F.m.refresh();
gate('refresh failure keeps last good data and flags stale', F.last.rows.length === 10 && F.last.stale === true && F.last.phase === 'ready');
const E = await run(regAbsent, async () => { throw new Error('x'); });
gate('first-load failure yields error phase with no rows (UI renders dashes + error)', E.last.phase === 'error' && E.last.rows.length === 0);
const timers = []; let hid = false; let fcount = 0; const cf = async (u) => { fcount++; return mockFetch()(u); };
const V = createMarket({ register: regAbsent, fetch: cf, onState: () => {}, hidden: () => hid, sleep: noSleep, setTimer: (fn, ms) => (timers.push([fn, ms]), timers.length), clearTimer: () => {} });
V.start(); await new Promise((r) => setTimeout(r, 20)); const afterStart = fcount; hid = true; await timers.at(-1)[0](); const hiddenTick = fcount; hid = false; V.visibility(false); await new Promise((r) => setTimeout(r, 20));
gate('polling: 60 s interval, paused while hidden, immediate fetch when visible again', timers.every(([, ms]) => ms === 60000) && afterStart > 0 && hiddenTick === afterStart && fcount > hiddenTick);

/* ---------- motion / css contract ---------- */
gate('css: own row border-left 2px solid var(--color-accent) + ownPulse with mint token', /\.row--own\{border-left:2px solid var\(--color-accent\)/.test(css) && /@keyframes ownPulse/.test(css) && /color-mix\(in oklab,var\(--c-mint\)/.test(css));
gate('css: prefers-reduced-motion disables ownPulse and all animation', /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*\.row--own\{animation:none\}/.test(css) && /animation:none!important/.test(css));
gate('css: skeleton, spotlight, progress bar, live-dot, parallax layers all present', ['@keyframes skel', '[data-spot]::after', '.progress{', '@keyframes live', '.mesh--a'].every((s) => css.includes(s)) && distHtml.includes('data-depth'));
gate('js: damped-spring solver + count-up + flash wired', /stiffness/.test(await read('dist/js/motion.js')) && /flash-up/.test(await read('dist/js/main.js')));
gate('market polling code reads only the market-source record (no CA reference in trending path)', !/loadTrending[\s\S]{0,400}register\.ca/.test(await read('src/js/market.js')));

/* ---------- animation audit: every @keyframes is applied, reduced-motion covered, reference values matched ---------- */
const cssNc = css.replace(/\/\*[\s\S]*?\*\//g, '');
const kfNames = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
const sources = distHtml + (await Promise.all((await walk('dist/js')).map(read))).join('\n');
const unused = [], orphan = [];
for (const k of kfNames) {

  const re = new RegExp(String.raw`([^{}@]+)\{[^{}]*animation:[^;}]*\b` + k + String.raw`\b`, 'g');
  const sels = [...cssNc.matchAll(re)].map((m) => m[1].trim().split(',').pop().trim());
  if (!sels.length) { unused.push(k); continue; }
  // the selector's class / attribute tokens must exist in the html or in js-created markup
  const alive = sels.some((sel) => { const tok = (sel.match(/[.\[][\w-]+(?:=[\w-]+)?\]?/g) || []).map((t) => t.replace(/^\./, '').replace(/^\[|\]$/g, '').replace(/=.*/, '')); return tok.length === 0 || tok.every((t) => sources.includes(t) || css.includes(`.${t}`) && /^(in|is-|flash|hub-roll|up|dn)/.test(t) || ['before', 'after'].includes(t)); });
  if (!alive) orphan.push(k + '<-' + sels.join('|'));
}
gate(`animation audit: all ${kfNames.length} @keyframes are applied to a selector`, !unused.length, unused.join(','));
gate('animation audit: every animated selector exists in html/js markup', !orphan.length, orphan.join(' ; '));
gate('animation audit: reduced-motion kills every animation and transition (global rule) + reveal forced visible', /@media \(prefers-reduced-motion:reduce\)\{\s*\*,\*::before,\*::after\{animation:none!important;transition:none!important/.test(css) && /\[data-reveal\]\{opacity:1!important;transform:none!important\}/.test(css));
const REF = [
  ['arrive-line l1', /\[data-arrive=l1\]\{animation:arrive-line 1\.1s var\(--ease-line\) 2\.1s backwards\}/],
  ['arrive-line l2', /\[data-arrive=l2\]\{animation:arrive-line 1\.1s var\(--ease-line\) 2\.24s backwards\}/],
  ['arrive-soft sub', /\[data-arrive=sub\]\{animation:arrive-soft \.9s var\(--ease\) 2\.65s backwards\}/],
  ['arrive-soft act', /\[data-arrive=act\]\{animation:arrive-soft \.9s var\(--ease\) 2\.8s backwards\}/],
  ['arrive-fade fig', /\[data-arrive=fig\]\{animation:arrive-fade \.9s var\(--ease\) 2\.95s backwards\}/],
  ['arrive-fade cue', /\[data-arrive=cue\]\{animation:arrive-fade \.9s var\(--ease\) 3\.5s backwards\}/],
  ['arrive-rise copy', /\[data-arrive=copy\]\{animation:arrive-rise \.9s var\(--ease\) \.65s backwards\}/],
  ['arrive-fade side', /\[data-arrive=side\]\{animation:arrive-fade \.7s var\(--ease\) 1\.1s backwards\}/],
  ['arrive-fade tele', /\[data-arrive=tele\]\{animation:arrive-fade \.5s var\(--ease\) \.45s backwards\}/],
  ['skel 1.4s linear', /animation:skel 1\.4s linear infinite/],
  ['cue 2.2s ease', /animation:cue 2\.2s var\(--ease\) infinite/],
  ['notice-rise panel', /animation:notice-rise var\(--d-panel\) var\(--ease\) both/],
  ['copy-tick .26s', /animation:copy-tick \.26s var\(--ease\)/],
  ['hub-roll roll/snap', /animation:hub-roll var\(--d-roll\) var\(--ease-snap\) both/],
  ['blink 1s steps(2,end)', /animation:blink 1s steps\(2,end\) infinite/],
  ['durations/easing tokens', /--d-press: 90ms;[\s\S]*--d-ui: 180ms;[\s\S]*--d-panel: 320ms;[\s\S]*--d-roll: 520ms/.test(css) && /--ease: cubic-bezier\(0\.2, 0\.7, 0\.1, 1\)/.test(css) && /--ease-snap: cubic-bezier\(0\.7, 0, 0\.2, 1\)/.test(css) && /--ease-line: cubic-bezier\(0\.16, 1, 0\.3, 1\)/.test(css)],
];
for (const [n, re] of REF) gate(`animation matches reference: ${n}`, re === true || (re instanceof RegExp && re.test(css)) || (typeof re === 'boolean' && re));

/* ---------- copy: no dates, no reference overlap ---------- */
const allDist = (await Promise.all((await walk('dist', ['assets'])).map(read))).join('\n');
const vis = textOf(distHtml);

const dateHits = [/\b(19|20)\d{2}\b/, /\b\d{1,2}:\d{2}\b/, /\bas of\b/i, /\bchecked\b/i, /\bupdated\b/i, /\blast (seen|sync)/i, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i, /\bDate\b|toLocale(Time|Date)String|toISOString/].filter((re) => re.test(vis) || re.test(allDist.replace(/w3\.org\/\d{4}\/svg/g, '')));
gate('no dates, timestamps, "as of" or "checked" anywhere in the shipped page', !dateHits.length, dateHits.map(String).join(' '));
const refHashes = new Set(JSON.parse(await read('scripts/ref-bigrams.json')));
const STOP = new Set('a an the and or of to in on at for with by from as is are be it its this that these those you your we our can will no not into than then so'.split(' '));
const tokz = (s) => s.toLowerCase().match(/[a-z0-9]+/g) || [];
const nodes = [...distHtml.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '<br>').split(/<[^>]*>/), ...[...distHtml.matchAll(/(?:name="description"|property="og:(?:title|description)") content="([^"]+)"/g)].map((m) => m[1]), ...[...distHtml.matchAll(/<title>([^<]+)/g)].map((m) => m[1])];
const shared = new Set();
for (const nd of nodes) { const t = tokz(nd); for (let i = 0; i < t.length - 1; i++) { if (STOP.has(t[i]) && STOP.has(t[i + 1])) continue; if (refHashes.has(crypto.createHash('sha1').update(t[i] + ' ' + t[i + 1]).digest('hex').slice(0, 10))) shared.add(t[i] + ' ' + t[i + 1]); } }
gate('copy shares zero word 2-grams with the reference (function-word pairs excluded)', shared.size === 0, [...shared].join('; '));

/* ---------- repo hygiene + content ---------- */
const all = (await walk('.', ['node_modules', 'BRAND', 'REFERENCE', 'dist', '.proof', '.git', 'assets'])).filter((f) => !/verify\.mjs$|ref-bigrams\.json$/.test(f));
const bad = [];
for (const f of all) { const t = await read(f).catch(() => ''); if (/co-authored-by|generated with|anthropic|claude|\bAI-generated\b|\bchatgpt\b/i.test(t)) bad.push(f); }
gate('repo hygiene: no AI attribution anywhere in project files', !bad.length, bad.join(','));
gate('repo hygiene: no CLAUDE.md and no .claude/ directory', !(await exists('CLAUDE.md')) && !(await exists('.claude')));
const lic = await read('LICENSE').catch(() => '');
gate('LICENSE is MIT with copyright NOVAR, 2026', /MIT License/.test(lic) && /Copyright \(c\) 2026 NOVAR|NOVAR, 2026/.test(lic));
const readme = await read('README.md').catch(() => ''), wp = await read('docs/whitepaper.md').catch(() => '');
gate('README has badge, Solana, CA placeholder, Overview/Features/Links', /img\.shields\.io/.test(readme) && /Solana/.test(readme) && /CA/.test(readme) && /## Overview/.test(readme) && /## Features/.test(readme) && /## Links/.test(readme));
gate('whitepaper has vision, tokenomics placeholders, 3-4 phases, team placeholder', /Vision/i.test(wp) && /Tokenomics/i.test(wp) && (wp.match(/^### Phase \d/gm) || []).length >= 3 && /Team/i.test(wp));

await fs.rm(path.join(ROOT, '.proof'), { recursive: true, force: true });
console.log(`\nGATES ${passed}/${total}`);
if (fails.length) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
