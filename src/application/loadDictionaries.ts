import type { DictionaryRepository } from './ports.ts';
import { buildStrokeIndex, type StrokeIndexEntry } from '../domain/strokeIndex.ts';
import { priorityFromFilenames } from '../domain/priority.ts';
import type { FileName, Stroke } from '../domain/types.ts';

export interface LoadDictionariesDeps {
  repository: DictionaryRepository;
}

export interface LoadDictionariesResult {
  files: Record<FileName, { hash: string }>;
  index: Map<Stroke, StrokeIndexEntry>;
  priority: FileName[];
}

export function createLoadDictionariesUseCase({ repository }: LoadDictionariesDeps) {
  return {
    execute(): LoadDictionariesResult {
      const files = repository.load();
      const priority = priorityFromFilenames(Object.keys(files));
      const index = buildStrokeIndex(files, priority);
      const fileSummaries = Object.fromEntries(
        Object.entries(files).map(([name, info]) => [name, { hash: info.hash }])
      );
      return { files: fileSummaries, index, priority: priority.files };
    },
  };
}
