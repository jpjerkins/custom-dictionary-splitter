import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { loadConfig, type AppConfig } from './src/infrastructure/configProvider.ts';
import { handleApiRequest } from './routes/api.ts';

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC_DIR = join(process.cwd(), 'public', 'dist');
const CONFIG_PATH = process.env.CONFIG_PATH || join(process.cwd(), 'config.json');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const urlPath = req.url === '/' ? '/index.html' : req.url!;
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

export function createApp(config: AppConfig) {
  return createServer(async (req, res) => {
    if (req.url!.startsWith('/api/')) {
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
