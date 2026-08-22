import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

let server;
let baseUrl;

before(async () => {
  server = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
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
