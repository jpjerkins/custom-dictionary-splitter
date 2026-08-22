# Custom Dictionary Splitter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local webapp that downloads new steno entries from a Javelin-firmware keyboard over Web Serial, guides the user through sorting them into their `steno-dictionaries` repo, rebuilding/flashing firmware, testing the result, and optionally committing/pushing.

**Architecture:** One local Node process serves a static, framework-free frontend (plain HTML/JS ES modules, no build step) and a small HTTP API (Node core `http`, zero dependencies) for filesystem and git operations against the configured dictionaries folder. Web Serial talks to the keyboard directly from the browser, only during Step 1 of the wizard.

**Tech Stack:** Node.js (20+) core modules only — `http`, `fs`, `path`, `crypto`, `child_process` — no npm dependencies, no bundler. ESM (`"type": "module"`) throughout, so pure logic modules under `public/js/` are shared verbatim between the browser and Node's built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-08-21-custom-dictionary-splitter-design.md`

## Global Constraints

- Zero npm dependencies — Node core modules only, no framework, no build step.
- Node's built-in test runner (`node --test`) is the only test tool; no external test framework.
- ESM everywhere (`"type": "module"` in package.json).
- `config.json` is local-only and gitignored; `config.example.json` is the checked-in template. Shape: `{ "dictionariesPath": "<absolute path>", "git": { "autoPush": false } }`.
- `dictionariesPath`'s candidate destination files are **every** `*.json` file directly in that folder — no curated subset.
- `git.autoPush` defaults to `false`; a push only happens when the config explicitly sets it `true`.
- Canonical steno key order for sorting: `STKPWHRAO*EUFRPBLGTSDZ` (22 keys, left-consonants/vowels/right-consonants).
- Nothing in this app auto-commits to `steno-dictionaries` except the explicit Step 7 action, and it never pushes unless `git.autoPush` is `true`.

---

### Task 1: Project scaffolding & server skeleton

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `config.example.json`
- Create: `public/index.html` (placeholder, replaced fully in Task 11)
- Create: `server.js`
- Test: `test/server.test.js`

**Interfaces:**
- Produces: `createApp()` (no-arg form used only in this task; Task 7 changes its signature to `createApp(config)` — see Task 7's Interfaces block) exported from `server.js`, returns a `node:http` `Server` instance that serves static files from `public/` and responds to `GET /api/health`.

- [ ] **Step 1: Write the failing test**

```js
// test/server.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL — `Cannot find module '../server.js'` (or similar), since none of the scaffolding files exist yet.

- [ ] **Step 3: Create the scaffolding files**

```json
// package.json
{
  "name": "custom-dictionary-splitter",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  }
}
```

```
// .gitignore
config.json
node_modules/
```

```json
// config.example.json
{
  "dictionariesPath": "/Users/phil/dev/steno-dictionaries",
  "git": { "autoPush": false }
}
```

```html
<!-- public/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Custom Dictionary Splitter</title>
</head>
<body>
  <h1>Custom Dictionary Splitter</h1>
  <p>Wizard UI goes here.</p>
</body>
</html>
```

```js
// server.js
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = join(process.cwd(), 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = normalize(join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
}

export function createApp() {
  return createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    serveStatic(req, res);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createApp().listen(PORT, () => {
    console.log(`custom-dictionary-splitter running at http://localhost:${PORT}`);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore config.example.json public/index.html server.js test/server.test.js
git commit -m "feat: add server skeleton with static hosting and health check"
```

---

### Task 2: Steno key-order comparator

**Files:**
- Create: `lib/stenoOrder.js`
- Test: `test/stenoOrder.test.js`

**Interfaces:**
- Produces: `strokeToKeyIndices(stroke: string): { indices: number[], unparseable: boolean }`, `compareStrokes(a: string, b: string): number`, `isStrokeParseable(stroke: string): boolean` — all exported from `lib/stenoOrder.js`. `compareStrokes` and `isStrokeParseable` are consumed by Task 5 (`lib/writeEntries.js`).

- [ ] **Step 1: Write the failing test**

```js
// test/stenoOrder.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareStrokes, isStrokeParseable } from '../lib/stenoOrder.js';

test('compareStrokes orders single strokes by canonical key position', () => {
  assert.ok(compareStrokes('S', 'T') < 0);
  assert.ok(compareStrokes('TAP', 'TOP') < 0);
  assert.ok(compareStrokes('TOP', 'TAP') > 0);
  assert.equal(compareStrokes('KAT', 'KAT'), 0);
});

test('compareStrokes orders multi-strokes by first differing chord, then length', () => {
  assert.ok(compareStrokes('KAT', 'KAT/TOEG') < 0);
  assert.ok(compareStrokes('TEFT/-G', 'TEFT/-D') < 0);
});

test('isStrokeParseable is true for keys in the canonical order and false otherwise', () => {
  assert.equal(isStrokeParseable('KAT'), true);
  assert.equal(isStrokeParseable('STAPBD/*UP'), true);
  assert.equal(isStrokeParseable('123XYZ'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/stenoOrder.test.js`
Expected: FAIL — `Cannot find module '../lib/stenoOrder.js'`

- [ ] **Step 3: Write the implementation**

```js
// lib/stenoOrder.js
const KEY_ORDER = 'STKPWHRAO*EUFRPBLGTSDZ';

export function strokeToKeyIndices(stroke) {
  const chars = stroke.replace(/-/g, '').split('');
  const indices = [];
  let cursor = 0;
  let unparseable = false;
  for (const ch of chars) {
    const found = KEY_ORDER.indexOf(ch, cursor);
    if (found === -1) {
      unparseable = true;
      indices.push(KEY_ORDER.length);
    } else {
      indices.push(found);
      cursor = found + 1;
    }
  }
  return { indices, unparseable };
}

export function compareStrokes(a, b) {
  const strokesA = a.split('/');
  const strokesB = b.split('/');
  const len = Math.max(strokesA.length, strokesB.length);
  for (let i = 0; i < len; i++) {
    if (i >= strokesA.length) return -1;
    if (i >= strokesB.length) return 1;
    const { indices: ia } = strokeToKeyIndices(strokesA[i]);
    const { indices: ib } = strokeToKeyIndices(strokesB[i]);
    const cmpLen = Math.max(ia.length, ib.length);
    for (let j = 0; j < cmpLen; j++) {
      const va = j < ia.length ? ia[j] : -1;
      const vb = j < ib.length ? ib[j] : -1;
      if (va !== vb) return va - vb;
    }
  }
  return 0;
}

export function isStrokeParseable(stroke) {
  return stroke.split('/').every((s) => !strokeToKeyIndices(s).unparseable);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/stenoOrder.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/stenoOrder.js test/stenoOrder.test.js
git commit -m "feat: add canonical steno key-order comparator"
```

---

### Task 3: Config loader

**Files:**
- Create: `lib/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Produces: `loadConfig(configPath: string): { dictionariesPath: string, git: { autoPush: boolean } }` — throws on missing file, missing/invalid `dictionariesPath`, or a `dictionariesPath` that doesn't exist on disk. Consumed by `server.js` (Task 7) at startup.

- [ ] **Step 1: Write the failing test**

```js
// test/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.js';

test('loadConfig reads dictionariesPath and defaults git.autoPush to false', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-config-'));
  const dictDir = join(dir, 'dicts');
  await mkdir(dictDir);
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify({ dictionariesPath: dictDir }));

  const config = loadConfig(configPath);

  assert.equal(config.dictionariesPath, dictDir);
  assert.equal(config.git.autoPush, false);
});

test('loadConfig throws when dictionariesPath does not exist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-config-'));
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify({ dictionariesPath: join(dir, 'missing') }));

  assert.throws(() => loadConfig(configPath), /does not exist/);
});

test('loadConfig throws when the config file is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-config-'));
  assert.throws(() => loadConfig(join(dir, 'config.json')), /not found/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.js`
Expected: FAIL — `Cannot find module '../lib/config.js'`

- [ ] **Step 3: Write the implementation**

```js
// lib/config.js
import { readFileSync, existsSync } from 'node:fs';

export function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Copy config.example.json to config.json and edit it.`);
  }
  const raw = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.dictionariesPath || typeof parsed.dictionariesPath !== 'string') {
    throw new Error('config.json must set "dictionariesPath" to a string path');
  }
  if (!existsSync(parsed.dictionariesPath)) {
    throw new Error(`dictionariesPath does not exist: ${parsed.dictionariesPath}`);
  }
  return {
    dictionariesPath: parsed.dictionariesPath,
    git: { autoPush: Boolean(parsed.git?.autoPush) },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/config.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/config.js test/config.test.js
git commit -m "feat: add config loader"
```

---

### Task 4: Dictionary file reader & stroke index

**Files:**
- Create: `lib/dictionaries.js`
- Test: `test/dictionaries.test.js`

**Interfaces:**
- Consumes: none.
- Produces: `loadDictionaryFiles(dirPath: string): { [fileName: string]: { path: string, entries: Record<string,string>, hash: string, mtimeMs: number } }` and `buildStrokeIndex(dictionaryFiles): { [stroke: string]: { file: string, translation: string } }`. Both consumed by Task 5 (`writeEntries.js`) and Task 7 (`routes/api.js`).

- [ ] **Step 1: Write the failing test**

```js
// test/dictionaries.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDictionaryFiles, buildStrokeIndex } from '../lib/dictionaries.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dictionaries.test.js`
Expected: FAIL — `Cannot find module '../lib/dictionaries.js'`

- [ ] **Step 3: Write the implementation**

```js
// lib/dictionaries.js
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export function loadDictionaryFiles(dirPath) {
  const files = readdirSync(dirPath).filter((f) => f.endsWith('.json'));
  const result = {};
  for (const file of files) {
    const fullPath = join(dirPath, file);
    const raw = readFileSync(fullPath, 'utf8');
    const entries = JSON.parse(raw);
    const hash = createHash('sha256').update(raw).digest('hex');
    result[file] = { path: fullPath, entries, hash, mtimeMs: statSync(fullPath).mtimeMs };
  }
  return result;
}

// When the same stroke appears in more than one file, the file processed
// last (readdirSync order) wins in the index — this should not happen in
// practice since strokes are meant to be unique across the dictionary set.
export function buildStrokeIndex(dictionaryFiles) {
  const index = {};
  for (const [file, { entries }] of Object.entries(dictionaryFiles)) {
    for (const [stroke, translation] of Object.entries(entries)) {
      index[stroke] = { file, translation };
    }
  }
  return index;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/dictionaries.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/dictionaries.js test/dictionaries.test.js
git commit -m "feat: add dictionary file reader and stroke index builder"
```

---

### Task 5: Server-side entry writer

**Files:**
- Create: `lib/writeEntries.js`
- Test: `test/writeEntries.test.js`

**Interfaces:**
- Consumes: `loadDictionaryFiles` result shape from Task 4; `compareStrokes`, `isStrokeParseable` from Task 2.
- Produces: `applyEntries(dictionaryFiles, decisions: Array<{ stroke: string, translation: string, destinationFile: string, capturedHash: string }>): Array<{ stroke: string, status: 'written'|'written-unparseable-appended'|'stale'|'error', reason?: string }>`. Consumed by Task 7 (`routes/api.js`, `POST /api/save`).

- [ ] **Step 1: Write the failing test**

```js
// test/writeEntries.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/writeEntries.test.js`
Expected: FAIL — `Cannot find module '../lib/writeEntries.js'`

- [ ] **Step 3: Write the implementation**

```js
// lib/writeEntries.js
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compareStrokes, isStrokeParseable } from './stenoOrder.js';

function hashOf(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

export function applyEntries(dictionaryFiles, decisions) {
  const results = [];
  const byFile = new Map();

  for (const decision of decisions) {
    const fileInfo = dictionaryFiles[decision.destinationFile];
    if (!fileInfo) {
      results.push({ stroke: decision.stroke, status: 'error', reason: `Unknown file: ${decision.destinationFile}` });
      continue;
    }
    const currentRaw = readFileSync(fileInfo.path, 'utf8');
    if (hashOf(currentRaw) !== decision.capturedHash) {
      results.push({ stroke: decision.stroke, status: 'stale', reason: `${decision.destinationFile} changed since diff; re-run diff` });
      continue;
    }
    if (!byFile.has(decision.destinationFile)) {
      byFile.set(decision.destinationFile, { path: fileInfo.path, entries: { ...fileInfo.entries } });
    }
    byFile.get(decision.destinationFile).entries[decision.stroke] = decision.translation;
    results.push({
      stroke: decision.stroke,
      status: isStrokeParseable(decision.stroke) ? 'written' : 'written-unparseable-appended',
    });
  }

  for (const { path, entries } of byFile.values()) {
    const sortedStrokes = Object.keys(entries).sort((a, b) => {
      const aParseable = isStrokeParseable(a);
      const bParseable = isStrokeParseable(b);
      if (aParseable && !bParseable) return -1;
      if (!aParseable && bParseable) return 1;
      if (!aParseable && !bParseable) return 0;
      return compareStrokes(a, b);
    });
    const sorted = {};
    for (const stroke of sortedStrokes) sorted[stroke] = entries[stroke];
    writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  }

  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/writeEntries.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/writeEntries.js test/writeEntries.test.js
git commit -m "feat: add dictionary entry writer with staleness check and re-sort"
```

---

### Task 6: Git helper

**Files:**
- Create: `lib/git.js`
- Test: `test/git.test.js`

**Interfaces:**
- Produces: `commitAndMaybePush(dirPath: string, message: string, autoPush: boolean): Promise<{ committed: boolean, pushed: boolean, message: string }>`. Consumed by Task 7 (`routes/api.js`, `POST /api/commit`).

- [ ] **Step 1: Write the failing test**

```js
// test/git.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitAndMaybePush } from '../lib/git.js';

const execFileAsync = promisify(execFile);

async function initRepo(dir) {
  await execFileAsync('git', ['init'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

test('commitAndMaybePush commits without pushing when autoPush is false', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-git-'));
  await initRepo(dir);
  await writeFile(join(dir, 'a.json'), '{}');

  const result = await commitAndMaybePush(dir, 'test commit', false);

  assert.equal(result.committed, true);
  assert.equal(result.pushed, false);
  const { stdout } = await execFileAsync('git', ['log', '--oneline'], { cwd: dir });
  assert.match(stdout, /test commit/);
});

test('commitAndMaybePush reports nothing to commit when working tree is clean', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-git-'));
  await initRepo(dir);
  await writeFile(join(dir, 'a.json'), '{}');
  await commitAndMaybePush(dir, 'first commit', false);

  const result = await commitAndMaybePush(dir, 'second commit', false);

  assert.equal(result.committed, false);
});

test('commitAndMaybePush pushes when autoPush is true', async () => {
  const bareDir = await mkdtemp(join(tmpdir(), 'cds-bare-'));
  await execFileAsync('git', ['init', '--bare'], { cwd: bareDir });

  const dir = await mkdtemp(join(tmpdir(), 'cds-git-'));
  await initRepo(dir);
  await execFileAsync('git', ['remote', 'add', 'origin', bareDir], { cwd: dir });
  await writeFile(join(dir, 'a.json'), '{}');
  await execFileAsync('git', ['add', '-A'], { cwd: dir });
  await execFileAsync('git', ['commit', '-m', 'seed'], { cwd: dir });
  await execFileAsync('git', ['push', '-u', 'origin', 'HEAD'], { cwd: dir });

  await writeFile(join(dir, 'b.json'), '{}');
  const result = await commitAndMaybePush(dir, 'second commit', true);

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  const { stdout } = await execFileAsync('git', ['log', '--oneline'], { cwd: bareDir });
  assert.match(stdout, /second commit/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/git.test.js`
Expected: FAIL — `Cannot find module '../lib/git.js'`

- [ ] **Step 3: Write the implementation**

```js
// lib/git.js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runGit(args, cwd) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

export async function commitAndMaybePush(dirPath, message, autoPush) {
  await runGit(['add', '-A'], dirPath);
  const status = await runGit(['status', '--porcelain'], dirPath);
  if (!status) {
    return { committed: false, pushed: false, message: 'Nothing to commit' };
  }
  await runGit(['commit', '-m', message], dirPath);
  let pushed = false;
  if (autoPush) {
    await runGit(['push'], dirPath);
    pushed = true;
  }
  return { committed: true, pushed, message };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/git.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/git.js test/git.test.js
git commit -m "feat: add git commit/push helper"
```

---

### Task 7: API routes

**Files:**
- Create: `routes/api.js`
- Modify: `server.js` (whole file — `createApp()` becomes `createApp(config)`, startup block loads config)
- Modify: `test/server.test.js` (update calls to `createApp()` to pass a minimal config)
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `loadDictionaryFiles`, `buildStrokeIndex` (Task 4), `applyEntries` (Task 5), `commitAndMaybePush` (Task 6), `loadConfig` (Task 3).
- Produces: `handleApiRequest(req, res, config)` from `routes/api.js`; `createApp(config: { dictionariesPath: string, git: { autoPush: boolean } })` from `server.js`, now required by all callers. Consumed by Task 8+ frontend code via `fetch('/api/...')`.

- [ ] **Step 1: Write the failing test**

```js
// test/api.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/api.test.js`
Expected: FAIL — `createApp` still only accepts zero args and `/api/dictionaries` etc. don't exist (404/`TypeError`).

- [ ] **Step 3: Write the implementation**

```js
// routes/api.js
import { loadDictionaryFiles, buildStrokeIndex } from '../lib/dictionaries.js';
import { applyEntries } from '../lib/writeEntries.js';
import { commitAndMaybePush } from '../lib/git.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handleApiRequest(req, res, config) {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/dictionaries') {
      const files = loadDictionaryFiles(config.dictionariesPath);
      const index = buildStrokeIndex(files);
      const fileSummaries = Object.fromEntries(
        Object.entries(files).map(([name, info]) => [name, { hash: info.hash }])
      );
      sendJson(res, 200, { files: fileSummaries, index });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/save') {
      const { decisions } = await readBody(req);
      const files = loadDictionaryFiles(config.dictionariesPath);
      const results = applyEntries(files, decisions);
      sendJson(res, 200, { results });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/commit') {
      const { message } = await readBody(req);
      const result = await commitAndMaybePush(config.dictionariesPath, message, config.git.autoPush);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}
```

```js
// server.js (full replacement)
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { loadConfig } from './lib/config.js';
import { handleApiRequest } from './routes/api.js';

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = join(process.cwd(), 'public');
const CONFIG_PATH = process.env.CONFIG_PATH || join(process.cwd(), 'config.json');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = normalize(join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
}

export function createApp(config) {
  return createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      await handleApiRequest(req, res, config);
      return;
    }
    serveStatic(req, res);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig(CONFIG_PATH);
  createApp(config).listen(PORT, () => {
    console.log(`custom-dictionary-splitter running at http://localhost:${PORT}`);
  });
}
```

Update `test/server.test.js`'s `before()` block to pass a config, since `createApp()` now requires one:

```js
// test/server.test.js — before() block replacement
before(async () => {
  server = createApp({ dictionariesPath: process.cwd(), git: { autoPush: false } });
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all tests across `test/server.test.js` and `test/api.test.js`)

- [ ] **Step 5: Commit**

```bash
git add routes/api.js server.js test/server.test.js test/api.test.js
git commit -m "feat: wire dictionaries/save/commit API routes into the server"
```

---

### Task 8: Client diff module

**Files:**
- Create: `public/js/diff.js`
- Test: `test/diff.test.js`

**Interfaces:**
- Produces: `diffDictionary(downloaded: Record<string,string>, index: Record<string,{file:string,translation:string}>): { new: Array<{stroke,translation}>, conflict: Array<{stroke,keyboardTranslation,existingTranslation,existingFile}>, unchanged: Array<{stroke,translation}> }`. Consumed by Task 12's `step2-diff.js`.

- [ ] **Step 1: Write the failing test**

```js
// test/diff.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffDictionary } from '../public/js/diff.js';

test('diffDictionary buckets new, conflicting, and unchanged strokes', () => {
  const downloaded = { KAT: 'cat', TKOG: 'dog', SPH: 'smile' };
  const index = {
    KAT: { file: 'a.json', translation: 'cat' },
    TKOG: { file: 'a.json', translation: 'canine' },
  };

  const result = diffDictionary(downloaded, index);

  assert.deepEqual(result.new, [{ stroke: 'SPH', translation: 'smile' }]);
  assert.deepEqual(result.conflict, [
    { stroke: 'TKOG', keyboardTranslation: 'dog', existingTranslation: 'canine', existingFile: 'a.json' },
  ]);
  assert.deepEqual(result.unchanged, [{ stroke: 'KAT', translation: 'cat' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diff.test.js`
Expected: FAIL — `Cannot find module '../public/js/diff.js'`

- [ ] **Step 3: Write the implementation**

```js
// public/js/diff.js
export function diffDictionary(downloaded, index) {
  const result = { new: [], conflict: [], unchanged: [] };
  for (const [stroke, translation] of Object.entries(downloaded)) {
    const existing = index[stroke];
    if (!existing) {
      result.new.push({ stroke, translation });
    } else if (existing.translation !== translation) {
      result.conflict.push({
        stroke,
        keyboardTranslation: translation,
        existingTranslation: existing.translation,
        existingFile: existing.file,
      });
    } else {
      result.unchanged.push({ stroke, translation });
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diff.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add public/js/diff.js test/diff.test.js
git commit -m "feat: add client-side dictionary diff module"
```

---

### Task 9: Serial protocol parser

**Files:**
- Create: `public/js/serial-protocol.js`
- Test: `test/serial-protocol.test.js`

**Interfaces:**
- Produces: `createResponseAccumulator(): { push(chunk: string): void, tryExtractResponse(): string | null }`, `parseDictionaryList(responseText: string): string[]`, `parseDictionaryJson(responseText: string): Record<string,string>`. Consumed by Task 10's `public/js/serial.js`.

- [ ] **Step 1: Write the failing test**

```js
// test/serial-protocol.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResponseAccumulator, parseDictionaryList, parseDictionaryJson } from '../public/js/serial-protocol.js';

test('createResponseAccumulator waits for a blank-line terminator across chunks', () => {
  const accumulator = createResponseAccumulator();

  accumulator.push('KAT: cat\n');
  assert.equal(accumulator.tryExtractResponse(), null);

  accumulator.push('TKOG: dog\n\n');
  assert.equal(accumulator.tryExtractResponse(), 'KAT: cat\nTKOG: dog');
});

test('parseDictionaryList splits and trims lines', () => {
  assert.deepEqual(parseDictionaryList('user_dictionary\nmain_dictionary\n'), ['user_dictionary', 'main_dictionary']);
});

test('parseDictionaryJson parses valid JSON and throws on malformed input', () => {
  assert.deepEqual(parseDictionaryJson('{"KAT":"cat"}'), { KAT: 'cat' });
  assert.throws(() => parseDictionaryJson('not json'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/serial-protocol.test.js`
Expected: FAIL — `Cannot find module '../public/js/serial-protocol.js'`

- [ ] **Step 3: Write the implementation**

```js
// public/js/serial-protocol.js
export function createResponseAccumulator() {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
    },
    tryExtractResponse() {
      const terminatorIndex = buffer.indexOf('\n\n');
      if (terminatorIndex === -1) return null;
      const response = buffer.slice(0, terminatorIndex);
      buffer = buffer.slice(terminatorIndex + 2);
      return response;
    },
  };
}

export function parseDictionaryList(responseText) {
  return responseText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseDictionaryJson(responseText) {
  return JSON.parse(responseText);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/serial-protocol.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add public/js/serial-protocol.js test/serial-protocol.test.js
git commit -m "feat: add serial console response parser"
```

---

### Task 10: Serial transport glue

**Files:**
- Create: `public/js/serial.js`

**Interfaces:**
- Consumes: `createResponseAccumulator`, `parseDictionaryList`, `parseDictionaryJson` from Task 9.
- Produces: `connectToKeyboard(): Promise<SerialPort>`, `listDictionaries(port): Promise<string[]>`, `downloadUserDictionary(port, dictionaryName: string): Promise<Record<string,string>>`. Consumed by Task 11's `step1-connect.js`.

This task talks to `navigator.serial`, which only exists in a real browser with real hardware attached — it cannot run under `node --test`. Verification is manual, in-browser, against the actual keyboard.

- [ ] **Step 1: Write the implementation**

```js
// public/js/serial.js
import { createResponseAccumulator, parseDictionaryList, parseDictionaryJson } from './serial-protocol.js';

export async function connectToKeyboard() {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  return port;
}

async function sendCommand(port, command) {
  const writer = port.writable.getWriter();
  await writer.write(new TextEncoder().encode(`${command}\n`));
  writer.releaseLock();

  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  const accumulator = createResponseAccumulator();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      accumulator.push(decoder.decode(value, { stream: true }));
      const response = accumulator.tryExtractResponse();
      if (response !== null) return response;
    }
    throw new Error('Serial connection closed before response completed');
  } finally {
    reader.releaseLock();
  }
}

export async function listDictionaries(port) {
  const response = await sendCommand(port, 'list_dictionaries');
  return parseDictionaryList(response);
}

export async function downloadUserDictionary(port, dictionaryName) {
  const response = await sendCommand(port, `print_dictionary ${dictionaryName}`);
  return parseDictionaryJson(response);
}
```

- [ ] **Step 2: Manual verification**

With the Starboard plugged in and `npm start` running:
1. Serve `public/` via the app (full wizard wiring lands in Task 11 — for this task, it's enough to confirm the module has no syntax errors: open `http://localhost:4173`, open the browser devtools console, and run `import('/js/serial.js').then(m => console.log(Object.keys(m)))`. Expected: logs `['connectToKeyboard', 'listDictionaries', 'downloadUserDictionary']` with no import errors.
2. Full hardware round-trip verification (connect, list, download) happens as part of Task 11's manual verification, once the UI exists to trigger it.

- [ ] **Step 3: Commit**

```bash
git add public/js/serial.js
git commit -m "feat: add Web Serial transport for Javelin console protocol"
```

---

### Task 11: Wizard shell, state, and Step 1 (Connect & Download)

**Files:**
- Modify: `public/index.html` (full replacement of the Task 1 placeholder)
- Create: `public/js/state.js`
- Create: `public/js/steps/step1-connect.js`
- Create: `public/app.js`
- Create: `public/style.css`

**Interfaces:**
- Produces: `state` (mutable shared object) and `showStep(name: 'connect'|'diff'|'sort'|'empty'|'flash'|'test'|'commit'): void` from `public/js/state.js`, consumed by every step module (Tasks 11-15). `showStep` dispatches a `wizard:enter` `CustomEvent` on the newly-shown `<section>` so steps can react to becoming visible.
- Produces: `initStep1(): void` from `step1-connect.js`, called once from `app.js`.

- [ ] **Step 1: Replace the placeholder HTML with the full wizard shell**

```html
<!-- public/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Custom Dictionary Splitter</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <h1>Custom Dictionary Splitter</h1>

  <section id="step-connect">
    <h2>1. Connect &amp; Download</h2>
    <button id="connect-button">Connect keyboard</button>
    <p id="connect-status"></p>
  </section>

  <section id="step-diff" hidden>
    <h2>2. New &amp; Conflicting Entries</h2>
    <div id="diff-summary"></div>
    <button id="diff-continue-button">Continue to sort</button>
  </section>

  <section id="step-sort" hidden>
    <h2>3. Sort Entries</h2>
    <table id="sort-table"><tbody></tbody></table>
    <button id="save-button">Commit to disk</button>
    <p id="save-status"></p>
  </section>

  <section id="step-empty" hidden>
    <h2>4. Empty On-Device Dictionary</h2>
    <p>
      Open
      <a href="https://lim.au/#/software/javelin-steno-tools/dictionary-management" target="_blank" rel="noopener">
        the Javelin dictionary management tool
      </a>
      and clear the user dictionary on the keyboard.
    </p>
    <button id="empty-done-button">Done, continue</button>
  </section>

  <section id="step-flash" hidden>
    <h2>5. Flash New Firmware</h2>
    <p>
      Open
      <a href="https://lim.au/#/software/javelin-steno/starboardRp2040" target="_blank" rel="noopener">
        the Starboard RP2040 firmware builder
      </a>
      and flash the rebuilt firmware. The keyboard will disconnect to enter flashing mode &mdash;
      that's expected, the dictionary was already downloaded in step 1.
    </p>
    <button id="flash-done-button">Done, continue</button>
  </section>

  <section id="step-test" hidden>
    <h2>6. Test Moved Entries</h2>
    <table id="test-table"><tbody></tbody></table>
    <button id="test-retry-button">Go back to Sort</button>
    <button id="test-continue-button">All entries pass, continue</button>
    <p id="test-status"></p>
  </section>

  <section id="step-commit" hidden>
    <h2>7. Commit &amp; Push</h2>
    <button id="commit-button">Commit &amp; push</button>
    <p id="commit-status"></p>
  </section>

  <script type="module" src="/app.js"></script>
</body>
</html>
```

```css
/* public/style.css */
body {
  font-family: system-ui, sans-serif;
  max-width: 60rem;
  margin: 2rem auto;
  padding: 0 1rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
}

td, th {
  border: 1px solid #ccc;
  padding: 0.25rem 0.5rem;
}

.status-pass { color: green; }
.status-fail { color: crimson; }
.status-pending { color: #888; }
```

- [ ] **Step 2: Create the shared state module**

```js
// public/js/state.js
export const state = {
  port: null,
  downloadedDictionary: null,
  dictionaryIndex: null,
  fileHashes: null,
  diffResult: null,
  movedEntries: [],
  checklist: [],
};

const STEP_NAMES = ['connect', 'diff', 'sort', 'empty', 'flash', 'test', 'commit'];

export function showStep(name) {
  for (const step of STEP_NAMES) {
    const el = document.getElementById(`step-${step}`);
    const isTarget = step === name;
    el.hidden = !isTarget;
    if (isTarget) {
      el.dispatchEvent(new CustomEvent('wizard:enter'));
    }
  }
}
```

- [ ] **Step 3: Create Step 1's wiring**

```js
// public/js/steps/step1-connect.js
import { connectToKeyboard, listDictionaries, downloadUserDictionary } from '../serial.js';
import { state, showStep } from '../state.js';

const USER_DICTIONARY_CANDIDATES = ['user_dictionary', 'user'];

export function initStep1() {
  const connectButton = document.getElementById('connect-button');
  const statusEl = document.getElementById('connect-status');

  connectButton.addEventListener('click', async () => {
    statusEl.textContent = 'Connecting...';
    try {
      state.port = await connectToKeyboard();
      const names = await listDictionaries(state.port);
      const userDictName = USER_DICTIONARY_CANDIDATES.find((c) => names.includes(c)) || names[names.length - 1];
      statusEl.textContent = `Downloading "${userDictName}"...`;
      state.downloadedDictionary = await downloadUserDictionary(state.port, userDictName);
      statusEl.textContent = `Downloaded ${Object.keys(state.downloadedDictionary).length} entries.`;
      showStep('diff');
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    }
  });
}
```

- [ ] **Step 4: Wire it into the app entry point**

```js
// public/app.js
import { showStep } from './js/state.js';
import { initStep1 } from './js/steps/step1-connect.js';

initStep1();
showStep('connect');
```

- [ ] **Step 5: Manual verification**

1. Run `npm start`, open `http://localhost:4173` in Chrome or Edge with the Starboard plugged in.
2. Confirm only the "1. Connect & Download" section is visible.
3. Click "Connect keyboard", pick the Starboard's serial port from the browser's picker.
4. Confirm the status line progresses "Connecting..." → "Downloading "<name>"..." → "Downloaded N entries." and the view switches to "2. New & Conflicting Entries" (empty for now — Task 12 fills it in).
5. If step 3 fails, note the exact error text (useful for diagnosing the real `USER_DICTIONARY_CANDIDATES` name or chunking behavior called out as open items in the spec) and adjust `USER_DICTIONARY_CANDIDATES` or the accumulator's terminator logic accordingly before moving on.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/js/state.js public/js/steps/step1-connect.js public/app.js public/style.css
git commit -m "feat: add wizard shell and Step 1 connect/download UI"
```

---

### Task 12: Step 2 (Diff display) and Step 3 (Sort & Save) UI

**Files:**
- Create: `public/js/steps/step2-diff.js`
- Create: `public/js/steps/step3-sort.js`
- Modify: `public/app.js` (add the two new step imports/inits)

**Interfaces:**
- Consumes: `state`, `showStep` from Task 11; `diffDictionary` from Task 8; `GET /api/dictionaries` and `POST /api/save` from Task 7.
- Produces: `initStep2(): void`, `initStep3(): void`. Sets `state.movedEntries` for Task 14's checklist.

- [ ] **Step 1: Create Step 2's wiring**

```js
// public/js/steps/step2-diff.js
import { state, showStep } from '../state.js';
import { diffDictionary } from '../diff.js';

export function initStep2() {
  const summaryEl = document.getElementById('diff-summary');
  const continueButton = document.getElementById('diff-continue-button');

  continueButton.addEventListener('click', () => showStep('sort'));

  document.getElementById('step-diff').addEventListener('wizard:enter', async () => {
    const response = await fetch('/api/dictionaries');
    const { files, index } = await response.json();
    state.dictionaryIndex = index;
    state.fileHashes = Object.fromEntries(Object.entries(files).map(([name, info]) => [name, info.hash]));
    state.diffResult = diffDictionary(state.downloadedDictionary, index);
    summaryEl.textContent =
      `${state.diffResult.new.length} new, ${state.diffResult.conflict.length} conflicts, ` +
      `${state.diffResult.unchanged.length} unchanged.`;
  });
}
```

- [ ] **Step 2: Create Step 3's wiring**

```js
// public/js/steps/step3-sort.js
import { state, showStep } from '../state.js';

function buildRows() {
  const newRows = state.diffResult.new.map((e) => ({
    stroke: e.stroke,
    translation: e.translation,
    destinationFile: Object.keys(state.fileHashes)[0],
    conflict: false,
  }));
  const conflictRows = state.diffResult.conflict.map((e) => ({
    stroke: e.stroke,
    translation: e.keyboardTranslation,
    destinationFile: e.existingFile,
    conflict: true,
  }));
  return [...newRows, ...conflictRows];
}

function renderRows(tbody, rows) {
  tbody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');

    const strokeTd = document.createElement('td');
    strokeTd.textContent = row.stroke + (row.conflict ? ' (conflict)' : '');
    tr.appendChild(strokeTd);

    const translationTd = document.createElement('td');
    const translationInput = document.createElement('input');
    translationInput.value = row.translation;
    translationInput.addEventListener('input', () => {
      row.translation = translationInput.value;
    });
    translationTd.appendChild(translationInput);
    tr.appendChild(translationTd);

    const fileTd = document.createElement('td');
    const fileSelect = document.createElement('select');
    for (const fileName of Object.keys(state.fileHashes)) {
      const option = document.createElement('option');
      option.value = fileName;
      option.textContent = fileName;
      if (fileName === row.destinationFile) option.selected = true;
      fileSelect.appendChild(option);
    }
    fileSelect.addEventListener('change', () => {
      row.destinationFile = fileSelect.value;
    });
    fileTd.appendChild(fileSelect);
    tr.appendChild(fileTd);

    tbody.appendChild(tr);
  }
}

export function initStep3() {
  const tbody = document.querySelector('#sort-table tbody');
  const saveButton = document.getElementById('save-button');
  const statusEl = document.getElementById('save-status');
  let rows = [];

  document.getElementById('step-sort').addEventListener('wizard:enter', () => {
    rows = buildRows();
    renderRows(tbody, rows);
  });

  saveButton.addEventListener('click', async () => {
    const decisions = rows.map((row) => ({
      stroke: row.stroke,
      translation: row.translation,
      destinationFile: row.destinationFile,
      capturedHash: state.fileHashes[row.destinationFile],
    }));
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions }),
    });
    const { results } = await response.json();
    const failed = results.filter((r) => r.status === 'stale' || r.status === 'error');
    if (failed.length > 0) {
      statusEl.textContent = `${failed.length} entries failed: ${failed.map((f) => `${f.stroke} (${f.reason})`).join(', ')}`;
      return;
    }
    statusEl.textContent = `Saved ${results.length} entries.`;
    state.movedEntries = rows.map((row) => ({ stroke: row.stroke, translation: row.translation }));
    showStep('empty');
  });
}
```

- [ ] **Step 3: Wire both into the app entry point**

```js
// public/app.js
import { showStep } from './js/state.js';
import { initStep1 } from './js/steps/step1-connect.js';
import { initStep2 } from './js/steps/step2-diff.js';
import { initStep3 } from './js/steps/step3-sort.js';

initStep1();
initStep2();
initStep3();
showStep('connect');
```

- [ ] **Step 4: Manual verification**

1. Run `npm start`, connect the keyboard as in Task 11.
2. Confirm the diff summary shows correct new/conflict/unchanged counts (cross-check against what you know is new on the keyboard).
3. Click "Continue to sort"; confirm each new/conflict entry appears as a row with an editable translation and a destination-file dropdown listing every `*.json` file from `dictionariesPath`.
4. Change a destination file and a translation for one row, click "Commit to disk".
5. Confirm the status line reports success, and check the actual file on disk (`git diff` in `steno-dictionaries`) to confirm the entry landed in the right file, correctly sorted by steno key order relative to its neighbors.
6. Re-run the wizard from Step 1 without touching the file — confirm the just-added stroke now shows as "unchanged" in the Step 2 summary (proves the diff is reading live data, not stale).

- [ ] **Step 5: Commit**

```bash
git add public/js/steps/step2-diff.js public/js/steps/step3-sort.js public/app.js
git commit -m "feat: add diff display and sort/save UI"
```

---

### Task 13: Step 4 & 5 (Empty dictionary / Flash firmware) handoff UI

**Files:**
- Create: `public/js/steps/step4-empty.js`
- Create: `public/js/steps/step5-flash.js`
- Modify: `public/app.js` (add the two new step imports/inits)

**Interfaces:**
- Consumes: `showStep` from Task 11.
- Produces: `initStep4(): void`, `initStep5(): void`.

- [ ] **Step 1: Create Step 4 and Step 5 wiring**

```js
// public/js/steps/step4-empty.js
import { showStep } from '../state.js';

export function initStep4() {
  document.getElementById('empty-done-button').addEventListener('click', () => showStep('flash'));
}
```

```js
// public/js/steps/step5-flash.js
import { showStep } from '../state.js';

export function initStep5() {
  document.getElementById('flash-done-button').addEventListener('click', () => showStep('test'));
}
```

- [ ] **Step 2: Wire both into the app entry point**

```js
// public/app.js
import { showStep } from './js/state.js';
import { initStep1 } from './js/steps/step1-connect.js';
import { initStep2 } from './js/steps/step2-diff.js';
import { initStep3 } from './js/steps/step3-sort.js';
import { initStep4 } from './js/steps/step4-empty.js';
import { initStep5 } from './js/steps/step5-flash.js';

initStep1();
initStep2();
initStep3();
initStep4();
initStep5();
showStep('connect');
```

- [ ] **Step 3: Manual verification**

1. Run `npm start`, walk through Steps 1-3 as before.
2. On Step 4, confirm the link opens `lim.au`'s dictionary management page in a new tab; on the Starboard, actually clear the user dictionary using that page.
3. Click "Done, continue"; confirm Step 5 appears with the firmware-builder link and the note about the keyboard disconnecting during flashing.
4. Actually rebuild and flash the firmware from that page, confirming the keyboard disconnect during flashing doesn't produce any error in this app (since nothing here holds a live connection at this point).
5. Click "Done, continue"; confirm Step 6 appears (built in Task 14).

- [ ] **Step 4: Commit**

```bash
git add public/js/steps/step4-empty.js public/js/steps/step5-flash.js public/app.js
git commit -m "feat: add empty-dictionary and flash-firmware handoff steps"
```

---

### Task 14: Step 6 (Test checklist) UI

**Files:**
- Create: `public/js/testChecklist.js`
- Create: `public/js/steps/step6-test.js`
- Modify: `public/app.js` (add the new step import/init)
- Test: `test/testChecklist.test.js`

**Interfaces:**
- Consumes: `state.movedEntries` from Task 12, `showStep` from Task 11.
- Produces: `buildTestChecklist(movedEntries: Array<{stroke,translation}>): Array<{stroke,expected,actual,status}>`, `checkRow(row, actualValue: string): row` from `public/js/testChecklist.js`. `initStep6(): void`.

- [ ] **Step 1: Write the failing test**

```js
// test/testChecklist.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestChecklist, checkRow } from '../public/js/testChecklist.js';

test('buildTestChecklist creates a pending row per moved entry', () => {
  const checklist = buildTestChecklist([{ stroke: 'KAT', translation: 'cat' }]);
  assert.deepEqual(checklist, [{ stroke: 'KAT', expected: 'cat', actual: '', status: 'pending' }]);
});

test('checkRow marks pass when actual matches expected, fail otherwise', () => {
  const row = { stroke: 'KAT', expected: 'cat', actual: '', status: 'pending' };
  assert.equal(checkRow(row, 'cat').status, 'pass');
  assert.equal(checkRow(row, 'dog').status, 'fail');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/testChecklist.test.js`
Expected: FAIL — `Cannot find module '../public/js/testChecklist.js'`

- [ ] **Step 3: Write the implementation**

```js
// public/js/testChecklist.js
export function buildTestChecklist(movedEntries) {
  return movedEntries.map(({ stroke, translation }) => ({
    stroke,
    expected: translation,
    actual: '',
    status: 'pending',
  }));
}

export function checkRow(row, actualValue) {
  return {
    ...row,
    actual: actualValue,
    status: actualValue === row.expected ? 'pass' : 'fail',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/testChecklist.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Create Step 6's DOM wiring**

```js
// public/js/steps/step6-test.js
import { state, showStep } from '../state.js';
import { buildTestChecklist, checkRow } from '../testChecklist.js';

function renderChecklist(tbody, checklist, onUpdate) {
  tbody.innerHTML = '';
  checklist.forEach((row, i) => {
    const tr = document.createElement('tr');

    const strokeTd = document.createElement('td');
    strokeTd.textContent = row.stroke;
    tr.appendChild(strokeTd);

    const expectedTd = document.createElement('td');
    expectedTd.textContent = row.expected;
    tr.appendChild(expectedTd);

    const actualTd = document.createElement('td');
    const actualInput = document.createElement('input');
    actualInput.value = row.actual;
    actualInput.addEventListener('input', () => onUpdate(i, actualInput.value));
    actualTd.appendChild(actualInput);
    tr.appendChild(actualTd);

    const statusTd = document.createElement('td');
    statusTd.textContent = row.status;
    statusTd.className = `status-${row.status}`;
    tr.appendChild(statusTd);

    tbody.appendChild(tr);
  });
}

export function initStep6() {
  const tbody = document.querySelector('#test-table tbody');
  const retryButton = document.getElementById('test-retry-button');
  const continueButton = document.getElementById('test-continue-button');
  const statusEl = document.getElementById('test-status');

  function update(i, value) {
    state.checklist[i] = checkRow(state.checklist[i], value);
    renderChecklist(tbody, state.checklist, update);
  }

  document.getElementById('step-test').addEventListener('wizard:enter', () => {
    state.checklist = buildTestChecklist(state.movedEntries);
    renderChecklist(tbody, state.checklist, update);
  });

  retryButton.addEventListener('click', () => showStep('sort'));

  continueButton.addEventListener('click', () => {
    const allPass = state.checklist.every((row) => row.status === 'pass');
    if (!allPass) {
      statusEl.textContent = 'Not all entries pass yet.';
      return;
    }
    showStep('commit');
  });
}
```

- [ ] **Step 6: Wire it into the app entry point**

```js
// public/app.js
import { showStep } from './js/state.js';
import { initStep1 } from './js/steps/step1-connect.js';
import { initStep2 } from './js/steps/step2-diff.js';
import { initStep3 } from './js/steps/step3-sort.js';
import { initStep4 } from './js/steps/step4-empty.js';
import { initStep5 } from './js/steps/step5-flash.js';
import { initStep6 } from './js/steps/step6-test.js';

initStep1();
initStep2();
initStep3();
initStep4();
initStep5();
initStep6();
showStep('connect');
```

- [ ] **Step 7: Manual verification**

1. Run `npm start`, walk through Steps 1-5 with real hardware and a freshly flashed firmware.
2. On Step 6, confirm one row per entry moved in Step 3, each showing its stroke and expected translation.
3. For each row, steno the stroke on the keyboard and type/paste the actual output into the row's input; confirm the status column flips to "pass" (green) or "fail" (red/crimson) correctly.
4. If any row fails, click "Go back to Sort", fix or drop that entry, re-save, and redo Steps 4-6 (per the spec's test/fix loop) — confirm `state.movedEntries` and the checklist regenerate correctly for the corrected set.
5. Once all rows pass, click "All entries pass, continue"; confirm it advances to Step 7. Clicking it before all rows pass should show "Not all entries pass yet." instead of advancing.

- [ ] **Step 8: Commit**

```bash
git add public/js/testChecklist.js public/js/steps/step6-test.js public/app.js test/testChecklist.test.js
git commit -m "feat: add test checklist UI with pass/fail tracking and fix loop"
```

---

### Task 15: Step 7 (Commit & Push) UI and README

**Files:**
- Create: `public/js/steps/step7-commit.js`
- Modify: `public/app.js` (add the new step import/init)
- Create: `README.md`

**Interfaces:**
- Consumes: `showStep` from Task 11; `POST /api/commit` from Task 7.
- Produces: `initStep7(): void`.

- [ ] **Step 1: Create Step 7's wiring**

```js
// public/js/steps/step7-commit.js
import { state } from '../state.js';

export function initStep7() {
  const commitButton = document.getElementById('commit-button');
  const statusEl = document.getElementById('commit-status');

  commitButton.addEventListener('click', async () => {
    statusEl.textContent = 'Committing...';
    const strokes = state.movedEntries.map((e) => e.stroke).join(', ');
    const message = `Add ${state.movedEntries.length} entries from Starboard: ${strokes}`;
    const response = await fetch('/api/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const result = await response.json();
    if (!result.committed) {
      statusEl.textContent = result.message || 'Nothing to commit.';
      return;
    }
    statusEl.textContent = result.pushed ? 'Committed and pushed.' : 'Committed locally. Push it yourself when ready.';
  });
}
```

- [ ] **Step 2: Wire it into the app entry point**

```js
// public/app.js
import { showStep } from './js/state.js';
import { initStep1 } from './js/steps/step1-connect.js';
import { initStep2 } from './js/steps/step2-diff.js';
import { initStep3 } from './js/steps/step3-sort.js';
import { initStep4 } from './js/steps/step4-empty.js';
import { initStep5 } from './js/steps/step5-flash.js';
import { initStep6 } from './js/steps/step6-test.js';
import { initStep7 } from './js/steps/step7-commit.js';

initStep1();
initStep2();
initStep3();
initStep4();
initStep5();
initStep6();
initStep7();
showStep('connect');
```

- [ ] **Step 3: Write the README**

```markdown
# Custom Dictionary Splitter

Local wizard for moving new steno entries from a Starboard keyboard
(Javelin firmware) into the `steno-dictionaries` git repo.

## Setup

1. `cp config.example.json config.json` and edit `dictionariesPath` to
   point at your `steno-dictionaries` checkout. Set `git.autoPush` to
   `true` if you want Step 7 to push automatically after committing —
   it defaults to `false` (commit only).
2. `npm start` (requires Node 20+; no other dependencies).
3. Open `http://localhost:4173` in Chrome or Edge (Web Serial API is
   required; Firefox and Safari are not supported).

## Workflow

1. **Connect & Download** — plug in the Starboard, click "Connect
   keyboard", pick its serial port from the browser prompt. Downloads
   the on-device user dictionary.
2. **Diff** — compares the downloaded dictionary against every `*.json`
   file in `dictionariesPath`.
3. **Sort** — review new entries and conflicts, pick a destination file
   for each, edit translations if needed, "Commit to disk" writes them
   (re-sorted by canonical steno key order) into the repo's working
   tree. Nothing is git-committed yet.
4. **Empty on-device dictionary** — manual step via lim.au's dictionary
   management tool (linked in-app).
5. **Flash new firmware** — manual step via lim.au's firmware builder
   (linked in-app). The keyboard disconnects to enter flashing mode —
   expected, harmless, since the dictionary was already downloaded in
   step 1.
6. **Test** — steno each moved entry on the keyboard and confirm it
   still produces the expected translation. Failures send you back to
   Sort to fix or drop the entry, then redo steps 4-6.
7. **Commit & push** — once all entries pass, creates a local git
   commit in `steno-dictionaries` (and pushes it too, if `git.autoPush`
   is `true` in `config.json`).

## Development

`node --test` runs the full test suite (pure logic and API routes;
Web Serial code requires real hardware and is verified manually).
```

- [ ] **Step 4: Manual verification**

1. Complete a full run of the wizard end-to-end with real hardware, from Step 1 through Step 7.
2. On Step 7, click "Commit & push"; with `git.autoPush: false` in `config.json`, confirm the status reads "Committed locally. Push it yourself when ready." and `git log` in `steno-dictionaries` shows the new commit with the auto-generated message listing the moved strokes.
3. Set `git.autoPush: true` in `config.json`, restart the server, repeat with a new batch of entries; confirm the status reads "Committed and pushed." and the commit is visible on the `origin` remote.
4. Run `node --test` one final time to confirm the full suite still passes after all UI wiring changes.

- [ ] **Step 5: Commit**

```bash
git add public/js/steps/step7-commit.js public/app.js README.md
git commit -m "feat: add commit/push UI and project README"
```
