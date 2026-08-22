import type { DictionaryEntry, DictionaryFile, FileName, Stroke } from './types.ts';
import type { PriorityOrder } from './priority.ts';

export interface StrokeIndexEntry {
  winner: DictionaryEntry;
  shadowed: DictionaryEntry[];
}

// The firmware walks its dictionary list in priority order and returns the
// first match for a chord. So when the same stroke appears in more than one
// file (a deliberate override), the highest-priority file wins and every
// lower-priority entry is shadowed — recorded here in descending priority
// order for display purposes.
export function buildStrokeIndex(
  files: Record<FileName, DictionaryFile>,
  priority: PriorityOrder
): Map<Stroke, StrokeIndexEntry> {
  const collected = new Map<Stroke, DictionaryEntry[]>();

  for (const [file, { entries }] of Object.entries(files)) {
    for (const [stroke, word] of Object.entries(entries)) {
      const list = collected.get(stroke) ?? [];
      list.push({ stroke, word, file });
      collected.set(stroke, list);
    }
  }

  const index = new Map<Stroke, StrokeIndexEntry>();
  for (const [stroke, candidates] of collected) {
    const ordered = candidates.sort(
      (a, b) => priority.rankOf(a.file) - priority.rankOf(b.file)
    );
    index.set(stroke, { winner: ordered[0], shadowed: ordered.slice(1) });
  }
  return index;
}
