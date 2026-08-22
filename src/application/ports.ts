import type { FileName, Stroke, Word } from '../domain/types.ts';

export interface DictionaryFile {
  path: string;
  entries: Record<Stroke, Word>;
  hash: string;
  mtimeMs: number;
}

export interface DictionaryRepository {
  load(): Record<FileName, DictionaryFile>;
  write(file: FileName, entries: Record<Stroke, Word>): void;
}

export interface CommitResult {
  committed: boolean;
  pushed: boolean;
  message?: string;
  pushError?: string;
}

export interface GitService {
  commitAndMaybePush(message: string, autoPush: boolean, files?: string[]): Promise<CommitResult>;
}
