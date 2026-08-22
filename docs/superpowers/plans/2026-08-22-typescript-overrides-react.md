# TypeScript, Dictionary Overrides, and React UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the app to TypeScript with an onion-architecture backend, teach it that overriding a stock dictionary is a first-class operation, and replace the Step 3 sort screen with a dark-mode React UI grouped by word.

**Architecture:** Backend becomes four layers with dependencies pointing inward (domain → application → infrastructure → presentation). Domain holds priority-aware indexing, four-case classification, word grouping, and the four conflict resolutions as strategies behind one interface. Frontend becomes React 19 + Vite, replacing the hand-rolled DOM code.

**Tech Stack:** Node 22.22 (native TypeScript type-stripping, no build step for backend), TypeScript 7, React 19, Vite, `node --test` for backend, Vitest + Testing Library for components.

**Spec:** `docs/superpowers/specs/2026-08-22-react-ui-word-grouping-design.md`

## Global Constraints

- **Node 22.22 runs `.ts` natively.** Backend needs NO transpile step. `node --test 'test/**/*.test.ts'` works directly. Type-checking is a separate `tsc --noEmit`.
- **Native type-stripping limits:** no `enum`, no `namespace`, no parameter properties (`constructor(private x)`). Use `import type { … }` for type-only imports. Relative imports MUST carry the `.ts` extension.
- **Priority = filename order**, ascending. `1-bible.json` outranks `6-main.json`. Lower sort position wins. Device order is used ONLY to warn about mismatch.
- **Protected files** default to `["6-main.json", "7-commands.json"]`. Never written to, never a destination, never preset.
- **Firmware lookup is first-match-wins** (`dictionary_list.cc:42-60`).
- **Dependencies point inward only.** `src/domain/` imports nothing from `application`/`infrastructure`/`routes` and never touches `node:fs`.
- **Existing 37 tests must stay green** through the migration phase. That is the gate on every Phase 1 task.
- **Commit after every task.** Conventional-commit prefixes (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`).

## File Structure

**Backend (new):**
```
src/domain/types.ts            entities: Stroke, Word, FileName, DictionaryEntry
src/domain/priority.ts         filename-order priority + comparisons
src/domain/strokeIndex.ts      priority-aware stroke index (winner + shadowed)
src/domain/wordIndex.ts        word -> { chords, files }
src/domain/classification.ts   four-case classifier
src/domain/resolutions.ts      4 conflict resolutions behind one interface
src/domain/grouping.ts         WordGroup display model
src/application/ports.ts       DictionaryRepository, GitService, ConfigProvider
src/application/loadDictionaries.ts
src/application/saveDecisions.ts
src/application/moveWord.ts
src/application/commitAndPush.ts
src/infrastructure/fsDictionaryRepository.ts
src/infrastructure/gitAdapter.ts
src/infrastructure/configProvider.ts
routes/api.ts                  thin HTTP handlers
server.ts
```

**Frontend (new):**
```
ui/main.tsx                    entry
ui/App.tsx                     step shell
ui/theme.css                   dark/light tokens
ui/state/WizardContext.tsx     replaces public/js/state.js
ui/serial/serial.ts            replaces public/js/serial.js
ui/serial/serialProtocol.ts    replaces public/js/serial-protocol.js
ui/steps/Step1Connect.tsx … Step7Commit.tsx
ui/steps/sort/SortTable.tsx    the grouped table
ui/steps/sort/WordGroupRow.tsx
ui/steps/sort/ChordRow.tsx
ui/steps/sort/ConflictResolver.tsx
```

**Deleted at the end of Phase 3:** `public/app.js`, `public/style.css`, `public/index.html`, `public/js/**`.

---

## PHASE 1 — TypeScript + onion migration

Mechanical. No behavior changes. The 37 existing tests gate every task.

### Task 1: TypeScript toolchain

**Files:**
- Create: `tsconfig.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm test` runs backend tests; `npm run typecheck` runs `tsc --noEmit`.

- [ ] **Step 1: Install dev dependencies**

```bash
npm install --save-dev typescript@7 @types/node
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "nodenext",
    "lib": ["ES2023", "DOM"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "routes/**/*.ts", "test/**/*.ts", "server.ts"]
}
```

`erasableSyntaxOnly` makes tsc reject syntax Node's stripper cannot handle — it catches enums and parameter properties at type-check time instead of at runtime.

- [ ] **Step 3: Update `package.json` scripts**

```json
"scripts": {
  "start": "node server.js",
  "test": "node --test",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 4: Verify nothing broke**

Run: `npm test`
Expected: 37 pass, 0 fail.

Run: `npm run typecheck`
Expected: exits 0 (nothing to check yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore: add TypeScript toolchain"
```

---

### Task 2: Domain types and priority

**Files:**
- Create: `src/domain/types.ts`, `src/domain/priority.ts`
- Test: `test/priority.test.ts`

**Interfaces:**
- Produces:
  - `type Stroke = string`, `type Word = string`, `type FileName = string`
  - `interface DictionaryEntry { stroke: Stroke; word: Word; file: FileName }`
  - `interface PriorityOrder { files: FileName[]; rankOf(file: FileName): number; outranks(a: FileName, b: FileName): boolean }`
  - `function priorityFromFilenames(files: FileName[]): PriorityOrder`
  - `function deviceOrderMismatch(expected: FileName[], device: FileName[]): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priorityFromFilenames, deviceOrderMismatch } from '../src/domain/priority.ts';

test('priority follows ascending filename order, first wins', () => {
  const p = priorityFromFilenames(['6-main.json', '1-bible.json', '2-phil-mro.json']);
  assert.deepEqual(p.files, ['1-bible.json', '2-phil-mro.json', '6-main.json']);
  assert.equal(p.rankOf('1-bible.json'), 0);
  assert.equal(p.outranks('1-bible.json', '6-main.json'), true);
  assert.equal(p.outranks('6-main.json', '1-bible.json'), false);
});

test('a file absent from the order never outranks a known file', () => {
  const p = priorityFromFilenames(['1-bible.json']);
  assert.equal(p.rankOf('nope.json'), Number.MAX_SAFE_INTEGER);
  assert.equal(p.outranks('nope.json', '1-bible.json'), false);
});

test('device order mismatch is detected, ignoring files the disk does not have', () => {
  assert.equal(deviceOrderMismatch(['1-a.json', '2-b.json'], ['1-a.json', '2-b.json']), false);
  assert.equal(deviceOrderMismatch(['1-a.json', '2-b.json'], ['2-b.json', '1-a.json']), true);
  // device lists non-file dictionaries too; they are ignored
  assert.equal(deviceOrderMismatch(['1-a.json'], ['user_dictionary', '1-a.json']), false);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/priority.test.ts`
Expected: FAIL — cannot find module `priority.ts`.

- [ ] **Step 3: Implement**

`src/domain/types.ts`:
```ts
export type Stroke = string;
export type Word = string;
export type FileName = string;

export interface DictionaryEntry {
  stroke: Stroke;
  word: Word;
  file: FileName;
}
```

`src/domain/priority.ts`:
```ts
import type { FileName } from './types.ts';

export interface PriorityOrder {
  files: FileName[];
  rankOf(file: FileName): number;
  outranks(a: FileName, b: FileName): boolean;
}

export function priorityFromFilenames(files: FileName[]): PriorityOrder {
  const ordered = [...files].sort((a, b) => a.localeCompare(b, 'en'));
  const ranks = new Map<FileName, number>(ordered.map((f, i) => [f, i]));
  const rankOf = (file: FileName): number =>
    ranks.get(file) ?? Number.MAX_SAFE_INTEGER;
  return {
    files: ordered,
    rankOf,
    outranks: (a, b) => rankOf(a) < rankOf(b),
  };
}

// The device lists dictionaries the filesystem does not have (user_dictionary,
// jeff-numbers). Only the files present on disk are comparable.
export function deviceOrderMismatch(expected: FileName[], device: FileName[]): boolean {
  const known = new Set(expected);
  const filtered = device.filter((d) => known.has(d));
  return filtered.length === expected.length &&
    filtered.some((f, i) => f !== expected[i]);
}
```

- [ ] **Step 4: Verify green**

Run: `node --test test/priority.test.ts` → PASS (3 tests)
Run: `npm run typecheck` → exits 0

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/priority.ts test/priority.test.ts
git commit -m "feat: add filename-order priority to the domain layer"
```

---

### Task 3: Port config to infrastructure, add protectedFiles

**Files:**
- Create: `src/infrastructure/configProvider.ts`
- Delete: `lib/config.js`
- Modify: `test/config.test.js` → `test/config.test.ts`, `config.example.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface AppConfig { dictionariesPath: string; protectedFiles: FileName[] }`, `function loadConfig(path?: string): AppConfig`

- [ ] **Step 1: Read the existing implementation and tests**

Read `lib/config.js` and `test/config.test.js` in full before changing anything. Preserve every existing behavior — the migration must not change what the loader accepts or rejects.

- [ ] **Step 2: Add the failing test for the new field**

Append to the migrated `test/config.test.ts`:

```ts
test('protectedFiles defaults to the stock dictionaries when absent', () => {
  const cfg = loadConfigFrom({ dictionariesPath: '/tmp/d' });
  assert.deepEqual(cfg.protectedFiles, ['6-main.json', '7-commands.json']);
});

test('protectedFiles is taken verbatim when present, including empty', () => {
  assert.deepEqual(loadConfigFrom({ dictionariesPath: '/tmp/d', protectedFiles: [] }).protectedFiles, []);
  assert.deepEqual(
    loadConfigFrom({ dictionariesPath: '/tmp/d', protectedFiles: ['x.json'] }).protectedFiles,
    ['x.json'],
  );
});

test('protectedFiles must be an array of strings', () => {
  assert.throws(() => loadConfigFrom({ dictionariesPath: '/tmp/d', protectedFiles: 'main.json' }));
});
```

Export a `loadConfigFrom(raw: unknown): AppConfig` alongside `loadConfig` so the parsing is testable without touching disk.

- [ ] **Step 3: Run it and watch it fail**

Run: `node --test test/config.test.ts`
Expected: FAIL on the protectedFiles tests.

- [ ] **Step 4: Implement, preserving existing validation**

Port the existing logic verbatim, then add:

```ts
const DEFAULT_PROTECTED: FileName[] = ['6-main.json', '7-commands.json'];

// An explicit empty array is meaningful ("protect nothing"), so only a missing
// key falls back to the defaults.
const protectedFiles = raw.protectedFiles === undefined
  ? DEFAULT_PROTECTED
  : raw.protectedFiles;

if (!Array.isArray(protectedFiles) || protectedFiles.some((f) => typeof f !== 'string')) {
  throw new Error('config: protectedFiles must be an array of strings');
}
```

- [ ] **Step 5: Update `config.example.json`**

```json
{
  "dictionariesPath": "/Users/you/dev/steno-dictionaries",
  "protectedFiles": ["6-main.json", "7-commands.json"]
}
```

- [ ] **Step 6: Verify green**

Run: `npm test` → all previously passing config tests still pass, plus 3 new.
Run: `npm run typecheck` → exits 0

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/configProvider.ts test/config.test.ts config.example.json
git rm lib/config.js test/config.test.js
git commit -m "refactor: move config to infrastructure, add protectedFiles"
```

---

### Task 4: Port stenoOrder to domain

**Files:**
- Create: `src/domain/stenoOrder.ts`
- Delete: `lib/stenoOrder.js`
- Modify: `test/stenoOrder.test.js` → `test/stenoOrder.test.ts`

**Interfaces:**
- Produces: same exported function names as `lib/stenoOrder.js` — read the file and preserve them exactly.

- [ ] **Step 1: Read `lib/stenoOrder.js` and `test/stenoOrder.test.js` in full.**

- [ ] **Step 2: Move the file, adding type annotations only.**

No logic changes. Add parameter and return types. Rename imports in the test to `../src/domain/stenoOrder.ts`.

- [ ] **Step 3: Verify green**

Run: `npm test` → the stenoOrder tests pass unchanged in count.
Run: `npm run typecheck` → exits 0

- [ ] **Step 4: Commit**

```bash
git add src/domain/stenoOrder.ts test/stenoOrder.test.ts
git rm lib/stenoOrder.js test/stenoOrder.test.js
git commit -m "refactor: move stenoOrder to the domain layer"
```

---

### Task 5: Port git to infrastructure behind a port

**Files:**
- Create: `src/application/ports.ts`, `src/infrastructure/gitAdapter.ts`
- Delete: `lib/git.js`
- Modify: `test/git.test.js` → `test/git.test.ts`

**Interfaces:**
- Produces: `interface GitService` in `ports.ts` with the same method names `lib/git.js` exports; `createGitAdapter(cwd: string): GitService`.

- [ ] **Step 1: Read `lib/git.js` and `test/git.test.js` in full.**

Note exactly which functions exist and what they return — the port interface must match, and the existing tests must keep passing against the adapter.

- [ ] **Step 2: Define the port**

`src/application/ports.ts` — declare `GitService` with one method per exported function from `lib/git.js`, typed.

- [ ] **Step 3: Move the implementation into `createGitAdapter`.**

Logic unchanged; it becomes a factory returning an object implementing `GitService`.

- [ ] **Step 4: Verify green**

Run: `npm test` → git tests pass, same count.
Run: `npm run typecheck` → exits 0

- [ ] **Step 5: Commit**

```bash
git add src/application/ports.ts src/infrastructure/gitAdapter.ts test/git.test.ts
git rm lib/git.js test/git.test.js
git commit -m "refactor: move git behind an application port"
```

---

### Task 6: Port dictionaries and writeEntries

**Files:**
- Create: `src/infrastructure/fsDictionaryRepository.ts`, `src/domain/strokeIndex.ts` (stub — real logic in Task 8)
- Delete: `lib/dictionaries.js`, `lib/writeEntries.js`
- Modify: `test/dictionaries.test.js` → `.ts`, `test/writeEntries.test.js` → `.ts`; add `DictionaryRepository` to `ports.ts`

**Interfaces:**
- Produces:
  - `interface DictionaryFile { path: string; entries: Record<Stroke, Word>; hash: string; mtimeMs: number }`
  - `interface DictionaryRepository { load(): Record<FileName, DictionaryFile>; write(file: FileName, entries: Record<Stroke, Word>): void }`
  - `buildStrokeIndex` moves to `src/domain/strokeIndex.ts` with its CURRENT behavior preserved for now.

- [ ] **Step 1: Read `lib/dictionaries.js`, `lib/writeEntries.js`, and both test files in full.**

- [ ] **Step 2: Split by layer.** `loadDictionaryFiles` and the write path are I/O — they go to `fsDictionaryRepository.ts`. `buildStrokeIndex` is pure — it goes to `src/domain/strokeIndex.ts`, behavior UNCHANGED in this task.

- [ ] **Step 3: Verify green**

Run: `npm test` → all dictionaries and writeEntries tests pass, same count.
Run: `npm run typecheck` → exits 0

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/fsDictionaryRepository.ts src/domain/strokeIndex.ts test/dictionaries.test.ts test/writeEntries.test.ts src/application/ports.ts
git rm lib/dictionaries.js lib/writeEntries.js test/dictionaries.test.js test/writeEntries.test.js
git commit -m "refactor: split dictionary I/O and indexing across layers"
```

---

### Task 7: Port routes and server, wire use cases

**Files:**
- Create: `src/application/loadDictionaries.ts`, `src/application/saveDecisions.ts`, `src/application/commitAndPush.ts`, `routes/api.ts`, `server.ts`
- Delete: `routes/api.js`, `server.js`
- Modify: `test/api.test.js` → `.ts`, `test/server.test.js` → `.ts`; `package.json` start script

**Interfaces:**
- Produces: use case factories taking ports and returning `{ execute(input): output }`. Routes call use cases only — no `node:fs` in `routes/`.

- [ ] **Step 1: Read `routes/api.js`, `server.js`, `test/api.test.js`, `test/server.test.js` in full.**

- [ ] **Step 2: Extract each endpoint's logic into a use case** that takes its dependencies as constructor arguments (ports), leaving routes as request-parse → use-case-call → `sendJson`.

- [ ] **Step 3: Update the start script**

```json
"start": "node server.ts"
```

- [ ] **Step 4: Verify green**

Run: `npm test` → all 37 original tests pass.
Run: `npm run typecheck` → exits 0
Run: `npm start` then `curl -s http://127.0.0.1:4173/api/health` → `{"status":"ok"}`. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/application routes/api.ts server.ts test/api.test.ts test/server.test.ts package.json
git rm routes/api.js server.js test/api.test.js test/server.test.js
git commit -m "refactor: wire routes through application use cases"
```

- [ ] **Step 6: Confirm `lib/` is empty and remove it**

```bash
rmdir lib && git commit -am "chore: remove empty lib directory"
```

**PHASE 1 GATE:** `npm test` shows 37+ passing, `npm run typecheck` clean, `npm start` serves the app, and the wizard still loads in a browser.

---

## PHASE 2 — Domain model for overrides

### Task 8: Priority-aware stroke index

**Files:**
- Modify: `src/domain/strokeIndex.ts`
- Test: `test/strokeIndex.test.ts`

**Interfaces:**
- Consumes: `PriorityOrder` from Task 2, `DictionaryFile` from Task 6.
- Produces:
  - `interface StrokeIndexEntry { winner: DictionaryEntry; shadowed: DictionaryEntry[] }`
  - `function buildStrokeIndex(files: Record<FileName, DictionaryFile>, priority: PriorityOrder): Map<Stroke, StrokeIndexEntry>`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStrokeIndex } from '../src/domain/strokeIndex.ts';
import { priorityFromFilenames } from '../src/domain/priority.ts';

const files = {
  '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'kata' } },
  '2-phil-mro.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat', TKOG: 'dog' } },
};

test('the highest-priority file wins, and lower ones are recorded as shadowed', () => {
  const priority = priorityFromFilenames(Object.keys(files));
  const index = buildStrokeIndex(files, priority);

  const kat = index.get('KAT');
  assert.equal(kat.winner.word, 'cat');
  assert.equal(kat.winner.file, '2-phil-mro.json');
  assert.deepEqual(kat.shadowed, [{ stroke: 'KAT', word: 'kata', file: '6-main.json' }]);
});

test('shadowed entries are ordered by descending priority', () => {
  const three = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'c' } },
    '1-bible.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'a' } },
    '4-phil-nav.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'b' } },
  };
  const index = buildStrokeIndex(three, priorityFromFilenames(Object.keys(three)));
  assert.equal(index.get('KAT').winner.word, 'a');
  assert.deepEqual(index.get('KAT').shadowed.map((e) => e.word), ['b', 'c']);
});

test('an unshadowed stroke has an empty shadowed list', () => {
  const index = buildStrokeIndex(files, priorityFromFilenames(Object.keys(files)));
  assert.deepEqual(index.get('TKOG').shadowed, []);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/strokeIndex.test.ts`
Expected: FAIL — current implementation returns a plain object with last-writer-wins, so `.get` is not a function.

- [ ] **Step 3: Implement**

```ts
export function buildStrokeIndex(
  files: Record<FileName, DictionaryFile>,
  priority: PriorityOrder,
): Map<Stroke, StrokeIndexEntry> {
  const collected = new Map<Stroke, DictionaryEntry[]>();

  for (const [file, { entries }] of Object.entries(files)) {
    for (const [stroke, word] of Object.entries(entries)) {
      const list = collected.get(stroke) ?? [];
      list.push({ stroke, word, file });
      collected.set(stroke, list);
    }
  }

  const index = new Map<Stroke, StrokeIndexEntry>();
  for (const [stroke, candidates] of collected) {
    // The firmware returns the first match walking the list in order, so the
    // highest-priority file wins and everything below it is shadowed.
    const ordered = candidates.sort(
      (a, b) => priority.rankOf(a.file) - priority.rankOf(b.file),
    );
    index.set(stroke, { winner: ordered[0], shadowed: ordered.slice(1) });
  }
  return index;
}
```

- [ ] **Step 4: Update every call site**

Search for `buildStrokeIndex` across `src/` and `routes/` and update each to pass a `PriorityOrder` and to read `.winner`. Run `npm run typecheck` to find them all — the return type change makes every stale call site a type error.

- [ ] **Step 5: Verify green**

Run: `npm test` → new tests pass, existing tests still pass.
Run: `npm run typecheck` → exits 0

- [ ] **Step 6: Commit**

```bash
git add src/domain/strokeIndex.ts test/strokeIndex.test.ts
git commit -m "fix: make the stroke index priority-aware instead of last-writer-wins"
```

---

### Task 9: Word index

**Files:**
- Create: `src/domain/wordIndex.ts`
- Test: `test/wordIndex.test.ts`

**Interfaces:**
- Produces:
  - `interface WordIndexEntry { word: Word; chords: DictionaryEntry[]; files: FileName[] }`
  - `function buildWordIndex(files: Record<FileName, DictionaryFile>, priority: PriorityOrder): Map<Word, WordIndexEntry>`

- [ ] **Step 1: Write the failing test**

```ts
const files = {
  '4-phil-nav.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat', 'K-T': 'cat' } },
  '2-phil-mro.json': { path: '', hash: '', mtimeMs: 0, entries: { TKOG: 'dog' } },
};

test('a word collects every chord that produces it', () => {
  const index = buildWordIndex(files, priorityFromFilenames(Object.keys(files)));
  const cat = index.get('cat');
  assert.deepEqual(cat.chords.map((c) => c.stroke).sort(), ['K-T', 'KAT']);
  assert.deepEqual(cat.files, ['4-phil-nav.json']);
});

test('a word spanning files records each file in priority order', () => {
  const split = {
    '6-main.json': { path: '', hash: '', mtimeMs: 0, entries: { KAT: 'cat' } },
    '2-phil-mro.json': { path: '', hash: '', mtimeMs: 0, entries: { 'K-T': 'cat' } },
  };
  const index = buildWordIndex(split, priorityFromFilenames(Object.keys(split)));
  assert.deepEqual(index.get('cat').files, ['2-phil-mro.json', '6-main.json']);
});

test('an unknown word is absent', () => {
  const index = buildWordIndex(files, priorityFromFilenames(Object.keys(files)));
  assert.equal(index.get('zebra'), undefined);
});
```

- [ ] **Step 2: Run it, watch it fail.** `node --test test/wordIndex.test.ts` → module not found.

- [ ] **Step 3: Implement.** Same shape as `buildStrokeIndex`, keyed by word; `files` is the de-duplicated list of files sorted by `priority.rankOf`.

- [ ] **Step 4: Verify green.** `node --test test/wordIndex.test.ts` → PASS; `npm run typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/domain/wordIndex.ts test/wordIndex.test.ts
git commit -m "feat: add a word index for word-level conflict detection"
```

---

### Task 10: Four-case classification

**Files:**
- Create: `src/domain/classification.ts`
- Test: `test/classification.test.ts`

**Interfaces:**
- Produces:
  - `type CaseKind = 'new' | 'chord-taken' | 'word-exists' | 'both' | 'unchanged'`
  - `interface Classified { stroke: Stroke; word: Word; kind: CaseKind; diskWord?: Word; diskFile?: FileName; wordFiles: FileName[] }`
  - `function classify(downloaded: Record<Stroke, Word>, strokeIndex, wordIndex, protectedFiles: FileName[]): Classified[]`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run it, watch it fail.**

- [ ] **Step 3: Implement.** `unchanged` when the winning stroke entry already maps to the same word. `chord-taken` when the stroke's winner has a different word. `word-exists` when the word appears in a non-protected file. `both` when both hold. `wordFiles` is the word's files with protected ones filtered out.

- [ ] **Step 4: Verify green.** `npm test`; `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/classification.ts test/classification.test.ts
git commit -m "feat: classify downloaded entries into the four on-disk cases"
```

---

### Task 11: Conflict resolutions as strategies

**Files:**
- Create: `src/domain/resolutions.ts`
- Test: `test/resolutions.test.ts`

**Interfaces:**
- Produces:
  - `type ResolutionKind = 'keep-keyboard' | 'keep-disk' | 're-chord' | 'override'`
  - `interface ResolutionContext { entry: Classified; priority: PriorityOrder; protectedFiles: FileName[] }`
  - `interface WriteOp { file: FileName; stroke: Stroke; word?: Word; remove?: boolean }`
  - `interface Resolution { kind: ResolutionKind; isAvailable(ctx): boolean; validate(ctx, choice): string | null; toWriteOps(ctx, choice): WriteOp[] }`
  - `interface ResolutionChoice { kind: ResolutionKind; targetFile?: FileName; newStroke?: Stroke }`
  - `const RESOLUTIONS: Resolution[]`
  - `function defaultResolution(ctx): ResolutionKind | null`

- [ ] **Step 1: Write the failing test**

```ts
test('keep-keyboard is unavailable when the disk entry is protected', () => {
  const ctx = ctxFor({ kind: 'chord-taken', diskFile: '6-main.json' }, ['6-main.json']);
  assert.equal(resolutionByKind('keep-keyboard').isAvailable(ctx), false);
  assert.equal(resolutionByKind('override').isAvailable(ctx), true);
});

test('override defaults when the shadowed entry is protected', () => {
  const ctx = ctxFor({ kind: 'chord-taken', diskFile: '6-main.json' }, ['6-main.json']);
  assert.equal(defaultResolution(ctx), 'override');
});

test('nothing is preselected when the disk entry is one of your own files', () => {
  const ctx = ctxFor({ kind: 'chord-taken', diskFile: '4-phil-nav.json' }, ['6-main.json']);
  assert.equal(defaultResolution(ctx), null);
});

test('an override target that cannot outrank the shadowed file is rejected', () => {
  const ctx = ctxFor({ kind: 'chord-taken', diskFile: '2-phil-mro.json' }, []);
  const override = resolutionByKind('override');
  assert.match(
    override.validate(ctx, { kind: 'override', targetFile: '7-commands.json' }),
    /outrank/i,
  );
  assert.equal(override.validate(ctx, { kind: 'override', targetFile: '1-bible.json' }), null);
});

test('an override never writes to the shadowed file', () => {
  const ctx = ctxFor({ stroke: 'KAT', word: 'cat', kind: 'chord-taken', diskFile: '6-main.json' }, ['6-main.json']);
  const ops = resolutionByKind('override').toWriteOps(ctx, { kind: 'override', targetFile: '2-phil-mro.json' });
  assert.deepEqual(ops, [{ file: '2-phil-mro.json', stroke: 'KAT', word: 'cat' }]);
});

test('re-chord removes nothing from disk and writes the new stroke only', () => {
  const ctx = ctxFor({ stroke: 'KAT', word: 'cat', kind: 'chord-taken', diskFile: '6-main.json' }, []);
  const ops = resolutionByKind('re-chord').toWriteOps(ctx, { kind: 're-chord', newStroke: 'K-AT', targetFile: '2-phil-mro.json' });
  assert.deepEqual(ops, [{ file: '2-phil-mro.json', stroke: 'K-AT', word: 'cat' }]);
});

test('keep-disk writes nothing at all', () => {
  const ctx = ctxFor({ kind: 'chord-taken', diskFile: '6-main.json' }, []);
  assert.deepEqual(resolutionByKind('keep-disk').toWriteOps(ctx, { kind: 'keep-disk' }), []);
});
```

Write a small `ctxFor(partial, protectedFiles)` helper at the top of the test building a `ResolutionContext` over the fixed priority list
`['1-bible.json','2-phil-mro.json','4-phil-nav.json','6-main.json','7-commands.json']`.

- [ ] **Step 2: Run it, watch it fail.**

- [ ] **Step 3: Implement each resolution as its own object** implementing `Resolution`, collected in `RESOLUTIONS`. `defaultResolution` returns `'override'` when `ctx.protectedFiles.includes(ctx.entry.diskFile)`, else `null`.

- [ ] **Step 4: Verify green.** `npm test`; `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/resolutions.ts test/resolutions.test.ts
git commit -m "feat: add the four conflict resolutions as strategies"
```

---

### Task 12: Word grouping display model

**Files:**
- Create: `src/domain/grouping.ts`
- Test: `test/grouping.test.ts`

**Interfaces:**
- Produces:
  - `interface ChordRow { stroke: Stroke; kind: CaseKind; diskWord?: Word; diskFile?: FileName; resolution: ResolutionChoice | null }`
  - `interface WordGroup { word: Word; existingChords: DictionaryEntry[]; newChords: ChordRow[]; destinationFile: FileName | null; invariantWarning: string | null; priorityWarning: string | null }`
  - `function buildWordGroups(classified: Classified[], wordIndex, priority, protectedFiles): WordGroup[]`
  - `function hasUnresolvedConflicts(groups: WordGroup[]): boolean`

- [ ] **Step 1: Write the failing test**

```ts
test('groups are sorted alphabetically by word', () => {
  const groups = buildWordGroups(classifiedFor({ TKOG: 'dog', KAT: 'cat', PWEUG: 'big' }), …);
  assert.deepEqual(groups.map((g) => g.word), ['big', 'cat', 'dog']);
});

test('every chord for a word shares one group', () => {
  const groups = buildWordGroups(classifiedFor({ KAT: 'cat', 'K-T': 'cat' }), …);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].newChords.map((c) => c.stroke).sort(), ['K-T', 'KAT']);
});

test('an existing word presets the destination and lists its on-disk chords', () => {
  // 'cat' already lives in 4-phil-nav.json under K-T
  const groups = buildWordGroups(…);
  assert.equal(groups[0].destinationFile, '4-phil-nav.json');
  assert.deepEqual(groups[0].existingChords.map((c) => c.stroke), ['K-T']);
});

test('a word living only in a protected file is a free choice, not a preset', () => {
  const groups = buildWordGroups(…, ['6-main.json']);
  assert.equal(groups[0].destinationFile, null);
});

test('unresolved conflicts are reported so Save can be blocked', () => {
  const groups = buildWordGroups(classifiedFor({ KAT: 'cat' }) /* chord-taken */, …);
  assert.equal(hasUnresolvedConflicts(groups), true);
  groups[0].newChords[0].resolution = { kind: 'keep-disk' };
  assert.equal(hasUnresolvedConflicts(groups), false);
});
```

Fill the `…` placeholders with the same fixture-building helpers used in Task 10's test — build real `strokeIndex`/`wordIndex` from a small `disk` object rather than hand-writing `Classified` values.

- [ ] **Step 2: Run it, watch it fail.**

- [ ] **Step 3: Implement.** Group by word, sort with `localeCompare`, preset `destinationFile` from `classified.wordFiles[0]` (already protected-filtered by Task 10), leave `null` when empty. `hasUnresolvedConflicts` returns true when any `newChords` entry whose `kind` is `chord-taken` or `both` has `resolution === null`.

- [ ] **Step 4: Verify green.** `npm test`; `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/grouping.ts test/grouping.test.ts
git commit -m "feat: build the word-grouped display model"
```

---

### Task 13: Write path with removal and two-file hash guards

**Files:**
- Modify: `src/infrastructure/fsDictionaryRepository.ts`, `src/application/saveDecisions.ts`
- Create: `src/application/moveWord.ts`
- Test: `test/moveWord.test.ts`, extend `test/writeEntries.test.ts`

**Interfaces:**
- Produces: `interface MoveWordInput { word: Word; fromFile: FileName; toFile: FileName; capturedHashes: Record<FileName, string> }`, `moveWord.execute(input): { status: 'ok' | 'stale' | 'error'; reason?: string }`

- [ ] **Step 1: Write the failing test**

```ts
test('moving a word removes every chord from the old file and writes them to the new one', () => {
  // fixture: 6-main has nothing; 4-phil-nav has KAT:cat, K-T:cat; move cat -> 2-phil-mro
  const result = moveWord.execute({
    word: 'cat', fromFile: '4-phil-nav.json', toFile: '2-phil-mro.json',
    capturedHashes: currentHashes(),
  });
  assert.equal(result.status, 'ok');
  assert.deepEqual(read('4-phil-nav.json'), {});
  assert.deepEqual(read('2-phil-mro.json'), { KAT: 'cat', 'K-T': 'cat' });
});

test('a stale hash on EITHER file aborts the move with nothing written', () => {
  const hashes = currentHashes();
  hashes['2-phil-mro.json'] = 'stale';
  const before = { from: read('4-phil-nav.json'), to: read('2-phil-mro.json') };
  const result = moveWord.execute({ word: 'cat', fromFile: '4-phil-nav.json', toFile: '2-phil-mro.json', capturedHashes: hashes });
  assert.equal(result.status, 'stale');
  assert.deepEqual(read('4-phil-nav.json'), before.from);
  assert.deepEqual(read('2-phil-mro.json'), before.to);
});

test('a protected file is rejected as a move destination', () => {
  const result = moveWord.execute({ word: 'cat', fromFile: '4-phil-nav.json', toFile: '6-main.json', capturedHashes: currentHashes() });
  assert.equal(result.status, 'error');
  assert.match(result.reason, /protected/i);
});
```

Use a temp directory fixture (`node:fs.mkdtempSync`) seeded with real JSON files, mirroring how `test/writeEntries.test.js` already does it — read that file first and follow its pattern.

- [ ] **Step 2: Run it, watch it fail.**

- [ ] **Step 3: Implement.** Verify BOTH files' hashes before writing EITHER. A half-landed move is worse than a failed one, so compute both new file contents in memory, then write. Reject protected destinations.

- [ ] **Step 4: Verify green.** `npm test`; `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/application/moveWord.ts src/infrastructure/fsDictionaryRepository.ts test/moveWord.test.ts
git commit -m "feat: support moving a word between dictionaries with two-file guards"
```

---

### Task 14: Expose the new model over the API

**Files:**
- Modify: `routes/api.ts`, `src/application/loadDictionaries.ts`
- Test: extend `test/api.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/dictionaries` → `{ files, priority: FileName[], protectedFiles: FileName[] }`
  - `POST /api/classify` `{ downloaded: Record<Stroke,Word>, deviceOrder?: FileName[] }` → `{ groups: WordGroup[], deviceOrderMismatch: boolean }`
  - `POST /api/move-word` → `moveWord` result

- [ ] **Step 1: Write the failing test** asserting each endpoint's shape, including that `/api/classify` returns groups sorted by word and reports `deviceOrderMismatch: true` for a scrambled device order.

- [ ] **Step 2: Run it, watch it fail.**

- [ ] **Step 3: Implement** as thin handlers calling use cases.

- [ ] **Step 4: Verify green.** `npm test`; `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add routes/api.ts src/application/loadDictionaries.ts test/api.test.ts
git commit -m "feat: expose classification and word-move over the API"
```

**PHASE 2 GATE:** `npm test` green, `npm run typecheck` clean, and `curl -X POST /api/classify` against the running server returns grouped output.

---

## PHASE 3 — React UI

### Task 15: Vite + React + Vitest scaffold with dark theme

**Files:**
- Create: `vite.config.ts`, `ui/main.tsx`, `ui/App.tsx`, `ui/theme.css`, `ui/index.html`, `vitest.config.ts`
- Modify: `package.json`, `tsconfig.json`

- [ ] **Step 1: Install**

```bash
npm install react react-dom
npm install --save-dev vite @vitejs/plugin-react vitest @testing-library/react @testing-library/jest-dom jsdom @types/react @types/react-dom
```

- [ ] **Step 2: `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'ui',
  build: { outDir: '../public/dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:4173' } },
});
```

- [ ] **Step 3: Scripts**

```json
"start": "node server.ts",
"dev": "vite",
"build": "vite build",
"test": "node --test && vitest run",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 4: `ui/theme.css`** — define the palette as custom properties on `:root` for light, then redefine ONLY the tokens under `@media (prefers-color-scheme: dark)`. Dark is the primary target. Use tokens for every color; never hard-code one in a component.

- [ ] **Step 5: Verify**

Run: `npm run build` → succeeds, writes `public/dist/`.
Run: `npm test` → 37+ backend tests pass, vitest runs with 0 tests and exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts vitest.config.ts ui tsconfig.json
git commit -m "chore: scaffold React, Vite, and Vitest with a dark theme"
```

---

### Task 16: Wizard state context and step shell

**Files:**
- Create: `ui/state/WizardContext.tsx`
- Test: `ui/state/WizardContext.test.tsx`

**Interfaces:**
- Produces: `WizardProvider`, `useWizard()` returning `{ state, setState, currentStep, goToStep }`. State fields mirror `public/js/state.js`: `port, downloadedDictionary, dictionaryIndex, fileHashes, diffResult, movedEntries, touchedFiles, checklist`, plus `groups` and `priority`.

- [ ] **Step 1: Write the failing component test** asserting `goToStep('sort')` updates `currentStep` and that state survives the transition.
- [ ] **Step 2: Run it, watch it fail.** `npx vitest run ui/state`
- [ ] **Step 3: Implement** with `useState` + context. No reducer — the state is flat.
- [ ] **Step 4: Verify green.**
- [ ] **Step 5: Commit** `git commit -m "feat: add wizard state context"`

---

### Task 17: Port the serial modules to TypeScript

**Files:**
- Create: `ui/serial/serial.ts`, `ui/serial/serialProtocol.ts`
- Test: `test/serialProtocol.test.ts` (stays under `node --test` — it is pure)
- Delete: `public/js/serial.js`, `public/js/serial-protocol.js`, `test/serial-protocol.test.js`

**CRITICAL:** `connectToKeyboard` MUST keep sending `start_javelin_console\n` after `port.open()` and MUST keep asserting DTR/RTS. Without it every command times out — this was a hardware-verified fix. Port it verbatim, only adding types.

- [ ] **Step 1: Move both files**, adding types. Keep the existing 6 protocol tests, migrated to `.ts`.
- [ ] **Step 2: Verify green.** `npm test` → the 6 protocol tests pass.
- [ ] **Step 3: Commit** `git commit -m "refactor: port serial modules to TypeScript"`

---

### Task 18: Port Steps 1, 2, 4, 5, 7

**Files:**
- Create: `ui/steps/Step1Connect.tsx`, `Step2Diff.tsx`, `Step4Empty.tsx`, `Step5Flash.tsx`, `Step7Commit.tsx`
- Test: `ui/steps/Step1Connect.test.tsx`, `ui/steps/Step7Commit.test.tsx`

Read each existing `public/js/steps/*.js` in full and preserve its behavior exactly, including the Step 1 port-close before the `lim.au` handoff (`step1-connect.js:19-25`).

- [ ] **Step 1: Write failing tests** for Step 1 (connect → classify → advance, with a mocked serial module) and Step 7 (commit → status).
- [ ] **Step 2: Run them, watch them fail.**
- [ ] **Step 3: Implement all five components.**
- [ ] **Step 4: Verify green.** `npx vitest run`
- [ ] **Step 5: Commit** `git commit -m "feat: port the simple wizard steps to React"`

---

### Task 19: Port Step 6 test checklist

**Files:**
- Create: `ui/steps/Step6Test.tsx`
- Test: `ui/steps/Step6Test.test.tsx`

Read `public/js/steps/step6-test.js` and `public/js/testChecklist.js` in full. Move the checklist logic to `src/domain/testChecklist.ts` (it is pure) and keep its existing tests under `node --test`.

- [ ] **Step 1: Write the failing component test** — a failing row routes back to Sort, all-pass advances to Commit.
- [ ] **Step 2: Run it, watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify green.**
- [ ] **Step 5: Commit** `git commit -m "feat: port the test checklist step to React"`

---

### Task 20: The grouped sort table

**Files:**
- Create: `ui/steps/sort/SortTable.tsx`, `WordGroupRow.tsx`, `ChordRow.tsx`
- Test: `ui/steps/sort/SortTable.test.tsx`

**Interfaces:**
- Consumes: `WordGroup[]` from `POST /api/classify`.

- [ ] **Step 1: Write the failing tests**

```tsx
test('renders one radio column per dictionary with rotated headers', () => { … });
test('protected dictionaries render as disabled columns', () => {
  render(<SortTable groups={groups} priority={priority} protectedFiles={['6-main.json']} />);
  expect(screen.getByRole('radio', { name: /6-main\.json/ })).toBeDisabled();
});
test('all chords for a word share one radio group and one delete button', () => { … });
test('existing on-disk chords render greyed inside the group', () => { … });
test('groups render in alphabetical order by word', () => { … });
```

- [ ] **Step 2: Run them, watch them fail.** `npx vitest run ui/steps/sort`

- [ ] **Step 3: Implement.** Rotate headers with `writing-mode: vertical-rl; transform: rotate(180deg)`. Radio inputs share `name={group.word}`. Wrap the table in an `overflow-x: auto` container.

- [ ] **Step 4: Verify green.**

- [ ] **Step 5: Commit** `git commit -m "feat: add the word-grouped sort table"`

---

### Task 21: Conflict resolution UI and Save blocking

**Files:**
- Create: `ui/steps/sort/ConflictResolver.tsx`
- Modify: `ui/steps/sort/SortTable.tsx`
- Test: `ui/steps/sort/ConflictResolver.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
test('offers all four resolutions, with keep-keyboard disabled against a protected file', () => { … });
test('override is preselected when the shadowed entry is protected', () => { … });
test('an override target that cannot outrank the shadowed file is rejected with a message', () => { … });
test('Save is disabled while any conflict is unresolved, and enabled once all are resolved', () => { … });
```

- [ ] **Step 2: Run them, watch them fail.**
- [ ] **Step 3: Implement**, calling the Task 11 domain functions — the component decides nothing about availability or validity on its own.
- [ ] **Step 4: Verify green.**
- [ ] **Step 5: Commit** `git commit -m "feat: resolve chord conflicts inline and block Save until clear"`

---

### Task 22: Warnings, chord editing, and inline delete confirmation

**Files:**
- Modify: `ui/steps/sort/WordGroupRow.tsx`, `ChordRow.tsx`, `SortTable.tsx`
- Test: extend `ui/steps/sort/SortTable.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
test('moving a group off its word file offers move-all or split-anyway', () => { … });
test('delete asks for confirmation inline and only removes on confirm', () => { … });
test('cancelling a delete leaves the group intact', () => { … });
test('editing a chord re-runs conflict detection', () => { … });
test('a device-order mismatch renders a warning banner', () => { … });
```

- [ ] **Step 2: Run them, watch them fail.**
- [ ] **Step 3: Implement.** Delete button swaps to `Confirm?` / `Cancel` on first click.
- [ ] **Step 4: Verify green.**
- [ ] **Step 5: Commit** `git commit -m "feat: add warnings, chord editing, and inline delete confirmation"`

---

### Task 23: Cut over and delete the old frontend

**Files:**
- Modify: `server.ts` (serve `public/dist`)
- Delete: `public/index.html`, `public/app.js`, `public/style.css`, `public/js/**`

- [ ] **Step 1: Point the static handler at `public/dist`.**
- [ ] **Step 2: Build and smoke-test.** `npm run build && npm start`, then load `http://127.0.0.1:4173` and confirm Step 1 renders.
- [ ] **Step 3: Delete the old frontend.**
- [ ] **Step 4: Verify green.** `npm test`; `npm run typecheck`; `npm run build`.
- [ ] **Step 5: Commit** `git commit -m "feat: cut over to the React frontend"`

---

## Acceptance criteria

- `npm test` — backend and component suites both green.
- `npm run typecheck` — clean.
- `npm run build` — succeeds.
- `npm start` serves the React app; the wizard renders and Step 3 shows grouped rows with rotated headers and disabled protected columns.
- **Cannot be verified without hardware:** Step 1's actual serial connection. Leave it untouched beyond the TypeScript port, and flag it for Phil to test.
