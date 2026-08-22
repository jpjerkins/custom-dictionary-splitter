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

test('unchanged is decided against the winner, not a shadowed entry', () => {
  const overridden = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'kata' } },
    '2-phil-mro.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat' } },
  };
  const priority = priorityFromFilenames(Object.keys(overridden));
  const si = buildStrokeIndex(overridden, priority);
  const wi = buildWordIndex(overridden, priority);

  // The winner for KAT is 'cat' (2-phil-mro.json outranks 6-main.json), so
  // downloading 'cat' matches the winner and is unchanged.
  const matchesWinner = classify({ KAT: 'cat' }, si, wi, ['6-main.json']);
  assert.equal(matchesWinner[0].kind, 'unchanged');

  // Downloading 'kata' matches only the shadowed entry, not the winner, so
  // it must be reported as chord-taken against the winner ('cat' in
  // 2-phil-mro.json) — never unchanged, and never pointing at the shadowed
  // 6-main.json entry.
  const matchesShadowed = classify({ KAT: 'kata' }, si, wi, ['6-main.json']);
  assert.equal(matchesShadowed[0].kind, 'chord-taken');
  assert.equal(matchesShadowed[0].diskWord, 'cat');
  assert.equal(matchesShadowed[0].diskFile, '2-phil-mro.json');
});

test('chord-taken reports the winner file and word, not a shadowed one', () => {
  const overridden = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'kata' } },
    '2-phil-mro.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat' } },
  };
  const priority = priorityFromFilenames(Object.keys(overridden));
  const si = buildStrokeIndex(overridden, priority);
  const wi = buildWordIndex(overridden, priority);

  const out = classify({ KAT: 'something-else' }, si, wi, ['6-main.json']);
  assert.equal(out[0].kind, 'chord-taken');
  assert.equal(out[0].diskWord, 'cat');
  assert.equal(out[0].diskFile, '2-phil-mro.json');
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
