import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/domain/classification.ts';
import { buildStrokeIndex } from '../src/domain/strokeIndex.ts';
import { buildWordIndex } from '../src/domain/wordIndex.ts';
import { priorityFromFilenames } from '../src/domain/priority.ts';

test('classifies all five outcomes', () => {
  const disk = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'kata', SAME: 'same' } },
    '4-phil-nav.json': { path: '', hash: '', mtimeMs: 0, entries: { 'K-T': 'cat' } },
  };
  const priority = priorityFromFilenames(Object.keys(disk));
  const si = buildStrokeIndex(disk, priority);
  const wi = buildWordIndex(disk, priority);

  const out = classify(
    { NEW: 'zebra', KAT: 'cat', 'K-AT': 'cat', SAME: 'same', TPHO: 'kata' },
    si, wi, ['6-main.json'],
  );
  const by = Object.fromEntries(out.map((c) => [c.stroke, c]));

  assert.equal(by.NEW.kind, 'new');
  assert.equal(by.SAME.kind, 'unchanged');
  // KAT is taken by 'kata', and 'cat' already exists under K-T
  assert.equal(by.KAT.kind, 'both');
  assert.equal(by.KAT.diskWord, 'kata');
  assert.equal(by.KAT.diskFile, '6-main.json');
  // K-AT is a free chord, but 'cat' already exists
  assert.equal(by['K-AT'].kind, 'word-exists');
  assert.deepEqual(by['K-AT'].wordFiles, ['4-phil-nav.json']);
  // TPHO is a free chord for a word that lives only in a protected file
  assert.equal(by.TPHO.kind, 'word-exists');
});

test('wordFiles excludes protected files so main never presets a destination', () => {
  const disk = { '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat' } } };
  const priority = priorityFromFilenames(Object.keys(disk));
  const out = classify(
    { 'K-T': 'cat' },
    buildStrokeIndex(disk, priority),
    buildWordIndex(disk, priority),
    ['6-main.json'],
  );
  assert.deepEqual(out[0].wordFiles, []);
});
