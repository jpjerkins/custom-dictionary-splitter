import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.ts';

let server: Server;
let baseUrl: string;

before(async () => {
  server = createApp({ dictionariesPath: process.cwd(), protectedFiles: [], git: { autoPush: false } });
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

test('GET /api/health returns ok', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: 'ok' });
});

test('GET / serves the static index.html', async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /Custom Dictionary Splitter/);
});

test('GET /missing.js returns 404', async () => {
  const response = await fetch(`${baseUrl}/missing.js`);
  assert.equal(response.status, 404);
});
