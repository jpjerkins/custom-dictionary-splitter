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
