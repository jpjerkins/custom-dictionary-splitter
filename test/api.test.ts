import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.ts';

const execFileAsync = promisify(execFile);
let server: Server;
let baseUrl: string;
let dictDir: string;

before(async () => {
  dictDir = await mkdtemp(join(tmpdir(), 'cds-api-'));
  await writeFile(join(dictDir, 'a.json'), JSON.stringify({ TOP: 'top' }, null, 2));
  await writeFile(join(dictDir, 'b.json'), JSON.stringify({ KPA: 'cap' }, null, 2));
  await execFileAsync('git', ['init'], { cwd: dictDir });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dictDir });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dictDir });
  await execFileAsync('git', ['add', '-A'], { cwd: dictDir });
  await execFileAsync('git', ['commit', '-m', 'seed'], { cwd: dictDir });

  const config = { dictionariesPath: dictDir, protectedFiles: [], git: { autoPush: false } };
  server = createApp(config);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

test('GET /api/dictionaries returns files and stroke index', async () => {
  const response = await fetch(`${baseUrl}/api/dictionaries`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.index.TOP.translation, 'top');
  assert.equal(typeof body.files['a.json'].hash, 'string');
});

test('GET /api/dictionaries also returns priority and protectedFiles alongside the original index', async () => {
  const response = await fetch(`${baseUrl}/api/dictionaries`);
  const body = await response.json();

  assert.equal(response.status, 200);
  // Original shape must still be present unchanged.
  assert.equal(body.index.TOP.translation, 'top');
  assert.equal(body.index.TOP.file, 'a.json');
  assert.equal(typeof body.files['a.json'].hash, 'string');
  // New keys.
  assert.deepEqual(body.priority, ['a.json', 'b.json']);
  assert.deepEqual(body.protectedFiles, []);
});

test('POST /api/classify returns groups sorted alphabetically by word', async () => {
  const response = await fetch(`${baseUrl}/api/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ downloaded: { TPHU: 'zebra', TPHRAO: 'apple' } }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.groups.map((g: { word: string }) => g.word),
    ['apple', 'zebra']
  );
  assert.equal(body.deviceOrderMismatch, false);
});

test('POST /api/classify reports deviceOrderMismatch true for a scrambled device order', async () => {
  const response = await fetch(`${baseUrl}/api/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ downloaded: { TPHU: 'zebra' }, deviceOrder: ['b.json', 'a.json'] }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.deviceOrderMismatch, true);
});

test('POST /api/classify reports deviceOrderMismatch false for a correct order including extra non-file dictionaries', async () => {
  const response = await fetch(`${baseUrl}/api/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      downloaded: { TPHU: 'zebra' },
      deviceOrder: ['a.json', 'b.json', 'user_dictionary'],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.deviceOrderMismatch, false);
});

test('POST /api/move-word surfaces ok, stale, and error statuses from the use case', async () => {
  const dictResponse = await fetch(`${baseUrl}/api/dictionaries`);
  const { files } = await dictResponse.json();

  const okResponse = await fetch(`${baseUrl}/api/move-word`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      word: 'top',
      fromFile: 'a.json',
      toFile: 'b.json',
      capturedHashes: { 'a.json': files['a.json'].hash, 'b.json': files['b.json'].hash },
    }),
  });
  const okBody = await okResponse.json();
  assert.equal(okResponse.status, 200);
  assert.equal(okBody.status, 'ok');

  const staleResponse = await fetch(`${baseUrl}/api/move-word`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      word: 'cap',
      fromFile: 'b.json',
      toFile: 'a.json',
      capturedHashes: { 'a.json': 'stale-hash', 'b.json': 'stale-hash' },
    }),
  });
  const staleBody = await staleResponse.json();
  assert.equal(staleResponse.status, 200);
  assert.equal(staleBody.status, 'stale');

  const errorResponse = await fetch(`${baseUrl}/api/move-word`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      word: 'cap',
      fromFile: 'b.json',
      toFile: 'does-not-exist.json',
      capturedHashes: {},
    }),
  });
  const errorBody = await errorResponse.json();
  assert.equal(errorResponse.status, 200);
  assert.equal(errorBody.status, 'error');
});

test('POST /api/save writes a new entry', async () => {
  const dictResponse = await fetch(`${baseUrl}/api/dictionaries`);
  const { files } = await dictResponse.json();

  const response = await fetch(`${baseUrl}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decisions: [
        { stroke: 'TAP', translation: 'tap', destinationFile: 'a.json', capturedHash: files['a.json'].hash },
      ],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.results[0].status, 'written');
});

test('POST /api/save with malformed JSON returns an error without crashing the server', async () => {
  const response = await fetch(`${baseUrl}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not valid json',
  });

  assert.equal(response.status, 500);

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
});

test('POST /api/commit commits saved changes locally', async () => {
  const response = await fetch(`${baseUrl}/api/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Add TAP' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.committed, true);
  assert.equal(body.pushed, false);
});
