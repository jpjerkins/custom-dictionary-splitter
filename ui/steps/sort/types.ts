// Local mirror of src/domain/grouping.ts + src/domain/classification.ts shapes.
// ui/ talks to the backend over HTTP only (never imports src/domain|application|
// infrastructure), so the wire shape is redeclared here rather than shared.

export type CaseKind = 'new' | 'chord-taken' | 'word-exists' | 'both' | 'unchanged';

export interface DictionaryEntry {
  stroke: string;
  word: string;
  file: string;
}

export interface NewChord {
  stroke: string;
  kind: CaseKind;
  diskWord?: string;
  diskFile?: string;
  resolution: string | null;
}

export interface WordGroup {
  word: string;
  existingChords: DictionaryEntry[];
  newChords: NewChord[];
  destinationFile: string | null;
  invariantWarning: string | null;
  priorityWarning: string | null;
}
