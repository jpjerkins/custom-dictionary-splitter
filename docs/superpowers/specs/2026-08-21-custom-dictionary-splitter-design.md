# Custom Dictionary Splitter — Design

## Purpose

A local webapp that guides Phil through the full workflow of moving new
steno entries from his Starboard keyboard's on-device custom dictionary
(Javelin firmware) into his `steno-dictionaries` git repo, verifying they
work, and (optionally) publishing the result.

Today this is a manual, error-prone, multi-site process: connect to the
keyboard with a separate tool, eyeball new entries, hand-edit JSON files,
empty the device dictionary, rebuild firmware on another site, flash it,
and hope nothing broke. This app turns it into one guided wizard with a
test/fix loop before anything is pushed.

## Non-goals

- Not a general Javelin/steno-firmware management tool — scoped to Phil's
  specific dictionary-sync workflow.
- Does not automate emptying the device dictionary or building/flashing
  firmware — those happen on `lim.au`, cross-origin, outside this app's
  control. The app links to them and tracks "done" state.
- Not multi-user / not deployed anywhere — runs locally, single user.

## Architecture

One local Node process serves both roles:

- **Static frontend**: plain HTML/JS, no build step, no framework. A
  single-page app that swaps between wizard "steps" via JS view changes
  (no router library needed) so in-memory state (downloaded dictionary,
  sort decisions, test results) flows across steps without re-fetching.
- **HTTP API**: small Express-style server providing filesystem read
  (enumerate dictionary files), write (commit sorted entries), and git
  operations (commit, optional push) against the configured
  `steno-dictionaries` checkout.

Web Serial (`navigator.serial`) is used directly from the browser to talk
to the keyboard — this only happens in Step 1; nothing else in the app
touches the serial connection.

### Config file

`config.json`, local-only, gitignored, sitting next to the server:

```json
{
  "dictionariesPath": "/Users/phil/dev/steno-dictionaries",
  "git": { "autoPush": false }
}
```

- `dictionariesPath` — folder whose `*.json` files are all treated as
  candidate destination files (no curated subset; whatever's in the
  folder is fair game).
- `git.autoPush` — gates Step 7; commit always happens locally, push only
  if this is `true`.

## Keyboard protocol (from research)

- Javelin firmware (`jthlim/javelin-steno` + `javelin-steno-pico`)
  exposes a genuine USB CDC-ACM serial port — Web Serial API applies
  directly, no drivers, no WebHID/WebUSB needed.
- Plain-text, newline-terminated console protocol.
- Flow: send `list_dictionaries\n` → find the user dictionary's name
  (confirm exact name against real hardware, don't hardcode blindly) →
  send `print_dictionary <name>\n` → firmware returns the dictionary
  pre-serialized as JSON. No on-device binary format parsing needed.
- Unknowns to validate against real hardware: whether large dumps
  stream/chunk over CDC (read incrementally, don't assume one read()
  call returns everything), and confirming the CDC interface (not just
  the HID console interface) is what the OS/Chrome exposes as a
  selectable serial port.

## Wizard steps

### 1. Connect & Download

"Connect keyboard" → `navigator.serial.requestPort()` → open port → send
`list_dictionaries` → send `print_dictionary <name>` → parse JSON
response (read incrementally; show progress). Errors (connect failure,
malformed/partial JSON) shown inline with a retry button and the raw
response text — no silent fallback.

### 2. Diff

Server loads all `*.json` files from `dictionariesPath`, builds a
stroke → (file, translation) index. Client diffs the downloaded
dictionary against it into three buckets:

- **new** — stroke not present in any file
- **conflict** — stroke present elsewhere with a *different* translation
- **unchanged** — already matches; not shown

### 3. Sort

One reviewable list combining **new** and **conflict** entries
(conflicts visually flagged).

- Each row: destination-file dropdown (defaulted to a reasonable guess,
  overridable).
- Conflict rows additionally offer: keep keyboard value / keep existing
  value / manual edit.
- "Commit to disk" sends the finalized list to the server, which:
  - Pre-write check: compares each target file's captured mtime/hash
    from Step 2 against its current state; if changed (e.g. hand-edited
    meanwhile), refuses that file's write and tells Phil to re-diff.
  - Inserts entries into their chosen files.
  - Re-sorts each modified file by **canonical steno key order** (not
    alphabetical) — left-hand initial consonants, vowels, right-hand
    final consonants, per Javelin/Plover stroke-ordering conventions;
    exact comparator table to be pinned down during implementation.
  - Entries whose stroke doesn't parse cleanly against that ordering
    table are appended at file-end with a warning, rather than blocking
    the save.
  - Nothing is git-committed at this point — left as a working-tree
    diff for Step 7 (or manual review).

### 4. Empty on-device dictionary

Static instructions + link to
`https://lim.au/#/software/javelin-steno-tools/dictionary-management`.
Manual step (cross-origin, no automation possible) — "Done, continue"
button advances the wizard.

### 5. Flash new firmware

Static instructions + link to
`https://lim.au/#/software/javelin-steno/starboardRp2040`, plus an
explicit note that uploading requires disconnecting the keyboard to
enter flashing mode — expected, not an error, and harmless since the
dictionary was already downloaded in Step 1. "Done, continue" advances
the wizard.

### 6. Test

Checklist generated from the entries moved in Step 3: each row shows
the stroke and expected translation plus a text input where Phil types
what actually came out after stroking it on the keyboard. Auto-flags
match/mismatch per row. No serial connection involved — this is normal
typing output, not console commands.

### 7. Commit & push (conditional)

Enabled once all Step 6 rows pass. Always creates a local git commit in
`steno-dictionaries` with an auto-generated message listing the strokes
added (e.g. `Add N entries from Starboard: KAT, TKOG, ...`). Runs
`git push` only if `config.json`'s `git.autoPush` is `true`; otherwise
commits locally and tells Phil to push himself.

## The test/fix loop

Steps 3–6 are not strictly linear. If Step 6 testing finds a mismatch,
or the Step 5 firmware build reports an error on an entry, Phil returns
to Step 3 to fix or drop the offending entry, re-saves, and redoes
Steps 4–6. The wizard retains prior state across this loop (downloaded
dictionary, earlier sort decisions, test results already passed) so
looping back doesn't force a full restart.

## Error handling summary

- Serial connect/read failures: inline error, retry button, no silent
  fallback.
- Malformed/partial `print_dictionary` response: shown as error with
  raw text visible.
- Stale file at write time: write refused for that file, prompts re-diff.
- Unparseable stroke for sort ordering: appended at file end with a
  warning, doesn't block the save.

## Open items for implementation

- Confirm exact on-device user-dictionary name via `list_dictionaries`
  on real hardware (don't hardcode from docs alone).
- Confirm whether `print_dictionary` responses need chunked/streamed
  reads for large dictionaries.
- Source or derive the canonical steno key-order comparator table.
