import type { DictionaryEntry, FileName, Word } from './types.ts';
import type { PriorityOrder } from './priority.ts';
import type { WordIndexEntry } from './wordIndex.ts';
import type { CaseKind, Classified } from './classification.ts';
import type { ResolutionChoice } from './resolutions.ts';

export interface ChordRow {
  stroke: string;
  kind: CaseKind;
  diskWord?: Word;
  diskFile?: FileName;
  resolution: ResolutionChoice | null;
}

export interface WordGroup {
  word: Word;
  existingChords: DictionaryEntry[];
  newChords: ChordRow[];
  destinationFile: FileName | null;
  invariantWarning: string | null;
  priorityWarning: string | null;
}

// Builds the Step 3 display model: one group per word, sorted alphabetically,
// carrying both its on-disk chords (existingChords, shown greyed) and its
// downloaded chords (newChords, from the keyboard). 'unchanged' classified
// entries already match exactly what's on disk — same stroke, same word —
// so there is nothing new to show for them; they are dropped here rather
// than surfaced as a row with nothing to do. A word whose downloaded chords
// are all 'unchanged' therefore produces no group at all.
export function buildWordGroups(
  classified: Classified[],
  wordIndex: Map<Word, WordIndexEntry>,
  _priority: PriorityOrder,
  _protectedFiles: FileName[]
): WordGroup[] {
  const byWord = new Map<Word, Classified[]>();
  for (const entry of classified) {
    if (entry.kind === 'unchanged') continue;
    const list = byWord.get(entry.word) ?? [];
    list.push(entry);
    byWord.set(entry.word, list);
  }

  const groups: WordGroup[] = [];
  for (const [word, entries] of byWord) {
    const newChords: ChordRow[] = entries.map((entry) => ({
      stroke: entry.stroke,
      kind: entry.kind,
      diskWord: entry.diskWord,
      diskFile: entry.diskFile,
      resolution: null,
    }));

    const existingChords = wordIndex.get(word)?.chords ?? [];

    // wordFiles is already protected-filtered by classify() (Task 10), and
    // priority-ordered highest-first, so its first entry is the preset
    // destination. An empty wordFiles — the word is new, or lives only in a
    // protected file — means free choice: no preset.
    const wordFiles = entries[0]!.wordFiles;
    const destinationFile = wordFiles.length > 0 ? wordFiles[0]! : null;

    groups.push({
      word,
      existingChords,
      newChords,
      destinationFile,
      // Both warnings describe divergence from this freshly-built state
      // (moving the destination away from the preset, an override target
      // that can't win priority) which can only arise once the UI mutates
      // destinationFile/resolution after the fact — out of scope here.
      invariantWarning: null,
      priorityWarning: null,
    });
  }

  groups.sort((a, b) => a.word.localeCompare(b.word));
  return groups;
}

// A chord blocks Save while it is a live conflict ('chord-taken' or 'both')
// and still has no resolution chosen. 'new' and 'word-exists' never block.
export function hasUnresolvedConflicts(groups: WordGroup[]): boolean {
  return groups.some((group) =>
    group.newChords.some(
      (chord) =>
        (chord.kind === 'chord-taken' || chord.kind === 'both') &&
        chord.resolution === null
    )
  );
}
