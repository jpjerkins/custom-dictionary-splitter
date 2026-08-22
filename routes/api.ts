import type { IncomingMessage, ServerResponse } from 'node:http';
import { createFsDictionaryRepository, applyEntries } from '../src/infrastructure/fsDictionaryRepository.ts';
import { createGitAdapter } from '../src/infrastructure/gitAdapter.ts';
import { createLoadDictionariesUseCase } from '../src/application/loadDictionaries.ts';
import { createSaveDecisionsUseCase } from '../src/application/saveDecisions.ts';
import { createCommitAndPushUseCase } from '../src/application/commitAndPush.ts';
import { createClassifyDownloadedUseCase } from '../src/application/classifyDownloaded.ts';
import { createMoveWordUseCase } from '../src/application/moveWord.ts';
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
      const { files, index, priority } = useCase.execute();
      const legacyIndex = Object.fromEntries(
        Array.from(index, ([stroke, entry]) => [stroke, { file: entry.winner.file, translation: entry.winner.word }])
      );
      sendJson(res, 200, { files, index: legacyIndex, priority, protectedFiles: config.protectedFiles });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/classify') {
      const { downloaded, deviceOrder } = await readBody(req);
      const repository = createFsDictionaryRepository(config.dictionariesPath);
      const useCase = createClassifyDownloadedUseCase({ repository, protectedFiles: config.protectedFiles });
      sendJson(res, 200, useCase.execute({ downloaded, deviceOrder }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/move-word') {
      const { word, fromFile, toFile, capturedHashes } = await readBody(req);
      const repository = createFsDictionaryRepository(config.dictionariesPath);
      const useCase = createMoveWordUseCase({ repository, protectedFiles: config.protectedFiles });
      sendJson(res, 200, useCase.execute({ word, fromFile, toFile, capturedHashes }));
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
