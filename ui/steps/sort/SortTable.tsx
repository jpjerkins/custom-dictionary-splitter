import { useRef, useState } from 'react';
import WordGroupRow from './WordGroupRow.tsx';
import type { WordGroup } from './types.ts';
import type { MovedEntry } from './retry.ts';
import { hasUnresolvedConflicts, RESOLUTIONS, defaultResolution, outranks } from '../../resolutions.ts';
import { useWizard } from '../../state/WizardContext.tsx';

// One resolved write, ready to post to /api/save, plus enough of its origin
// (word + the ORIGINAL new-chord stroke, before a re-chord might rename it)
// to reconcile the response back to a specific row in `groups`.
interface PendingDecision {
  stroke: string;
  translation?: string;
  destinationFile: string;
  capturedHash: string | undefined;
  remove?: boolean;
  word: string;
  chordStroke: string;
  // True only for a keep-keyboard resolution of a 'chord-taken'/'both'
  // chord: the only write that overwrites an existing on-disk entry in
  // place. Everything else (override, re-chord, a plain new/word-exists
  // chord) writes somewhere nothing occupied. Threaded into movedEntries
  // so a later Step 6 failure can retry-drop this row by RESTORING
  // `existingTranslation` instead of deleting the stroke — see
  // ui/steps/sort/retry.ts.
  wasConflict: boolean;
  existingTranslation?: string;
}

// Turns the current groups into the /api/save wire shape. Mirrors
// public/js/steps/step3-sort.js's `decisions` array, generalized from one
// row per chord to one row per RESOLVED write: an unresolved conflict
// chord contributes nothing (Save is disabled while any exist — see
// `blocked` below), a plain new/word-exists chord contributes one write to
// its group's radio-picked destinationFile, and a resolved conflict chord
// contributes whatever ui/resolutions.ts's toWriteOps says (zero ops for
// keep-disk, one otherwise).
function buildDecisions(
  groups: WordGroup[],
  priority: string[],
  protectedFiles: string[],
  fileHashes: Record<string, string>
): { decisions: PendingDecision[]; noOpKeys: Set<string> } {
  const decisions: PendingDecision[] = [];
  const noOpKeys = new Set<string>();

  for (const group of groups) {
    for (const chord of group.newChords) {
      if (chord.kind === 'unchanged') continue;

      if (chord.kind === 'chord-taken' || chord.kind === 'both') {
        if (!chord.resolution) continue; // unresolved — Save is disabled while this exists
        const strategy = RESOLUTIONS.find((r) => r.kind === chord.resolution!.kind);
        if (!strategy) continue;
        const ctx = {
          entry: { stroke: chord.stroke, word: group.word, diskFile: chord.diskFile },
          priority,
          protectedFiles,
        };
        const ops = strategy.toWriteOps(ctx, chord.resolution);
        if (ops.length === 0) {
          // keep-disk: nothing to write, but the chord IS resolved — drop it
          // from the pending set without a round trip to the server.
          noOpKeys.add(`${group.word}::${chord.stroke}`);
          continue;
        }
        const wasConflict = chord.resolution!.kind === 'keep-keyboard';
        for (const op of ops) {
          decisions.push({
            stroke: op.stroke,
            translation: op.remove ? undefined : op.word,
            destinationFile: op.file,
            capturedHash: fileHashes[op.file],
            remove: op.remove,
            word: group.word,
            chordStroke: chord.stroke,
            wasConflict,
            existingTranslation: wasConflict ? chord.diskWord : undefined,
          });
        }
      } else {
        // 'new' or 'word-exists': files under whichever dictionary the
        // word's radio group has picked. No selection yet means nothing to
        // save for this chord — it just stays pending.
        if (!group.destinationFile) continue;
        decisions.push({
          stroke: chord.stroke,
          translation: group.word,
          destinationFile: group.destinationFile,
          capturedHash: fileHashes[group.destinationFile],
          word: group.word,
          chordStroke: chord.stroke,
          wasConflict: false,
        });
      }
    }
  }

  return { decisions, noOpKeys };
}

// ConflictResolver used to own this: when it auto-preselected `override`
// (because the shadowed on-disk entry sits in a protected file), it also
// silently filled its own Target file dropdown with a file that actually
// outranked the shadow, so the preselection arrived valid rather than
// half-done. That dropdown is gone — the target is now the word's radio row
// — so the same courtesy has to be applied out here, to the group's
// destinationFile. Without it every protected-file conflict would land
// pre-blocked, asking the user to pick a destination for a resolution the
// UI chose on their behalf.
//
// Only ever fills a destination that is still null: a preset from
// /api/classify (buildWordGroups) always wins.
function presetOverrideDestinations(
  groups: WordGroup[],
  priority: string[],
  protectedFiles: string[]
): WordGroup[] {
  const writableFiles = priority.filter((f) => !protectedFiles.includes(f));

  return groups.map((group) => {
    if (group.destinationFile) return group;

    const shadowed = group.newChords.find(
      (chord) =>
        (chord.kind === 'chord-taken' || chord.kind === 'both') &&
        chord.diskFile !== undefined &&
        defaultResolution({
          entry: { stroke: chord.stroke, word: group.word, diskFile: chord.diskFile },
          priority,
          protectedFiles,
        }) === 'override'
    );
    if (!shadowed?.diskFile) return group;

    // Win by the smallest margin that works: of the writable files that
    // outrank the shadowed one, take the LAST in priority order — the one
    // sitting immediately above it. priority is highest-first, so that is
    // the closest, not the strongest.
    //
    // Taking the first instead put every 6-main.json override into
    // 1-bible.json purely because it sorts first, which is both a strange
    // home for an override and shadows everything in between. The nearest
    // file above the shadowed one is the least surprising default (here,
    // 5-user.json).
    const candidates = writableFiles.filter((f) => outranks(priority, f, shadowed.diskFile!));
    const target = candidates[candidates.length - 1];
    return target ? { ...group, destinationFile: target } : group;
  });
}

// Words arriving with a filing nobody chose: either /api/classify preset a
// destinationFile (buildWordGroups picks the highest-priority file the word
// already lives in), or presetOverrideDestinations above just filled one in
// for an auto-preselected override. Those render yellow until the user
// touches them; see `rowStatus` in the component.
//
// Snapshotted once, from the ALREADY-preset groups, so it captures the
// state the screen actually opened in.
function findSuggestedWords(groups: WordGroup[]): Set<string> {
  return new Set(groups.filter((group) => group.destinationFile !== null).map((group) => group.word));
}

// Is this word one of the ones stopping Save? Used for BOTH the red row
// tint and the list of names in the save gate's message, so the thing that
// blocks and the thing the screen points at can never disagree.
//
// hasUnresolvedConflicts is the hand-synced mirror of
// src/domain/grouping.ts; calling it per-group reuses that rule rather than
// re-implementing it here, keeping the drift tripwire alive. editConflict
// is UI-only (a stroke edited into one already pending in this batch) and
// has no domain counterpart.
function isGroupBlocked(group: WordGroup): boolean {
  return hasUnresolvedConflicts([group]) || group.newChords.some((chord) => chord.editConflict !== undefined);
}

// Client-side-only collision check for chord editing: does `candidate`
// already belong to some OTHER new chord pending in this same download
// batch? This has nothing to do with what's on disk (that's what
// classify()/the stroke index already resolved into 'chord-taken'/'both'
// kinds) — it catches the user editing two chords into the same stroke
// before either has been saved.
function findStrokeCollision(
  groups: WordGroup[],
  excludeWord: string,
  excludeStroke: string,
  candidate: string
): string | null {
  for (const group of groups) {
    for (const chord of group.newChords) {
      if (group.word === excludeWord && chord.stroke === excludeStroke) continue;
      if (chord.stroke === candidate) return group.word;
    }
  }
  return null;
}

// invariantWarning/priorityWarning are always null from /api/classify (see
// src/domain/grouping.ts) — they only describe drift the UI itself
// introduces after that initial snapshot, so they're computed fresh from
// the CURRENT groups on every render rather than stored as state:
//   - invariantWarning: the word's radio has been pointed at a file other
//     than where it already lives on disk (a deliberate "split anyway").
//   - priorityWarning: after resolving conflicts, this word's own new
//     chords are about to land in more than one file.
function computeGroupWarnings(group: WordGroup): { invariantWarning: string | null; priorityWarning: string | null } {
  const existingFiles = Array.from(new Set(group.existingChords.map((c) => c.file)));
  const invariantWarning =
    group.destinationFile && existingFiles.length > 0 && !existingFiles.includes(group.destinationFile)
      ? `Splitting "${group.word}": it already exists in ${existingFiles.join(', ')}.`
      : (group.invariantWarning ?? null);

  const resolvedTargets = new Set<string>();
  for (const chord of group.newChords) {
    if (chord.kind === 'new' || chord.kind === 'word-exists') {
      if (group.destinationFile) resolvedTargets.add(group.destinationFile);
    } else if (chord.resolution?.targetFile) {
      resolvedTargets.add(chord.resolution.targetFile);
    } else if (chord.resolution?.kind === 'keep-keyboard' && chord.diskFile) {
      resolvedTargets.add(chord.diskFile);
    }
  }
  const priorityWarning =
    resolvedTargets.size > 1
      ? `"${group.word}"'s chords will land in more than one file: ${Array.from(resolvedTargets).join(', ')}.`
      : (group.priorityWarning ?? null);

  return { invariantWarning, priorityWarning };
}

// The Step 3 (Sort) table. Filing an entry used to be a two-click <select>
// per row; this replaces it with one radio column per dictionary so filing
// is a single click. `priority` drives column order (leftmost = highest
// priority) and comes from GET /api/dictionaries. `groups` comes from
// POST /api/classify, which already sorts alphabetically by word — this
// component relies on that but does not re-sort, since re-sorting here
// would silently mask the API ever returning an unsorted list.
//
// Conflict resolutions are owned here (not lifted further up) because
// nothing outside the sort step needs to react to them mid-edit — only the
// Save gate, which lives right below the table. `groups` is copied into
// local state on mount so resolution/destination/delete choices can be
// recorded per chord; if the `groups` prop itself changes later (e.g. a
// fresh classify), the caller should remount this component (e.g. via
// `key`) rather than expect it to re-sync.
//
// Save itself lives here too (rather than in a separate Step3Sort wrapper,
// which doesn't exist yet) — see public/js/steps/step3-sort.js for the
// original: POST the resolved writes to /api/save, keep failed rows on
// screen with their reason, drop succeeded ones, fold succeeded rows into
// wizard state (movedEntries/touchedFiles/checklist) for Step 6 to consume,
// refresh dictionary hashes so a second save isn't rejected as stale, and
// advance to the next step only once nothing failed.
export default function SortTable({
  groups: initialGroups,
  priority,
  protectedFiles,
  deviceOrderMismatch,
  deviceMissingFiles,
}: {
  groups: WordGroup[];
  priority: string[];
  protectedFiles: string[];
  // From POST /api/classify's response. Two distinct, routine situations —
  // conflated they'd read as one alarming "your keyboard is wrong" message,
  // when in fact reordering dictionaries and adding a new one are both
  // normal things to do.
  deviceOrderMismatch?: boolean;
  deviceMissingFiles?: string[];
}) {
  const { state, setState, goToStep } = useWizard();
  const [groups, setGroups] = useState(() =>
    presetOverrideDestinations(initialGroups, priority, protectedFiles)
  );
  // Row status. `suggestedWords` is a mount-time snapshot and never changes;
  // `decidedWords` grows as the user acts. Green (decided) beats yellow
  // (suggested), so re-picking the file that was already suggested still
  // counts as confirming it.
  // Reads `groups` (not initialGroups) so it sees the presets applied above:
  // both useState initializers run on the same first render, and `groups` is
  // already bound by the time this one executes.
  const [suggestedWords] = useState(() => findSuggestedWords(groups));
  const [decidedWords, setDecidedWords] = useState<Set<string>>(() => new Set());
  const [saveStatus, setSaveStatus] = useState('');
  // Set when a radio pick would split a word across files (it already has
  // chords in some OTHER file): offers "move all" (POST /api/move-word) vs
  // "split anyway" (just file the new chord there, leave the rest where it is).
  const [splitPrompt, setSplitPrompt] = useState<{
    word: string;
    toFile: string;
    fromFiles: string[];
    // Whether the word was already green BEFORE the click that raised this
    // prompt. Abandoning the prompt has to restore that exact state — see
    // revertSplitPrompt. Nothing else needs capturing: the pick is
    // deliberately not applied while the prompt is up, so destinationFile
    // (and with it the radio) is still untouched.
    wasDecided: boolean;
  } | null>(null);
  const [moveStatus, setMoveStatus] = useState('');
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Jump the table to a word's row. The table scrolls inside its own
  // container (that's what the sticky headers stick to), so this scrolls
  // that container rather than the page. `block: 'center'` keeps the row
  // clear of the pinned header instead of landing underneath it.
  function scrollToWord(word: string) {
    const container = tableScrollRef.current;
    if (!container) return;
    const row = Array.from(container.querySelectorAll<HTMLElement>('[data-word-row]')).find(
      (el) => el.dataset.wordRow === word
    );
    // scrollIntoView is absent under jsdom, which does no layout.
    row?.scrollIntoView?.({
      block: 'center',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  // The split prompt is a question. Picking somewhere else instead of
  // answering it must leave the word that raised it exactly as it was
  // found, rather than stranding a stale prompt above a row that looks
  // decided but has had nothing applied to it.
  function revertSplitPrompt(pending: NonNullable<typeof splitPrompt>) {
    if (!pending.wasDecided) {
      setDecidedWords((prev) => {
        if (!prev.has(pending.word)) return prev;
        const next = new Set(prev);
        next.delete(pending.word);
        return next;
      });
    }
    setSplitPrompt(null);
    setMoveStatus('');
  }

  // Called only from genuine user interaction — never from a component's
  // mount effect. ConflictResolver in particular fires its onChange once on
  // mount to report an auto-preselected override, which is a suggestion,
  // not a decision; that's why it has a separate onUserChoice callback and
  // why handleResolveChord below does NOT mark the word decided.
  //
  // Acting on any OTHER word also abandons a pending split prompt. Note
  // handleSelectDestination does NOT route through here — it owns the
  // prompt's whole lifecycle itself, because two handlers both writing
  // splitPrompt from the same click would race on a stale closure value.
  function markDecided(word: string) {
    if (splitPrompt && splitPrompt.word !== word) revertSplitPrompt(splitPrompt);
    setDecidedWords((prev) => (prev.has(word) ? prev : new Set(prev).add(word)));
  }

  function handleResolveChord(
    word: string,
    stroke: string,
    resolution: WordGroup['newChords'][number]['resolution']
  ) {
    setGroups((prev) =>
      prev.map((group) =>
        group.word === word
          ? {
              ...group,
              newChords: group.newChords.map((chord) =>
                chord.stroke === stroke ? { ...chord, resolution, saveError: undefined } : chord
              ),
            }
          : group
      )
    );
  }

  function applyDestination(word: string, file: string) {
    setGroups((prev) => prev.map((group) => (group.word === word ? { ...group, destinationFile: file } : group)));
  }

  // Reached from a radio's onClick — not onChange, which does not fire when
  // the user clicks the option that is already checked (confirming the
  // app's suggestion has to count as a decision). This is the single entry
  // point for filing a word: it owns marking the word decided AND the split
  // prompt's whole lifecycle, so nothing else writes splitPrompt on the
  // same click.
  function handleSelectDestination(word: string, file: string) {
    const pending = splitPrompt;
    // Re-picking the same word replaces its prompt rather than starting a
    // fresh one, so the ORIGINAL "was it decided before any of this" has to
    // carry forward — reading decidedWords now would see the previous
    // click's own mark and make the revert a no-op.
    const wasDecided = pending?.word === word ? pending.wasDecided : decidedWords.has(word);

    if (pending) {
      // A prompt belonging to a different word is abandoned, and that word
      // goes back to how it was. One for this same word is simply retired;
      // the branch below decides whether a new one replaces it.
      if (pending.word !== word) revertSplitPrompt(pending);
      else {
        setSplitPrompt(null);
        setMoveStatus('');
      }
    }

    setDecidedWords((prev) => (prev.has(word) ? prev : new Set(prev).add(word)));

    const group = groups.find((g) => g.word === word);
    const existingFiles = group ? Array.from(new Set(group.existingChords.map((c) => c.file))) : [];
    // Only prompt when the word already lives somewhere else — picking the
    // same file it's already in, or a first-time word, is never a split.
    if (existingFiles.length > 0 && !existingFiles.includes(file)) {
      setSplitPrompt({ word, toFile: file, fromFiles: existingFiles, wasDecided });
      return;
    }
    applyDestination(word, file);
  }

  function handleSplitAnyway() {
    if (!splitPrompt) return;
    applyDestination(splitPrompt.word, splitPrompt.toFile);
    setSplitPrompt(null);
  }

  async function handleMoveAll() {
    if (!splitPrompt) return;
    const { word, toFile, fromFiles } = splitPrompt;
    const fileHashes = (state.fileHashes as Record<string, string> | null) ?? {};

    setMoveStatus('Moving...');
    let response: Response;
    try {
      response = await fetch('/api/move-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, fromFile: fromFiles[0], toFile, capturedHashes: fileHashes }),
      });
    } catch (err) {
      setMoveStatus(`Error: ${(err as Error).message}`);
      return;
    }

    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}));
      setMoveStatus(`Error: ${error || response.statusText}`);
      return;
    }

    const result: { status: 'ok' | 'stale' | 'error' | 'partial'; reason?: string; left?: { stroke: string; file: string }[] } =
      await response.json();

    if (result.status === 'stale' || result.status === 'error') {
      setMoveStatus(`Could not move "${word}": ${result.reason}`);
      return;
    }

    if (result.status === 'partial') {
      // Never treat this as success: the word now exists in BOTH files and
      // needs manual cleanup. Leave the prompt up so the message stays visible.
      setMoveStatus(`"${word}" now exists in BOTH files and needs manual cleanup: ${result.reason}`);
      return;
    }

    // /api/move-word doesn't trust the `fromFile` it was sent — it
    // rediscovers every non-protected file that actually holds the word and
    // writes all of them (see src/application/moveWord.ts). `fromFiles` here
    // is the full set of files this group's `existingChords` already showed
    // the word living in (that's what built the split prompt), so filtering
    // out protectedFiles reproduces the same write set client-side without
    // a backend response change.
    await refreshDictionaries();
    const touchedByMove = [toFile, ...fromFiles.filter((f) => !protectedFiles.includes(f))];
    setState((prev) => ({
      ...prev,
      touchedFiles: Array.from(new Set([...(prev.touchedFiles as string[]), ...touchedByMove])),
    }));

    const leftKeys = new Set((result.left ?? []).map((c) => `${c.stroke}::${c.file}`));
    setGroups((prev) =>
      prev.map((group) =>
        group.word === word
          ? {
              ...group,
              existingChords: group.existingChords.map((c) =>
                leftKeys.has(`${c.stroke}::${c.file}`) ? c : { ...c, file: toFile }
              ),
              destinationFile: toFile,
            }
          : group
      )
    );
    setMoveStatus(
      result.left && result.left.length > 0
        ? `Moved "${word}" to ${toFile}. ${result.left.length} chord(s) stayed behind in a protected file.`
        : `Moved "${word}" to ${toFile}.`
    );
    setSplitPrompt(null);
  }

  function handleDeleteWord(word: string) {
    // Nothing here is on disk yet (it's the pending set from /api/classify),
    // so deleting is purely local — unlike the original's drop-a-row, which
    // could POST a removal because retried rows were already saved.
    setGroups((prev) => prev.filter((group) => group.word !== word));
  }

  function handleEditStrokeDraft(word: string, originalStroke: string, candidate: string) {
    const collidingWord = candidate.trim() ? findStrokeCollision(groups, word, originalStroke, candidate.trim()) : null;
    setGroups((prev) =>
      prev.map((group) =>
        group.word !== word
          ? group
          : {
              ...group,
              newChords: group.newChords.map((chord) =>
                chord.stroke !== originalStroke ? chord : { ...chord, editConflict: collidingWord ?? undefined }
              ),
            }
      )
    );
  }

  function handleCommitStroke(word: string, originalStroke: string, candidate: string) {
    markDecided(word);
    const trimmed = candidate.trim();
    const collidingWord = trimmed ? findStrokeCollision(groups, word, originalStroke, trimmed) : null;
    setGroups((prev) =>
      prev.map((group) =>
        group.word !== word
          ? group
          : {
              ...group,
              newChords: group.newChords.map((chord) => {
                if (chord.stroke !== originalStroke) return chord;
                if (collidingWord) return { ...chord, editConflict: collidingWord };
                if (!trimmed) return { ...chord, editConflict: 'a stroke cannot be blank' };
                return { ...chord, stroke: trimmed, editConflict: undefined };
              }),
            }
      )
    );
  }

  // Refresh dictionary hashes regardless of outcome — a second write with
  // stale hashes would otherwise be rejected even after this one succeeded.
  // Shared by handleSave and handleMoveAll: a Move writes through a
  // different endpoint (/api/move-word) but leaves the same stale-hash trap
  // behind for the next Save if the caller forgets this.
  async function refreshDictionaries() {
    try {
      const dictResponse = await fetch('/api/dictionaries');
      if (!dictResponse.ok) return;
      const { files, index } = await dictResponse.json();
      // Computed BEFORE setState, not inside its updater: React runs a
      // functional updater during its own state-processing pass, outside
      // this try's synchronous scope, so a malformed response (e.g. no
      // `files` key) would otherwise throw uncaught instead of being
      // swallowed below.
      const fileHashes = Object.fromEntries(
        Object.entries(files as Record<string, { hash: string }>).map(([name, info]) => [name, info.hash])
      );
      setState((prev) => ({ ...prev, dictionaryIndex: index, fileHashes }));
    } catch {
      // Leave the previous hashes in place; the next write will report them as stale.
    }
  }

  async function handleSave() {
    const fileHashes = (state.fileHashes as Record<string, string> | null) ?? {};
    const { decisions, noOpKeys } = buildDecisions(groups, priority, protectedFiles, fileHashes);

    if (decisions.length === 0 && noOpKeys.size === 0) {
      setSaveStatus('Nothing selected to save yet.');
      return;
    }

    setSaveStatus('Saving...');

    let response: Response;
    try {
      response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisions: decisions.map(
            ({ word: _word, chordStroke: _chordStroke, wasConflict: _wasConflict, existingTranslation: _existingTranslation, ...decision }) =>
              decision
          ),
        }),
      });
    } catch (err) {
      setSaveStatus(`Error: ${(err as Error).message}`);
      return;
    }

    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}));
      setSaveStatus(`Error: ${error || response.statusText}`);
      return;
    }

    const { results } = (await response.json()) as {
      results: { stroke: string; status: string; reason?: string }[];
    };

    await refreshDictionaries();

    const succeededKeys = new Set(noOpKeys);
    const failedReasons = new Map<string, string>();
    const movedEntries: MovedEntry[] = [];
    const touchedFiles = new Set<string>();

    results.forEach((result, i) => {
      const decision = decisions[i];
      const key = `${decision.word}::${decision.chordStroke}`;
      if (result.status === 'stale' || result.status === 'error') {
        failedReasons.set(key, result.reason ?? result.status);
      } else {
        succeededKeys.add(key);
        if (!decision.remove) {
          movedEntries.push({
            stroke: decision.stroke,
            translation: decision.translation ?? '',
            destinationFile: decision.destinationFile,
            wasConflict: decision.wasConflict,
            existingTranslation: decision.existingTranslation,
          });
        }
        touchedFiles.add(decision.destinationFile);
      }
    });

    setGroups((prev) =>
      prev
        .map((group) => ({
          ...group,
          newChords: group.newChords
            .map((chord) => {
              const key = `${group.word}::${chord.stroke}`;
              const reason = failedReasons.get(key);
              return reason ? { ...chord, saveError: reason } : chord;
            })
            .filter((chord) => !succeededKeys.has(`${group.word}::${chord.stroke}`)),
        }))
        .filter((group) => group.newChords.length > 0)
    );

    setState((prev) => ({
      ...prev,
      movedEntries: [...(prev.movedEntries as unknown[]), ...movedEntries],
      touchedFiles: Array.from(new Set([...(prev.touchedFiles as string[]), ...touchedFiles])),
      checklist: (prev.checklist as { stroke: string }[]).filter(
        (row) => !movedEntries.some((e) => e.stroke === row.stroke)
      ),
    }));

    if (failedReasons.size > 0) {
      setSaveStatus(`${failedReasons.size} entries failed to save.`);
      return;
    }

    setSaveStatus(`Saved ${succeededKeys.size} entries.`);
    goToStep('empty');
  }

  const blockingWords = groups.filter(isGroupBlocked).map((group) => group.word);
  const blocked = blockingWords.length > 0;

  return (
    <div className="sort-step">
      {deviceOrderMismatch && (
        <p className="device-banner" role="status">
          Your keyboard's dictionary order doesn't match what's on disk — reordered dictionaries are routine, but
          double-check priority above looks right before saving.
        </p>
      )}
      {deviceMissingFiles && deviceMissingFiles.length > 0 && (
        <p className="device-banner" role="status">
          The keyboard's firmware doesn't have these dictionaries loaded yet: {deviceMissingFiles.join(', ')}. You may
          need to reflash before entries filed there take effect.
        </p>
      )}
      {splitPrompt && (
        <div className="split-prompt" role="alertdialog" aria-label={`Move ${splitPrompt.word}?`}>
          <p>
            "{splitPrompt.word}" already exists in {splitPrompt.fromFiles.join(', ')}. Move all of its chords to{' '}
            {splitPrompt.toFile}, or just file the new chord there and leave the rest where it is?
          </p>
          <button type="button" className="btn" onClick={handleMoveAll}>
            Move all
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleSplitAnyway}>
            Split anyway
          </button>
          {moveStatus && (
            <p className="conflict-error" role="alert">
              {moveStatus}
            </p>
          )}
        </div>
      )}
      <div className="sort-table-scroll" ref={tableScrollRef}>
        <table className="entry-table sort-table">
          <thead>
            <tr>
              <th scope="col" className="chords-header">
                Chords
              </th>
              <th scope="col" className="word-header">
                Word
              </th>
              {priority.map((file) => {
                const isProtected = protectedFiles.includes(file);
                return (
                  <th
                    key={file}
                    scope="col"
                    className={isProtected ? 'dict-header dict-header-protected' : 'dict-header'}
                    title={isProtected ? `${file} (protected baseline — read only)` : file}
                  >
                    <span className="dict-header-label">{file}</span>
                    {isProtected && <span className="dict-header-badge">baseline</span>}
                  </th>
                );
              })}
              <th scope="col" className="delete-header">
                Delete
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const { invariantWarning, priorityWarning } = computeGroupWarnings(group);
              return (
                <WordGroupRow
                  key={group.word}
                  group={group}
                  priority={priority}
                  protectedFiles={protectedFiles}
                  // 'blocked' outranks everything. The tint is per-WORD
                  // while a conflict resolution is per-CHORD, so picking a
                  // destination for a word whose conflict is still
                  // unresolved would otherwise paint it green — the exact
                  // failure that made a fully-green table refuse to save.
                  // Green must mean "this word will be written", not merely
                  // "the user touched this word".
                  status={
                    isGroupBlocked(group)
                      ? 'blocked'
                      : decidedWords.has(group.word)
                        ? 'decided'
                        : suggestedWords.has(group.word)
                          ? 'suggested'
                          : null
                  }
                  onResolveChord={handleResolveChord}
                  onUserAction={markDecided}
                  onSelectDestination={handleSelectDestination}
                  onDeleteWord={handleDeleteWord}
                  onEditStrokeDraft={handleEditStrokeDraft}
                  onCommitStroke={handleCommitStroke}
                  invariantWarning={invariantWarning}
                  priorityWarning={priorityWarning}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sort-table-actions">
        <button type="button" className="btn" disabled={blocked} onClick={handleSave}>
          Save
        </button>
        {blocked && (
          // Names ONE word — the first still-blocking row in table order,
          // which is the order the list is worked in — and makes it a jump
          // target. "Resolve all chord conflicts before saving" was true but
          // unactionable: with a few hundred rows in a scrolling container
          // there was nowhere to look. Listing every blocker instead just
          // moves the haystack into the message; the next one down is the
          // only one that matters while working top to bottom.
          <p className="sort-table-save-reason" role="status">
            Resolve conflicts for{' '}
            <button type="button" className="link-button" onClick={() => scrollToWord(blockingWords[0]!)}>
              {blockingWords[0]}
            </button>
            {blockingWords.length > 1 ? ` and ${blockingWords.length - 1} more` : ''}.
          </p>
        )}
      </div>
      <p data-testid="sort-save-status" role="status" className="text-muted">
        {saveStatus}
      </p>
    </div>
  );
}
