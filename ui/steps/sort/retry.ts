// Pure retry-row logic. Ported from public/js/steps/step3-sort.js's
// buildRetryRows/dropRow (see git history — that file was deleted when the
// old frontend was cut over). When Step 6 sends failed entries back to
// Sort, each becomes a retry row here instead of going through a fresh
// POST /api/classify: the entry is already on disk (SortTable's earlier
// Save already wrote it), so its destination is fixed — moving it would
// leave a duplicate behind — and dropping it must RESTORE the prior
// on-disk translation, not delete the stroke outright, when the row
// started life as a conflict that overwrote something. Losing that
// distinction was the exact bug fixed in commit 70deb4e; this file exists
// so the React port can't reintroduce it.
import type { ChecklistRow } from '../../testChecklist.ts';

// What SortTable records in wizard state for each entry it successfully
// saves — enough to reconstruct a retry row if Step 6 later fails it.
export interface MovedEntry {
  stroke: string;
  translation: string;
  destinationFile: string;
  // True only for a write that overwrote an existing on-disk entry in
  // place (a 'chord-taken'/'both' chord resolved as keep-keyboard). Every
  // other resolution (override, re-chord, a plain new/word-exists chord)
  // writes to a location nothing occupied, so dropping it is a plain
  // delete — nothing to restore.
  wasConflict: boolean;
  existingTranslation?: string;
}

export interface RetryRow {
  stroke: string;
  translation: string;
  destinationFile: string;
  wasConflict: boolean;
  existingTranslation?: string;
}

export function buildRetryRows(failedChecklistRows: ChecklistRow[], movedEntries: MovedEntry[]): RetryRow[] {
  return failedChecklistRows.map((row) => {
    const moved = movedEntries.find((e) => e.stroke === row.stroke);
    return {
      stroke: row.stroke,
      translation: row.expected,
      destinationFile: moved ? moved.destinationFile : '',
      wasConflict: moved ? moved.wasConflict : false,
      existingTranslation: moved?.existingTranslation,
    };
  });
}
