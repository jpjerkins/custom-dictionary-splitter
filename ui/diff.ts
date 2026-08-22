// Ported from public/js/diff.js (kept there for the legacy frontend). Pure,
// browser-side diff of the downloaded device dictionary against the on-disk
// index returned by GET /api/dictionaries.

export interface DiffEntry {
  stroke: string;
  translation: string;
}

export interface ConflictEntry {
  stroke: string;
  keyboardTranslation: string;
  existingTranslation: string;
  existingFile: string;
}

export interface DiffResult {
  new: DiffEntry[];
  conflict: ConflictEntry[];
  unchanged: DiffEntry[];
}

export interface DictionaryIndexEntry {
  file: string;
  translation: string;
}

export function diffDictionary(
  downloaded: Record<string, string>,
  index: Record<string, DictionaryIndexEntry>,
): DiffResult {
  const result: DiffResult = { new: [], conflict: [], unchanged: [] };
  for (const [stroke, translation] of Object.entries(downloaded)) {
    const existing = index[stroke];
    if (!existing) {
      result.new.push({ stroke, translation });
    } else if (existing.translation !== translation) {
      result.conflict.push({
        stroke,
        keyboardTranslation: translation,
        existingTranslation: existing.translation,
        existingFile: existing.file,
      });
    } else {
      result.unchanged.push({ stroke, translation });
    }
  }
  return result;
}
