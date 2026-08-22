import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDictionaryFiles, createFsDictionaryRepository } from '../src/infrastructure/fsDictionaryRepository.ts';
import { createMoveWordUseCase } from '../src/application/moveWord.ts';
import type { FileName } from '../src/domain/types.ts';

const PROTECTED_FILES: FileName[] = ['6-main.json', '7-commands.json'];

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'cds-move-'));
  await writeFile(join(dir, '4-phil-nav.json'), JSON.stringify({ KAT: 'cat', 'K-T': 'cat' }, null, 2));
  await writeFile(join(dir, '2-phil-mro.json'), JSON.stringify({}, null, 2));
  await writeFile(join(dir, '6-main.json'), JSON.stringify({}, null, 2));

  const repository = createFsDictionaryRepository(dir);
  const moveWord = createMoveWordUseCase({ repository, protectedFiles: PROTECTED_FILES });

  function currentHashes(): Record<FileName, string> {
    const files = loadDictionaryFiles(dir);
    const hashes: Record<FileName, string> = {};
    for (const [name, info] of Object.entries(files)) hashes[name] = info.hash;
    return hashes;
  }

  async function read(file: FileName): Promise<unknown> {
    return JSON.parse(await readFile(join(dir, file), 'utf8'));
  }

  return { dir, moveWord, currentHashes, read };
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
