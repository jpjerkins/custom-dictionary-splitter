import type { DictionaryFile } from '../application/ports.ts';
import type { FileName, Stroke, Word } from './types.ts';

export interface StrokeIndexEntry {
  file: FileName;
  translation: Word;
}

// When the same stroke appears in more than one file, the file processed
// last (readdirSync order) wins in the index — this should not happen in
// practice since strokes are meant to be unique across the dictionary set.
export function buildStrokeIndex(
  dictionaryFiles: Record<FileName, DictionaryFile>
): Record<Stroke, StrokeIndexEntry> {
  const index: Record<Stroke, StrokeIndexEntry> = {};
  for (const [file, { entries }] of Object.entries(dictionaryFiles)) {
    for (const [stroke, translation] of Object.entries(entries)) {
      index[stroke] = { file, translation };
    }
  }
  return index;
}
