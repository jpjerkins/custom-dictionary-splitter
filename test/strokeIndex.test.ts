import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStrokeIndex } from '../src/domain/strokeIndex.ts';
import { priorityFromFilenames } from '../src/domain/priority.ts';

const files = {
  '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'kata' } },
  '2-phil-mro.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat', TKOG: 'dog' } },
};

test('the highest-priority file wins, and lower ones are recorded as shadowed', () => {
  const priority = priorityFromFilenames(Object.keys(files));
  const index = buildStrokeIndex(files, priority);

  const kat = index.get('KAT')!;
  assert.equal(kat.winner.word, 'cat');
  assert.equal(kat.winner.file, '2-phil-mro.json');
  assert.deepEqual(kat.shadowed, [{ stroke: 'KAT', word: 'kata', file: '6-main.json' }]);
});

test('shadowed entries are ordered by descending priority', () => {
  const three = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'c' } },
    '1-bible.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'a' } },
    '4-phil-nav.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'b' } },
  };
  const index = buildStrokeIndex(three, priorityFromFilenames(Object.keys(three)));
  assert.equal(index.get('KAT')!.winner.word, 'a');
  assert.deepEqual(index.get('KAT')!.shadowed.map((e) => e.word), ['b', 'c']);
});

test('an unshadowed stroke has an empty shadowed list', () => {
  const index = buildStrokeIndex(files, priorityFromFilenames(Object.keys(files)));
  assert.deepEqual(index.get('TKOG')!.shadowed, []);
});
