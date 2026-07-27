import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  let path = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
  } catch {
    path = join(ROOT, '404.html');
    res.statusCode = 404;
  }
  try {
    const body = await readFile(path);
    res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
}).listen(4173, () => console.log('http://localhost:4173'));
