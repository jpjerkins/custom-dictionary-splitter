export type Stroke = string;
export type Word = string;
export type FileName = string;

export interface DictionaryEntry {
  stroke: Stroke;
  word: Word;
  file: FileName;
}
