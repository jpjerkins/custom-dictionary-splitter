import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = join(process.cwd(), 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = normalize(join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
}

export function createApp() {
  return createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    serveStatic(req, res);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createApp().listen(PORT, () => {
    console.log(`custom-dictionary-splitter running at http://localhost:${PORT}`);
  });
}
