import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWordIndex } from '../src/domain/wordIndex.ts';
import { priorityFromFilenames } from '../src/domain/priority.ts';

const files = {
  '4-phil-nav.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat', 'K-T': 'cat' } },
  '2-phil-mro.json': { path: '', hash: '', mtimeMs: 0, entries: { TKOG: 'dog' } },
};

test('a word collects every chord that produces it', () => {
  const index = buildWordIndex(files, priorityFromFilenames(Object.keys(files)));
  const cat = index.get('cat')!;
  assert.deepEqual(cat.chords.map((c) => c.stroke).sort(), ['K-T', 'KAT']);
  assert.deepEqual(cat.files, ['4-phil-nav.json']);
});

test('a word spanning files records each file in priority order', () => {
  const split = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat' } },
    '2-phil-mro.json': { path: '', hash: '', mtimeMs: 0, entries: { 'K-T': 'cat' } },
  };
  const index = buildWordIndex(split, priorityFromFilenames(Object.keys(split)));
  assert.deepEqual(index.get('cat')!.files, ['2-phil-mro.json', '6-main.json']);
});

test('an unknown word is absent', () => {
  const index = buildWordIndex(files, priorityFromFilenames(Object.keys(files)));
  assert.equal(index.get('zebra'), undefined);
});
