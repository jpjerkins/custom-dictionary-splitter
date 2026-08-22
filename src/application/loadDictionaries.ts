import type { DictionaryRepository } from './ports.ts';
import { buildStrokeIndex, type StrokeIndexEntry } from '../domain/strokeIndex.ts';
import type { FileName, Stroke } from '../domain/types.ts';

export interface LoadDictionariesDeps {
  repository: DictionaryRepository;
}

export interface LoadDictionariesResult {
  files: Record<FileName, { hash: string }>;
  index: Record<Stroke, StrokeIndexEntry>;
}

export function createLoadDictionariesUseCase({ repository }: LoadDictionariesDeps) {
  return {
    execute(): LoadDictionariesResult {
      const files = repository.load();
      const index = buildStrokeIndex(files);
      const fileSummaries = Object.fromEntries(
        Object.entries(files).map(([name, info]) => [name, { hash: info.hash }])
      );
      return { files: fileSummaries, index };
    },
  };
}
