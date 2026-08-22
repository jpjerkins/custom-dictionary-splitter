import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDictionaryFiles, createFsDictionaryRepository } from '../src/infrastructure/fsDictionaryRepository.ts';
import { createMoveWordUseCase } from '../src/application/moveWord.ts';
import type { DictionaryRepository } from '../src/application/ports.ts';
import type { FileName, Stroke, Word } from '../src/domain/types.ts';

const PROTECTED_FILES: FileName[] = ['6-main.json', '7-commands.json'];

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'cds-move-'));
  await writeFile(join(dir, '4-phil-nav.json'), JSON.stringify({ KAT: 'cat', 'K-T': 'cat' }, null, 2));
  await writeFile(join(dir, '2-phil-mro.json'), JSON.stringify({}, null, 2));
  await writeFile(join(dir, '6-main.json'), JSON.stringify({}, null, 2));

  const repository = createFsDictionaryRepository(dir);
  const moveWord = createMoveWordUseCase({ repository, protectedFiles: PROTECTED_FILES });

  return { dir, repository, moveWord, currentHashes: () => currentHashesOf(dir), read: (f: FileName) => readJson(dir, f) };
}

// Word 'cat' lives in THREE files: two writable (4-phil-nav.json, 1-bible.json)
// and one protected (6-main.json). Used to test the multi-file relocation and
// the 'left' reporting of protected chords that must NOT move.
async function setupMultiFile() {
  const dir = await mkdtemp(join(tmpdir(), 'cds-move-multi-'));
  await writeFile(join(dir, '4-phil-nav.json'), JSON.stringify({ KAT: 'cat', 'K-T': 'cat' }, null, 2));
  await writeFile(join(dir, '1-bible.json'), JSON.stringify({ 'KAT/KAT': 'cat' }, null, 2));
  await writeFile(join(dir, '6-main.json'), JSON.stringify({ KABT: 'cat' }, null, 2));
  await writeFile(join(dir, '2-phil-mro.json'), JSON.stringify({}, null, 2));

  const repository = createFsDictionaryRepository(dir);
  const moveWord = createMoveWordUseCase({ repository, protectedFiles: PROTECTED_FILES });

  return { dir, repository, moveWord, currentHashes: () => currentHashesOf(dir), read: (f: FileName) => readJson(dir, f) };
}

function currentHashesOf(dir: string): Record<FileName, string> {
  const files = loadDictionaryFiles(dir);
  const hashes: Record<FileName, string> = {};
  for (const [name, info] of Object.entries(files)) hashes[name] = info.hash;
  return hashes;
}

async function readJson(dir: string, file: FileName): Promise<unknown> {
  return JSON.parse(await readFile(join(dir, file), 'utf8'));
}

// Wraps a real fs-backed repository but makes writing to `failOnFile` throw,
// simulating a real I/O failure (disk full, permissions) on that one write
// while every other file still goes through the real filesystem. This lets
// us exercise the 'partial' failure path through the same DictionaryRepository
// port production code uses, without faking the assertions.
function repositoryWithFailingWrite(dir: string, failOnFile: FileName): DictionaryRepository {
  const real = createFsDictionaryRepository(dir);
  return {
    load: () => real.load(),
    write: (file: FileName, entries: Record<Stroke, Word>) => {
      if (file === failOnFile) {
        throw new Error('simulated write failure');
      }
      real.write(file, entries);
    },
  };
}

test('moving a word removes every chord from the old file and writes them to the new one', async () => {
  const { moveWord, currentHashes, read } = await setup();

  const result = moveWord.execute({
    word: 'cat',
    fromFile: '4-phil-nav.json',
    toFile: '2-phil-mro.json',
    capturedHashes: currentHashes(),
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(await read('4-phil-nav.json'), {});
  assert.deepEqual(await read('2-phil-mro.json'), { KAT: 'cat', 'K-T': 'cat' });
});

test('a stale hash on the destination file aborts the move with nothing written', async () => {
  const { moveWord, currentHashes, read } = await setup();
  const before = { from: await read('4-phil-nav.json'), to: await read('2-phil-mro.json') };

  const hashes = currentHashes();
  hashes['2-phil-mro.json'] = 'stale';
  const result = moveWord.execute({
    word: 'cat',
    fromFile: '4-phil-nav.json',
    toFile: '2-phil-mro.json',
    capturedHashes: hashes,
  });

  assert.equal(result.status, 'stale');
  assert.deepEqual(await read('4-phil-nav.json'), before.from);
  assert.deepEqual(await read('2-phil-mro.json'), before.to);
});

test('a stale hash on the source file aborts the move with nothing written', async () => {
  const { moveWord, currentHashes, read } = await setup();
  const before = { from: await read('4-phil-nav.json'), to: await read('2-phil-mro.json') };

  const hashes = currentHashes();
  hashes['4-phil-nav.json'] = 'stale';
  const result = moveWord.execute({
    word: 'cat',
    fromFile: '4-phil-nav.json',
    toFile: '2-phil-mro.json',
    capturedHashes: hashes,
  });

  assert.equal(result.status, 'stale');
  assert.deepEqual(await read('4-phil-nav.json'), before.from);
  assert.deepEqual(await read('2-phil-mro.json'), before.to);
});

test('a protected file is rejected as a move destination', async () => {
  const { moveWord, currentHashes, read } = await setup();
  const before = { from: await read('4-phil-nav.json'), to: await read('6-main.json') };

  const result = moveWord.execute({
    word: 'cat',
    fromFile: '4-phil-nav.json',
    toFile: '6-main.json',
    capturedHashes: currentHashes(),
  });

  assert.equal(result.status, 'error');
  assert.match(result.reason ?? '', /protected/i);
  assert.deepEqual(await read('4-phil-nav.json'), before.from);
  assert.deepEqual(await read('6-main.json'), before.to);
});

test('a word with chords in three files moves the writable ones and leaves+reports the protected one', async () => {
  const { moveWord, currentHashes, read } = await setupMultiFile();

  const result = moveWord.execute({
    word: 'cat',
    fromFile: '4-phil-nav.json',
    toFile: '2-phil-mro.json',
    capturedHashes: currentHashes(),
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(await read('4-phil-nav.json'), {});
  assert.deepEqual(await read('1-bible.json'), {});
  assert.deepEqual(await read('2-phil-mro.json'), { KAT: 'cat', 'K-T': 'cat', 'KAT/KAT': 'cat' });
  // Protected file is untouched.
  assert.deepEqual(await read('6-main.json'), { KABT: 'cat' });
  assert.deepEqual(result.left, [{ stroke: 'KABT', word: 'cat', file: '6-main.json' }]);
});

test('a stale hash on a third (non-fromFile) source file aborts everything with nothing written', async () => {
  const { moveWord, currentHashes, read } = await setupMultiFile();
  const before = {
    fromFile: await read('4-phil-nav.json'),
    bible: await read('1-bible.json'),
    to: await read('2-phil-mro.json'),
    main: await read('6-main.json'),
  };

  const hashes = currentHashes();
  hashes['1-bible.json'] = 'stale';
  const result = moveWord.execute({
    word: 'cat',
    fromFile: '4-phil-nav.json',
    toFile: '2-phil-mro.json',
    capturedHashes: hashes,
  });

  assert.equal(result.status, 'stale');
  assert.deepEqual(await read('4-phil-nav.json'), before.fromFile);
  assert.deepEqual(await read('1-bible.json'), before.bible);
  assert.deepEqual(await read('2-phil-mro.json'), before.to);
  assert.deepEqual(await read('6-main.json'), before.main);
});

test('a write failure on a source file after the destination write succeeds reports partial and leaves the word duplicated', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-move-partial-'));
  await writeFile(join(dir, '4-phil-nav.json'), JSON.stringify({ KAT: 'cat', 'K-T': 'cat' }, null, 2));
  await writeFile(join(dir, '2-phil-mro.json'), JSON.stringify({}, null, 2));
  await writeFile(join(dir, '6-main.json'), JSON.stringify({}, null, 2));

  const hashes = currentHashesOf(dir);
  const failingRepository = repositoryWithFailingWrite(dir, '4-phil-nav.json');
  const moveWord = createMoveWordUseCase({ repository: failingRepository, protectedFiles: PROTECTED_FILES });

  const result = moveWord.execute({
    word: 'cat',
    fromFile: '4-phil-nav.json',
    toFile: '2-phil-mro.json',
    capturedHashes: hashes,
  });

  assert.equal(result.status, 'partial');
  assert.match(result.reason ?? '', /4-phil-nav\.json/);
  assert.match(result.reason ?? '', /2-phil-mro\.json/);
  // Destination write went through first -- the word landed there.
  assert.deepEqual(await readJson(dir, '2-phil-mro.json'), { KAT: 'cat', 'K-T': 'cat' });
  // Source write failed -- nothing was removed, so it's still there too.
  // Duplicated-but-recoverable, not silently lost.
  assert.deepEqual(await readJson(dir, '4-phil-nav.json'), { KAT: 'cat', 'K-T': 'cat' });
});
