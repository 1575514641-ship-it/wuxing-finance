import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const files = new Set(['index.html', 'app.js', 'sync.js', 'sw.js', 'styles.css', 'icon.svg', 'manifest.webmanifest']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!files.has(filename) || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404);
    response.end('Local preview: no cloud endpoint or file access outside the App.');
    return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(filename)], 'Cache-Control': 'no-store' });
  response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(path.join(root, filename)));
});

server.listen(0, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port}/`);
  console.log('Local preview only. Keep this terminal open; press Ctrl+C to stop.');
});
