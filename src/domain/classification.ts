import type { FileName, Stroke, Word } from './types.ts';
import type { StrokeIndexEntry } from './strokeIndex.ts';
import type { WordIndexEntry } from './wordIndex.ts';

export type CaseKind = 'new' | 'chord-taken' | 'word-exists' | 'both' | 'unchanged';

export interface Classified {
  stroke: Stroke;
  word: Word;
  kind: CaseKind;
  diskWord?: Word;
  diskFile?: FileName;
  wordFiles: FileName[];
}

// 6-main.json and 7-commands.json are stock dictionaries the user never
// edits directly — he overrides their entries by defining the same chord in
// a higher-priority file instead. So a word that exists only in a protected
// file must not preset a destination: wordFiles excludes protected files,
// even though the word itself still counts as existing (kind stays
// 'word-exists').
export function classify(
  downloaded: Record<Stroke, Word>,
  strokeIndex: Map<Stroke, StrokeIndexEntry>,
  wordIndex: Map<Word, WordIndexEntry>,
  protectedFiles: FileName[]
): Classified[] {
  const protectedSet = new Set(protectedFiles);
  const out: Classified[] = [];

  for (const [stroke, word] of Object.entries(downloaded)) {
    const strokeEntry = strokeIndex.get(stroke);
    const wordEntry = wordIndex.get(word);

    const chordTaken = strokeEntry !== undefined && strokeEntry.winner.word !== word;

    // A word's on-disk occurrence under this very stroke (winner or
    // shadowed) doesn't count as "existing under other chords" — that's
    // the same chord being reassigned, already captured by chordTaken.
    // Otherwise an overridden chord (shadowed entry still holding the old
    // word) would double-count as both chord-taken and word-exists.
    const otherStrokeFiles = new Set(
      (wordEntry?.chords ?? [])
        .filter((c) => c.stroke !== stroke)
        .map((c) => c.file)
    );
    const wordExists = otherStrokeFiles.size > 0;
    const wordFiles = (wordEntry?.files ?? []).filter(
      (f) => otherStrokeFiles.has(f) && !protectedSet.has(f)
    );

    let kind: CaseKind;
    if (strokeEntry !== undefined && strokeEntry.winner.word === word) {
      kind = 'unchanged';
    } else if (chordTaken && wordExists) {
      kind = 'both';
    } else if (chordTaken) {
      kind = 'chord-taken';
    } else if (wordExists) {
      kind = 'word-exists';
    } else {
      kind = 'new';
    }

    out.push({
      stroke,
      word,
      kind,
      diskWord: chordTaken ? strokeEntry!.winner.word : undefined,
      diskFile: chordTaken ? strokeEntry!.winner.file : undefined,
      wordFiles,
    });
  }

  return out;
}
