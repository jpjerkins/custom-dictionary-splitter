import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDictionaryFiles } from '../src/infrastructure/fsDictionaryRepository.ts';
import { buildStrokeIndex } from '../src/domain/strokeIndex.ts';

test('loadDictionaryFiles reads all json files with hash and entries, ignoring non-json files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-dict-'));
  await writeFile(join(dir, 'a.json'), JSON.stringify({ KAT: 'cat' }));
  await writeFile(join(dir, 'b.json'), JSON.stringify({ TKOG: 'dog' }));
  await writeFile(join(dir, 'notes.txt'), 'ignore me');

  const files = loadDictionaryFiles(dir);

  assert.deepEqual(Object.keys(files).sort(), ['a.json', 'b.json']);
  assert.equal(files['a.json'].entries.KAT, 'cat');
  assert.equal(typeof files['a.json'].hash, 'string');
});

test('buildStrokeIndex merges entries across files by stroke', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-dict-'));
  await writeFile(join(dir, 'a.json'), JSON.stringify({ KAT: 'cat' }));
  await writeFile(join(dir, 'b.json'), JSON.stringify({ TKOG: 'dog' }));
  const files = loadDictionaryFiles(dir);

  const index = buildStrokeIndex(files);

  assert.equal(index.KAT.file, 'a.json');
  assert.equal(index.KAT.translation, 'cat');
  assert.equal(index.TKOG.file, 'b.json');
});
