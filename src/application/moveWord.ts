import type { DictionaryRepository } from './ports.ts';
import { buildWordIndex } from '../domain/wordIndex.ts';
import { priorityFromFilenames } from '../domain/priority.ts';
import type { DictionaryEntry, FileName, Stroke, Word } from '../domain/types.ts';

export interface MoveWordInput {
  word: Word;
  // Kept for API/caller convenience, but NOT trusted: the word's chords may
  // live in files the caller doesn't know about (see wordIndex lookup
  // below), so the actual set of source files is always rediscovered from
  // the freshly-loaded dictionaries rather than taken from this field.
  fromFile: FileName;
  toFile: FileName;
  capturedHashes: Record<FileName, string>;
}

export interface MoveWordResult {
  status: 'ok' | 'stale' | 'error' | 'partial';
  reason?: string;
  // Chords that were NOT moved because they live in a protected file (the
  // app never writes to stock dictionaries). Present whenever such chords
  // exist, on both 'ok' and 'partial' results, so the caller can tell the
  // user "the rest is still in 6-main.json" instead of staying silent.
  left?: DictionaryEntry[];
}

export interface MoveWordDeps {
  repository: DictionaryRepository;
  protectedFiles: FileName[];
}

// Moving a word relocates every chord for it -- from EVERY non-protected
// file that holds one, not just the file the caller happened to be looking
// at -- into toFile. Chords living in protected files are left alone (the
// app never writes to stock dictionaries) and reported back via `left` so
// the caller can tell the user about them.
//
// All files this operation will touch (toFile plus every writable source
// file) have their hashes verified BEFORE any of them are mutated -- the
// same all-or-nothing guard as the two-file case, just generalized to N
// files.
//
// Write order: toFile (the destination) is written FIRST, then each source
// file has the word's chords removed. If a later write fails, the word is
// left duplicated -- present in both toFile and the not-yet-updated source
// file(s) -- which is recoverable by deleting the duplicate. Removing from
// the source first and then failing to write the destination would instead
// DELETE the word's chords outright, which is unrecoverable. So duplication
// on partial failure is the deliberate, safer failure mode; status
// 'partial' reports exactly which files still hold the duplicate.
export function createMoveWordUseCase({ repository, protectedFiles }: MoveWordDeps) {
  const protectedSet = new Set(protectedFiles);

  return {
    execute({ word, toFile, capturedHashes }: MoveWordInput): MoveWordResult {
      if (protectedSet.has(toFile)) {
        return { status: 'error', reason: `${toFile} is a protected file and cannot be a move destination` };
      }

      const files = repository.load();

      const toInfo = files[toFile];
      if (!toInfo) {
        return { status: 'error', reason: `Unknown file: ${toFile}` };
      }

      const priority = priorityFromFilenames(Object.keys(files));
      const wordIndex = buildWordIndex(files, priority);
      const chords = wordIndex.get(word)?.chords ?? [];

      const left: DictionaryEntry[] = [];
      const chordsByWritableSource = new Map<FileName, DictionaryEntry[]>();
      for (const chord of chords) {
        if (chord.file === toFile) continue; // already in the destination
        if (protectedSet.has(chord.file)) {
          left.push(chord);
          continue;
        }
        const list = chordsByWritableSource.get(chord.file) ?? [];
        list.push(chord);
        chordsByWritableSource.set(chord.file, list);
      }

      const sourceFiles = [...chordsByWritableSource.keys()];
      const filesToTouch = [toFile, ...sourceFiles];

      const staleFiles = filesToTouch.filter((name) => {
        const info = files[name];
        return !info || info.hash !== capturedHashes[name];
      });
      if (staleFiles.length > 0) {
        return { status: 'stale', reason: `${staleFiles.join(', ')} changed since diff; re-run diff` };
      }

      const newTo: Record<Stroke, Word> = { ...toInfo.entries };
      const newSources = new Map<FileName, Record<Stroke, Word>>();
      for (const [file, fileChords] of chordsByWritableSource) {
        const newSource: Record<Stroke, Word> = { ...files[file].entries };
        for (const chord of fileChords) {
          delete newSource[chord.stroke];
          newTo[chord.stroke] = chord.word;
        }
        newSources.set(file, newSource);
      }

      try {
        repository.write(toFile, newTo);
      } catch (err) {
        // Nothing else has been written yet -- destination write is first,
        // so a failure here leaves every file untouched.
        return { status: 'error', reason: `failed to write ${toFile}, nothing changed: ${(err as Error).message}` };
      }

      const failedSources: FileName[] = [];
      for (const [file, entries] of newSources) {
        try {
          repository.write(file, entries);
        } catch (err) {
          failedSources.push(file);
        }
      }

      if (failedSources.length > 0) {
        return {
          status: 'partial',
          reason: `'${word}' was written to ${toFile} but could not be removed from ${failedSources.join(', ')}; it now exists in both -- remove it from the source file(s) manually`,
          ...(left.length > 0 ? { left } : {}),
        };
      }

      return { status: 'ok', ...(left.length > 0 ? { left } : {}) };
    },
  };
}
