export type Stroke = string;
export type Word = string;
export type FileName = string;

export interface DictionaryEntry {
  stroke: Stroke;
  word: Word;
  file: FileName;
}

export interface DictionaryFile {
  path: string;
  entries: Record<Stroke, Word>;
  hash: string;
  mtimeMs: number;
}
