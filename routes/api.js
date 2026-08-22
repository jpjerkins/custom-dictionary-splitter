import { loadDictionaryFiles, applyEntries } from '../src/infrastructure/fsDictionaryRepository.ts';
import { buildStrokeIndex } from '../src/domain/strokeIndex.ts';
import { createGitAdapter } from '../src/infrastructure/gitAdapter.ts';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handleApiRequest(req, res, config) {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/dictionaries') {
      const files = loadDictionaryFiles(config.dictionariesPath);
      const index = buildStrokeIndex(files);
      const fileSummaries = Object.fromEntries(
        Object.entries(files).map(([name, info]) => [name, { hash: info.hash }])
      );
      sendJson(res, 200, { files: fileSummaries, index });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/save') {
      const { decisions } = await readBody(req);
      const files = loadDictionaryFiles(config.dictionariesPath);
      const results = applyEntries(files, decisions);
      sendJson(res, 200, { results });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/commit') {
      const { message, files } = await readBody(req);
      const result = await createGitAdapter(config.dictionariesPath).commitAndMaybePush(message, config.git.autoPush, files);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}
