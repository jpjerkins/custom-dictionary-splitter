import type { DictionaryRepository } from './ports.ts';
import type { FileName, Stroke, Word } from '../domain/types.ts';

export interface ApplyDecision {
  stroke: Stroke;
  translation?: Word;
  destinationFile: FileName;
  capturedHash: string;
  remove?: boolean;
}

export interface ApplyResult {
  stroke: Stroke;
  status: 'written' | 'written-unparseable-appended' | 'removed' | 'stale' | 'error';
  reason?: string;
}

export type ApplyEntriesFn = (
  dictionaryFiles: ReturnType<DictionaryRepository['load']>,
  decisions: ApplyDecision[],
  repository: DictionaryRepository
) => ApplyResult[];

export interface SaveDecisionsDeps {
  repository: DictionaryRepository;
  applyEntries: ApplyEntriesFn;
}

export interface SaveDecisionsInput {
  decisions: ApplyDecision[];
}

export interface SaveDecisionsResult {
  results: ApplyResult[];
}

export function createSaveDecisionsUseCase({ repository, applyEntries }: SaveDecisionsDeps) {
  return {
    execute({ decisions }: SaveDecisionsInput): SaveDecisionsResult {
      const files = repository.load();
      const results = applyEntries(files, decisions, repository);
      return { results };
    },
  };
}
