// Tiny static server for local checks: node scripts/serve.mjs [dir] [port]
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(ROOT, process.argv[2] || 'dist');
const port = Number(process.argv[3] || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
http.createServer(async (req, res) => {
  const p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = p.endsWith(path.sep) || p === dir ? path.join(p, 'index.html') : p;
  if (!f.startsWith(dir)) { res.writeHead(403).end(); return; }
  try { const b = await fs.readFile(f); res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }).end(b); } catch { res.writeHead(404).end('not found'); }
}).listen(port, () => console.log(`serving ${dir} on http://localhost:${port}`));
