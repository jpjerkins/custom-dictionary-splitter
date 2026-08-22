import type { IncomingMessage, ServerResponse } from 'node:http';
import { createFsDictionaryRepository, applyEntries } from '../src/infrastructure/fsDictionaryRepository.ts';
import { createGitAdapter } from '../src/infrastructure/gitAdapter.ts';
import { createLoadDictionariesUseCase } from '../src/application/loadDictionaries.ts';
import { createSaveDecisionsUseCase } from '../src/application/saveDecisions.ts';
import { createCommitAndPushUseCase } from '../src/application/commitAndPush.ts';
import type { AppConfig } from '../src/infrastructure/configProvider.ts';

function readBody(req: IncomingMessage): Promise<any> {
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse, config: AppConfig): Promise<void> {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/dictionaries') {
      const repository = createFsDictionaryRepository(config.dictionariesPath);
      const useCase = createLoadDictionariesUseCase({ repository });
      sendJson(res, 200, useCase.execute());
      return;
    }

    if (req.method === 'POST' && req.url === '/api/save') {
      const { decisions } = await readBody(req);
      const repository = createFsDictionaryRepository(config.dictionariesPath);
      const useCase = createSaveDecisionsUseCase({ repository, applyEntries });
      sendJson(res, 200, useCase.execute({ decisions }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/commit') {
      const { message, files } = await readBody(req);
      const gitService = createGitAdapter(config.dictionariesPath);
      const useCase = createCommitAndPushUseCase({ gitService, autoPush: config.git.autoPush });
      const result = await useCase.execute({ message, files });
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
}
