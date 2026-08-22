import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApp } from '../server.js';

const execFileAsync = promisify(execFile);
let server;
let baseUrl;
let dictDir;

before(async () => {
  dictDir = await mkdtemp(join(tmpdir(), 'cds-api-'));
  await writeFile(join(dictDir, 'a.json'), JSON.stringify({ TOP: 'top' }, null, 2));
  await execFileAsync('git', ['init'], { cwd: dictDir });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dictDir });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dictDir });
  await execFileAsync('git', ['add', '-A'], { cwd: dictDir });
  await execFileAsync('git', ['commit', '-m', 'seed'], { cwd: dictDir });

  const config = { dictionariesPath: dictDir, git: { autoPush: false } };
  server = createApp(config);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
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
