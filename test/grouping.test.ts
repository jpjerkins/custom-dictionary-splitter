import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWordGroups, hasUnresolvedConflicts } from '../src/domain/grouping.ts';
import { classify } from '../src/domain/classification.ts';
import { buildStrokeIndex } from '../src/domain/strokeIndex.ts';
import { buildWordIndex } from '../src/domain/wordIndex.ts';
import { priorityFromFilenames } from '../src/domain/priority.ts';
import type { DictionaryFile, FileName, Stroke, Word } from '../src/domain/types.ts';

// Builds classified entries the same way classification.test.ts does: a
// small on-disk fixture, real indexes, and a real classify() call, so the
// grouping tests exercise the actual pipeline rather than hand-built
// Classified values.
function classifiedFor(
  downloaded: Record<Stroke, Word>,
  disk: Record<FileName, DictionaryFile> = {},
  protectedFiles: FileName[] = []
) {
  const priority = priorityFromFilenames(Object.keys(disk));
  const strokeIndex = buildStrokeIndex(disk, priority);
  const wordIndex = buildWordIndex(disk, priority);
  const classified = classify(downloaded, strokeIndex, wordIndex, protectedFiles);
  return { classified, wordIndex, priority };
}

test('groups are sorted alphabetically by word', () => {
  const { classified, wordIndex, priority } = classifiedFor({
    TKOG: 'dog',
    KAT: 'cat',
    PWEUG: 'big',
  });
  const groups = buildWordGroups(classified, wordIndex, priority, []);
  assert.deepEqual(groups.map((g) => g.word), ['big', 'cat', 'dog']);
});

test('every chord for a word shares one group', () => {
  const { classified, wordIndex, priority } = classifiedFor({
    KAT: 'cat',
    'K-T': 'cat',
  });
  const groups = buildWordGroups(classified, wordIndex, priority, []);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0]!.newChords.map((c) => c.stroke).sort(),
    ['K-T', 'KAT']
  );
});

test('an existing word presets the destination and lists its on-disk chords', () => {
  const disk = {
    '4-phil-nav.json': { path: '', hash: '', mtimeMs: 0, entries: { 'K-T': 'cat' } },
  };
  const { classified, wordIndex, priority } = classifiedFor({ KAT: 'cat' }, disk);
  const groups = buildWordGroups(classified, wordIndex, priority, []);
  assert.equal(groups[0]!.destinationFile, '4-phil-nav.json');
  assert.deepEqual(
    groups[0]!.existingChords.map((c) => c.stroke),
    ['K-T']
  );
});

test('a word living only in a protected file is a free choice, not a preset', () => {
  const disk = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat' } },
  };
  const protectedFiles = ['6-main.json'];
  const { classified, wordIndex, priority } = classifiedFor(
    { 'K-T': 'cat' },
    disk,
    protectedFiles
  );
  const groups = buildWordGroups(classified, wordIndex, priority, protectedFiles);
  assert.equal(groups[0]!.destinationFile, null);
});

test('unresolved conflicts are reported so Save can be blocked', () => {
  const disk = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'kata' } },
  };
  const { classified, wordIndex, priority } = classifiedFor({ KAT: 'cat' }, disk);
  assert.equal(classified[0]!.kind, 'chord-taken');

  const groups = buildWordGroups(classified, wordIndex, priority, []);
  assert.equal(hasUnresolvedConflicts(groups), true);

  groups[0]!.newChords[0]!.resolution = { kind: 'keep-disk' };
  assert.equal(hasUnresolvedConflicts(groups), false);
});

test('new and word-exists chords never block saving', () => {
  const disk = {
    '4-phil-nav.json': { path: '', hash: '', mtimeMs: 0, entries: { 'K-T': 'cat' } },
  };
  // PWEUG/big is a brand-new word+chord. KAT/cat is a free chord for a word
  // that already exists on disk under a different chord.
  const { classified, wordIndex, priority } = classifiedFor(
    { PWEUG: 'big', KAT: 'cat' },
    disk
  );
  assert.equal(classified.find((c) => c.stroke === 'PWEUG')!.kind, 'new');
  assert.equal(classified.find((c) => c.stroke === 'KAT')!.kind, 'word-exists');

  const groups = buildWordGroups(classified, wordIndex, priority, []);
  for (const group of groups) {
    for (const chord of group.newChords) {
      assert.equal(chord.resolution, null);
      assert.ok(chord.kind === 'new' || chord.kind === 'word-exists');
    }
  }
  assert.equal(hasUnresolvedConflicts(groups), false);
});

test('a word whose on-disk chords span two files presets the highest-priority one', () => {
  const mainFile = { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'disciple' } };
  const bibleFile = { path: '', hash: '', mtimeMs: 0, entries: { TKEUS: 'disciple' } };
  const navFile = { path: '', hash: '', mtimeMs: 0, entries: { TKEUZ: 'disciple' } };
  const protectedFiles = ['6-main.json'];

  // Same three files, declared in two different key orders, to prove the
  // preset comes from priority (via wordFiles' sort in buildWordIndex), not
  // from whatever order the files happen to appear in the source object.
  const diskOrderA = {
    '6-main.json': mainFile,
    '1-bible.json': bibleFile,
    '4-phil-nav.json': navFile,
  };
  const diskOrderB = {
    '4-phil-nav.json': navFile,
    '1-bible.json': bibleFile,
    '6-main.json': mainFile,
  };

  for (const disk of [diskOrderA, diskOrderB]) {
    const { classified, wordIndex, priority } = classifiedFor(
      { STKAOEUS: 'disciple' },
      disk,
      protectedFiles
    );
    assert.equal(classified[0]!.kind, 'word-exists');
    const groups = buildWordGroups(classified, wordIndex, priority, protectedFiles);
    // wordFiles excludes protected '6-main.json'; of the remaining
    // '1-bible.json' and '4-phil-nav.json', '1-bible.json' outranks.
    assert.equal(groups[0]!.destinationFile, '1-bible.json');
  }
});

test('unchanged chords produce no group', () => {
  const disk = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat' } },
  };
  const { classified, wordIndex, priority } = classifiedFor({ KAT: 'cat' }, disk);
  assert.equal(classified[0]!.kind, 'unchanged');

  const groups = buildWordGroups(classified, wordIndex, priority, []);
  assert.equal(groups.length, 0);
});
