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

test('unchanged chords produce no group', () => {
  const disk = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat' } },
  };
  const { classified, wordIndex, priority } = classifiedFor({ KAT: 'cat' }, disk);
  assert.equal(classified[0]!.kind, 'unchanged');

  const groups = buildWordGroups(classified, wordIndex, priority, []);
  assert.equal(groups.length, 0);
});
