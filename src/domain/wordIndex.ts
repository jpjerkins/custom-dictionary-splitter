import type { DictionaryEntry, DictionaryFile, FileName, Word } from './types.ts';
import type { PriorityOrder } from './priority.ts';

export interface WordIndexEntry {
  word: Word;
  chords: DictionaryEntry[];
  files: FileName[];
}

// Unlike strokes, a word having multiple chords is normal — the user's
// everyday case, not a conflict. This index collects every chord that
// produces a word, plus the de-duplicated files those chords live in,
// sorted by priority (highest first) so consumers can preset a destination
// from files[0].
export function buildWordIndex(
  files: Record<FileName, DictionaryFile>,
  priority: PriorityOrder
): Map<Word, WordIndexEntry> {
  const collected = new Map<Word, DictionaryEntry[]>();

  for (const [file, { entries }] of Object.entries(files)) {
    for (const [stroke, word] of Object.entries(entries)) {
      const list = collected.get(word) ?? [];
      list.push({ stroke, word, file });
      collected.set(word, list);
    }
  }

  const index = new Map<Word, WordIndexEntry>();
  for (const [word, chords] of collected) {
    const fileSet = new Set(chords.map((c) => c.file));
    const orderedFiles = [...fileSet].sort(
      (a, b) => priority.rankOf(a) - priority.rankOf(b)
    );
    index.set(word, { word, chords, files: orderedFiles });
  }
  return index;
}
