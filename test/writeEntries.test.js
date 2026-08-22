import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDictionaryFiles } from '../lib/dictionaries.js';
import { applyEntries } from '../lib/writeEntries.js';

test('applyEntries writes a new entry sorted by steno key order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-write-'));
  const filePath = join(dir, 'a.json');
  await writeFile(filePath, JSON.stringify({ TOP: 'top' }, null, 2));
  const files = loadDictionaryFiles(dir);
  const capturedHash = files['a.json'].hash;

  const results = applyEntries(files, [
    { stroke: 'TAP', translation: 'tap', destinationFile: 'a.json', capturedHash },
  ]);

  assert.equal(results[0].status, 'written');
  const written = JSON.parse(await readFile(filePath, 'utf8'));
  assert.deepEqual(Object.keys(written), ['TAP', 'TOP']);
});

test('applyEntries rejects a stale file without writing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-write-'));
  const filePath = join(dir, 'a.json');
  await writeFile(filePath, JSON.stringify({ TOP: 'top' }, null, 2));
  const files = loadDictionaryFiles(dir);

  const results = applyEntries(files, [
    { stroke: 'TAP', translation: 'tap', destinationFile: 'a.json', capturedHash: 'not-the-real-hash' },
  ]);

  assert.equal(results[0].status, 'stale');
  const untouched = JSON.parse(await readFile(filePath, 'utf8'));
  assert.deepEqual(untouched, { TOP: 'top' });
});

test('applyEntries removes a stroke when the decision sets remove', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-write-'));
  const filePath = join(dir, 'a.json');
  await writeFile(filePath, JSON.stringify({ TAP: 'tap', TOP: 'top' }, null, 2));
  const files = loadDictionaryFiles(dir);
  const capturedHash = files['a.json'].hash;

  const results = applyEntries(files, [
    { stroke: 'TAP', destinationFile: 'a.json', capturedHash, remove: true },
  ]);

  assert.equal(results[0].status, 'removed');
  const written = JSON.parse(await readFile(filePath, 'utf8'));
  assert.deepEqual(written, { TOP: 'top' });
});

test('applyEntries refuses to remove from a stale file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-write-'));
  const filePath = join(dir, 'a.json');
  await writeFile(filePath, JSON.stringify({ TAP: 'tap' }, null, 2));
  const files = loadDictionaryFiles(dir);

  const results = applyEntries(files, [
    { stroke: 'TAP', destinationFile: 'a.json', capturedHash: 'not-the-real-hash', remove: true },
  ]);

  assert.equal(results[0].status, 'stale');
  const untouched = JSON.parse(await readFile(filePath, 'utf8'));
  assert.deepEqual(untouched, { TAP: 'tap' });
});

test('applyEntries batches two decisions for the same file into one write', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-write-'));
  const filePath = join(dir, 'a.json');
  await writeFile(filePath, JSON.stringify({ TOP: 'top' }, null, 2));
  const files = loadDictionaryFiles(dir);
  const capturedHash = files['a.json'].hash;

  const results = applyEntries(files, [
    { stroke: 'TAP', translation: 'tap', destinationFile: 'a.json', capturedHash },
    { stroke: 'TEP', translation: 'tep', destinationFile: 'a.json', capturedHash },
  ]);

  assert.deepEqual(results.map((r) => r.status), ['written', 'written']);
  const written = JSON.parse(await readFile(filePath, 'utf8'));
  assert.deepEqual(written, { TAP: 'tap', TEP: 'tep', TOP: 'top' });
});

test('applyEntries returns an error for an unknown destination file without writing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-write-'));
  const filePath = join(dir, 'a.json');
  await writeFile(filePath, JSON.stringify({ TOP: 'top' }, null, 2));
  const files = loadDictionaryFiles(dir);

  const results = applyEntries(files, [
    { stroke: 'TAP', translation: 'tap', destinationFile: 'nope.json', capturedHash: 'x' },
  ]);

  assert.equal(results[0].status, 'error');
  assert.match(results[0].reason, /nope\.json/);
  const untouched = JSON.parse(await readFile(filePath, 'utf8'));
  assert.deepEqual(untouched, { TOP: 'top' });
});

test('applyEntries appends unparseable strokes at the end with a warning status', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-write-'));
  const filePath = join(dir, 'a.json');
  await writeFile(filePath, JSON.stringify({ TOP: 'top' }, null, 2));
  const files = loadDictionaryFiles(dir);
  const capturedHash = files['a.json'].hash;

  const results = applyEntries(files, [
    { stroke: '123XYZ', translation: 'weird', destinationFile: 'a.json', capturedHash },
  ]);

  assert.equal(results[0].status, 'written-unparseable-appended');
  const written = JSON.parse(await readFile(filePath, 'utf8'));
  assert.deepEqual(Object.keys(written), ['TOP', '123XYZ']);
});
