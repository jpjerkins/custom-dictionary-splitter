import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { loadConfig } from './src/infrastructure/configProvider.ts';
import { handleApiRequest } from './routes/api.js';

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = join(process.cwd(), 'public');
const CONFIG_PATH = process.env.CONFIG_PATH || join(process.cwd(), 'config.json');

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

export function createApp(config) {
  return createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      await handleApiRequest(req, res, config);
      return;
    }
    serveStatic(req, res);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig(CONFIG_PATH);
  createApp(config).listen(PORT, '127.0.0.1', () => {
    console.log(`custom-dictionary-splitter running at http://localhost:${PORT}`);
  });
}
