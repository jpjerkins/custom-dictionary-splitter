import type { DictionaryRepository } from './ports.ts';
import type { FileName, Stroke, Word } from '../domain/types.ts';

export interface MoveWordInput {
  word: Word;
  fromFile: FileName;
  toFile: FileName;
  capturedHashes: Record<FileName, string>;
}

export interface MoveWordResult {
  status: 'ok' | 'stale' | 'error';
  reason?: string;
}

export interface MoveWordDeps {
  repository: DictionaryRepository;
  protectedFiles: FileName[];
}

// Moving a word relocates EVERY chord for it from one file to another. Unlike
// applyEntries (which touches a single file per decision), a move spans two
// files at once: if we removed the entries from the source file and only
// then discovered the destination was stale, they would be gone from both
// files. So both hashes are verified, and both new file contents computed
// in memory, before either file is written.
export function createMoveWordUseCase({ repository, protectedFiles }: MoveWordDeps) {
  return {
    execute({ word, fromFile, toFile, capturedHashes }: MoveWordInput): MoveWordResult {
      if (protectedFiles.includes(toFile)) {
        return { status: 'error', reason: `${toFile} is a protected file and cannot be a move destination` };
      }

      const files = repository.load();

      const fromInfo = files[fromFile];
      if (!fromInfo) {
        return { status: 'error', reason: `Unknown file: ${fromFile}` };
      }
      const toInfo = files[toFile];
      if (!toInfo) {
        return { status: 'error', reason: `Unknown file: ${toFile}` };
      }

      if (fromInfo.hash !== capturedHashes[fromFile] || toInfo.hash !== capturedHashes[toFile]) {
        return { status: 'stale', reason: `${fromFile} or ${toFile} changed since diff; re-run diff` };
      }

      const newFrom: Record<Stroke, Word> = { ...fromInfo.entries };
      const newTo: Record<Stroke, Word> = { ...toInfo.entries };
      for (const [stroke, w] of Object.entries(fromInfo.entries)) {
        if (w === word) {
          delete newFrom[stroke];
          newTo[stroke] = w;
        }
      }

      repository.write(fromFile, newFrom);
      repository.write(toFile, newTo);

      return { status: 'ok' };
    },
  };
}
