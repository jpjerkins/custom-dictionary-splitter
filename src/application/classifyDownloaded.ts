import type { DictionaryRepository } from './ports.ts';
import { priorityFromFilenames, deviceOrderMismatch } from '../domain/priority.ts';
import { buildStrokeIndex } from '../domain/strokeIndex.ts';
import { buildWordIndex } from '../domain/wordIndex.ts';
import { classify } from '../domain/classification.ts';
import { buildWordGroups, type WordGroup } from '../domain/grouping.ts';
import type { FileName, Stroke, Word } from '../domain/types.ts';

export interface ClassifyDownloadedInput {
  downloaded: Record<Stroke, Word>;
  deviceOrder?: FileName[];
}

export interface ClassifyDownloadedResult {
  groups: WordGroup[];
  deviceOrderMismatch: boolean;
}

export interface ClassifyDownloadedDeps {
  repository: DictionaryRepository;
  protectedFiles: FileName[];
}

export function createClassifyDownloadedUseCase({ repository, protectedFiles }: ClassifyDownloadedDeps) {
  return {
    execute({ downloaded, deviceOrder }: ClassifyDownloadedInput): ClassifyDownloadedResult {
      const files = repository.load();
      const priority = priorityFromFilenames(Object.keys(files));
      const strokeIndex = buildStrokeIndex(files, priority);
      const wordIndex = buildWordIndex(files, priority);

      const classified = classify(downloaded, strokeIndex, wordIndex, protectedFiles);
      const groups = buildWordGroups(classified, wordIndex, priority, protectedFiles);

      return {
        groups,
        deviceOrderMismatch: deviceOrder === undefined ? false : deviceOrderMismatch(priority.files, deviceOrder),
      };
    },
  };
}
