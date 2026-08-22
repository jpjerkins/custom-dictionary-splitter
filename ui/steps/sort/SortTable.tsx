import { useState } from 'react';
import WordGroupRow from './WordGroupRow.tsx';
import type { WordGroup } from './types.ts';
import { hasUnresolvedConflicts, RESOLUTIONS } from '../../resolutions.ts';
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
        for (const op of ops) {
          decisions.push({
            stroke: op.stroke,
            translation: op.remove ? undefined : op.word,
            destinationFile: op.file,
            capturedHash: fileHashes[op.file],
            remove: op.remove,
            word: group.word,
            chordStroke: chord.stroke,
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
        });
      }
    }
  }

  return { decisions, noOpKeys };
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
}: {
  groups: WordGroup[];
  priority: string[];
  protectedFiles: string[];
}) {
  const { state, setState, goToStep } = useWizard();
  const [groups, setGroups] = useState(initialGroups);
  const [saveStatus, setSaveStatus] = useState('');

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

  function handleSelectDestination(word: string, file: string) {
    setGroups((prev) => prev.map((group) => (group.word === word ? { ...group, destinationFile: file } : group)));
  }

  function handleDeleteWord(word: string) {
    // Nothing here is on disk yet (it's the pending set from /api/classify),
    // so deleting is purely local — unlike the original's drop-a-row, which
    // could POST a removal because retried rows were already saved.
    setGroups((prev) => prev.filter((group) => group.word !== word));
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
          decisions: decisions.map(({ word: _word, chordStroke: _chordStroke, ...decision }) => decision),
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

    // Refresh dictionary hashes regardless of outcome — a second save with
    // stale hashes would otherwise be rejected even after this one succeeded.
    try {
      const dictResponse = await fetch('/api/dictionaries');
      if (dictResponse.ok) {
        const { files, index } = await dictResponse.json();
        setState((prev) => ({
          ...prev,
          dictionaryIndex: index,
          fileHashes: Object.fromEntries(
            Object.entries(files as Record<string, { hash: string }>).map(([name, info]) => [name, info.hash])
          ),
        }));
      }
    } catch {
      // Leave the previous hashes in place; the next save will report them as stale.
    }

    const succeededKeys = new Set(noOpKeys);
    const failedReasons = new Map<string, string>();
    const movedEntries: { stroke: string; translation: string; destinationFile: string }[] = [];
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

  const blocked = hasUnresolvedConflicts(groups);

  return (
    <div className="sort-step">
      <div className="sort-table-scroll">
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
            {groups.map((group) => (
              <WordGroupRow
                key={group.word}
                group={group}
                priority={priority}
                protectedFiles={protectedFiles}
                onResolveChord={handleResolveChord}
                onSelectDestination={handleSelectDestination}
                onDeleteWord={handleDeleteWord}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="sort-table-actions">
        <button type="button" className="btn" disabled={blocked} onClick={handleSave}>
          Save
        </button>
        {blocked && (
          <p className="sort-table-save-reason" role="status">
            Resolve all chord conflicts before saving.
          </p>
        )}
      </div>
      <p data-testid="sort-save-status" role="status" className="text-muted">
        {saveStatus}
      </p>
    </div>
  );
}
