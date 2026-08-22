# React UI, Word Grouping, and Dictionary Overrides — Design

## Purpose

Two things changed after the original build shipped.

First, the sort screen (Step 3) is unusable at real volume. Each entry
needs two clicks in a dropdown, and there are hundreds of entries. It also
looks like unstyled default HTML.

Second, and more consequential: Phil is moving back toward a stock,
out-of-the-box `main` dictionary. Rather than editing `main.json`, he will
consistently **override** its chords by redefining them in higher-priority
files. The app currently has no concept of overriding, no concept of
dictionary priority, and a stroke index that actively reports the wrong
answer once the same stroke legitimately appears in two files.

This design covers the UI rework and the domain-model changes that
overriding requires, plus a migration to TypeScript with an onion
architecture on the backend.

## Non-goals

- Not changing the 7-step wizard flow, the serial protocol, or the
  Step 4/5 handoffs to `lim.au`.
- Not building a general dictionary editor. Editing existing on-disk
  entries is out of scope except where an override or a word-move
  requires it.
- Still local, single-user, not deployed.

## Background: how Javelin priority actually works

`StenoDictionaryList::Lookup` (`dictionary_list.cc:42-60`) iterates the
dictionary list in order and returns the **first** valid result. Earlier in
the list wins. Phil's numeric filename prefixes encode this intent:
`1-bible.json` outranks `6-main.json`.

Overriding a stock `main` entry therefore means writing the new mapping
into any file that sorts earlier than `main.json`, and leaving `main.json`
untouched.

### Priority is derived from filename order, not device order

The device reports its actual order via `list_dictionaries`. The app uses
**filename order** as authoritative instead, because the device order can be
wrong: firmware is sometimes built with dictionaries in the wrong order by
accident. Filename order expresses intent; device order reports reality.

Because the app already parses the device list in Step 1, it compares the
two and raises a warning when they disagree. This surfaces a mis-flashed
firmware explicitly, instead of leaving it to be discovered through
mysterious lookup behavior. The device order is used for **nothing else** —
every decision follows filename order.

## The four-case classification

For each downloaded entry (chord `S` → word `W`):

| Case | On-disk state | Meaning |
|------|---------------|---------|
| 1. Chord taken | `S` maps to a different word `W'` | needs a resolution (below) |
| 2. Word exists | `W` already on disk under other chords, in file `F` | adding a chord to an existing word |
| 3. Both | `S` taken by `W'`, and `W` already lives in `F` | both of the above |
| 4. Neither | brand new | free choice of destination |

Case 2 is a **constraint, not a conflict**. Phil's invariant is that a word
never spans dictionaries, so a new chord for an existing word belongs in
that word's file.

**Exception:** the preset applies only when the word's existing file is one
of Phil's own. If the word exists solely in a protected file, the row is a
free choice — a stock `main` entry must never pull new chords into
`main.json`.

## Chord conflict resolutions

A case-1 or case-3 conflict has four resolutions:

1. **Keep keyboard word** — `S` becomes `W`, overwriting the on-disk entry
   in its own file. Disallowed when that file is protected.
2. **Keep disk word** — discard the new entry; disk untouched.
3. **Re-chord** — leave the on-disk entry alone and assign a different chord
   to `W`. The replacement chord is re-checked for conflicts as it is typed.
4. **Override** — write `S → W` into a **higher-priority** file, leaving the
   original entry in place and shadowed.

Resolution 4 is the one that makes the stock-`main` workflow possible. It is
the preselected resolution when the shadowed entry lives in a protected
file; otherwise nothing is preselected.

Deleting the chord was considered as a fifth resolution and rejected as a
duplicate of "keep disk word" — the end state is identical.

**Override targeting is priority-checked.** The chosen destination must
outrank the file being shadowed. A lower-priority destination is blocked,
because such an override would silently no-op: the chord would still resolve
to the old word with no visible sign of failure.

**Unresolved conflicts block the Save button.** Today an unresolved conflict
silently defaults to the keyboard value and overwrites disk. That is how a
pre-existing entry gets lost by accident.

## Protected files

`config.json` gains an explicit list:

```json
{
  "dictionariesPath": "/Users/phil/dev/steno-dictionaries",
  "protectedFiles": ["6-main.json", "7-commands.json"]
}
```

Both are stock, out-of-the-box dictionaries sitting at their original
priorities. Protected files are read-only baselines. The app never writes to
them: they are excluded as destinations, excluded from case-2 presetting, and
"keep keyboard word" is disabled for conflicts against them. Nothing is
protected unless listed.

In the Step 3 radio grid, protected files render as disabled columns with
their headers marked, so it is visible at a glance that they are baselines
rather than destinations that happen to be unselected.

Note that `7-commands.json` sits at the **bottom** of the priority order, so
any file outranks it — an override against a commands entry can target
anywhere. It is also already shadowed by `6-main.json` wherever the two
define the same stroke, which is stock behavior and not something this app
changes.

## Priority-aware indexing

`buildStrokeIndex` (`lib/dictionaries.js:21-29`) currently assumes strokes
are unique across files, and resolves duplicates by last-writer-wins over
`readdirSync` order — which is alphabetical, and therefore returns the
**lowest**-priority entry. That is inverted from the firmware.

Overriding makes duplicate strokes the intended state, so this must change:

- The stroke index becomes priority-aware, returning the winning entry (the
  highest-priority file containing that stroke) **and** the list of shadowed
  entries beneath it.
- A new word index is added: `word → { chords: [{stroke, file}], files: [file] }`.
  Word-level conflicts are currently undetectable because no such index
  exists.

Every conflict verdict derives from these indexes, so this correction gates
everything else.

## Display model

A pure function builds the Step 3 view model from the diff and indexes:

```
WordGroup {
  word
  existingChords: [{stroke, file}]      // already on disk, shown greyed
  newChords:      [{stroke, conflict}]  // from the keyboard
  destinationFile                        // preset per case 2/3 rules
  invariantWarning                       // destination != word's existing file
  priorityWarning                        // override target cannot win
}
```

Groups are sorted alphabetically by word. This module is pure — grouping,
sorting, presetting, classification, and priority checks are all testable
without a DOM.

## Step 3 UI

Columns: chords, word (read-only), one radio column per dictionary file
with headers rotated 90° counter-clockwise (`writing-mode: vertical-rl`),
then warning indicator and delete.

- **Word level:** one radio row and one delete button per word, shared by
  every chord for that word. Deleting a word deletes all of its new chords.
- **Chord level:** each chord row has its own edit (re-chord) and delete
  controls, and displays its conflict state and resolution when conflicted.
- **Existing chords** already on disk appear greyed within the group, so it
  is visible that `cat` already has `KAT`, `K-T` before `K-AT` is added.

The word is **not** editable. Its only prior justification was conflict
resolution, which is now handled by the explicit resolutions above. The
chord is editable only through re-chording.

Moving a group's destination away from the word's existing file flags the
row and offers `[move all]` (relocate every chord for that word, including
those already on disk) or `[split anyway]`.

Deletes use a two-stage inline confirm — the button becomes
`Confirm?` / `Cancel` — rather than a blocking browser dialog.

## Write path

`writeEntries` is currently add-only. Two new operations need removal:

- **Move word** — remove a word's chords from their old file and write them
  to the new one.
- **Re-chord** — remove the old stroke, add the new one.

Both must apply the stale-hash guard to **both** files involved. A move that
half-lands is worse than one that fails outright.

## Backend architecture

Migrating `lib/` and `routes/` to TypeScript, restructured as an onion with
dependencies pointing inward only.

- **Domain** (`src/domain/`) — no I/O, no outward imports. Entities
  (`Stroke`, `Word`, `DictionaryFile`, `Priority`, `WordGroup`) and all real
  logic: priority-aware indexing, four-case classification, grouping,
  conflict resolution, override targeting. Testable with zero mocking.
- **Application** (`src/application/`) — use cases (`LoadDictionaries`,
  `SaveDecisions`, `MoveWord`, `CommitAndPush`) depending on **ports**
  (interfaces), never on concrete implementations.
- **Infrastructure** (`src/infrastructure/`) — adapters implementing those
  ports: filesystem repository, git adapter, config provider. The only layer
  touching `node:fs` or shelling out.
- **Presentation** (`routes/`) — thin HTTP handlers mapping DTOs to use
  cases.

On SOLID, the principle that earns its keep here is OCP via strategies: the
four conflict resolutions become separate implementations behind one
interface. Adding a fifth touches no existing resolution — which matters,
because a missing resolution was discovered once already during this
design. DIP is enforced by the port boundary between application and
infrastructure.

## Frontend architecture

React 19 + Vite, TypeScript with TSX. The Node server continues to serve the
API; Vite builds the UI to `public/dist/`. `npm start` serves the built app,
`npm run dev` runs Vite with `/api` proxied to the Node server.

The 7 wizard steps become 7 components. `state.js` becomes a React context —
it is already a flat object of 9 fields, so this is close to a direct
translation. `showStep` becomes a `currentStep` value in that context.

Visual design is dark mode, using CSS custom properties for the palette.

## Testing

`npm test` runs both runners:

- **`node --test`** — domain, application, infrastructure, routes. The
  existing 37 tests move with the code they cover; "existing tests still
  green" is the gate on each migration step, rather than rewriting them.
- **`vitest run` + Testing Library** — React components: radio locking,
  move-vs-split, delete confirmation, chord editing, and the
  Save-blocked-on-unresolved-conflicts rule.

The pure display-model module is covered under `node --test`, not Vitest —
it has no DOM dependency.

## Sequencing

Ordered so the app stays working throughout:

1. Priority-aware stroke index + new word index, with the four-case
   classification. Pure, testable, no UI. **Gates everything else.**
2. Write-path removal support (move word, re-chord) with two-file hash
   guards.
3. TypeScript migration and onion restructure of the backend.
4. Vite/React/TS scaffold; port the 6 straightforward steps.
5. Step 3 — the grouped table, resolutions, and warnings. Last, because it
   carries most of the risk.

## Open questions

None outstanding. The one raised during design — whether `7-commands.json`
sitting below `6-main.json` was intentional — is resolved: it is a stock
dictionary at its original priority, and is protected alongside `main`.
