import { useEffect, useState } from 'react';
import type { NewChord } from './types.ts';
import { RESOLUTIONS, defaultResolution } from '../../resolutions.ts';
import type { ResolutionChoice, ResolutionContext, ResolutionKind } from '../../resolutions.ts';

// Labels for the four fixed strategies from ui/resolutions.ts (itself a
// mirror of src/domain/resolutions.ts — see that file's header comment).
// This component decides nothing about which strategies exist, which are
// available, or whether a choice is valid: RESOLUTIONS/defaultResolution/
// isAvailable/validate own all of that. This file only renders their
// answers and forwards the user's picks.
const LABELS: Record<ResolutionKind, string> = {
  'keep-keyboard': 'Use downloaded word (overwrites on disk)',
  'keep-disk': 'Keep on-disk word (discard downloaded)',
  're-chord': 'Assign a different chord',
  override: 'Override from a higher-priority file',
};

// One conflicted chord's resolution controls. Rendered inline inside the
// chord's own <td> (see ChordRow.tsx) rather than as a modal/expander, so a
// long list of conflicts stays scannable — you resolve in place, not in a
// side panel that hides the rest of the table.
//
// This box has no target-file picker of its own. It used to carry a
// `Target file` <select> for override and re-chord, which meant a
// conflicted word had TWO controls naming the same thing: that dropdown and
// the word's own radio row across the dictionary columns to the right. The
// radio row won — it is the one control that files a word, conflicted or
// not — so the target arrives here as the `destinationFile` prop and this
// component only reports what that pick implies.
export default function ConflictResolver({
  word,
  chord,
  priority,
  protectedFiles,
  destinationFile,
  onChange,
  onUserChoice,
}: {
  word: string;
  chord: NewChord;
  priority: string[];
  protectedFiles: string[];
  // The word's radio selection, or null while nothing is picked. Owned by
  // SortTable's `groups` state and threaded down through WordGroupRow.
  destinationFile: string | null;
  onChange: (resolution: ResolutionChoice | null) => void;
  // Fired only when the user actually operates a control in this box.
  // Distinct from onChange, which also fires from the mount effect below to
  // report an auto-preselected override — that is the app's suggestion, not
  // the user's decision, and the two must not be conflated (SortTable tints
  // rows green on decisions and yellow on suggestions).
  onUserChoice?: () => void;
}) {
  const ctx: ResolutionContext = {
    entry: { stroke: chord.stroke, word, diskFile: chord.diskFile },
    priority,
    protectedFiles,
  };

  const [kind, setKind] = useState<ResolutionKind | null>(
    () => chord.resolution?.kind ?? defaultResolution(ctx)
  );
  const [newStroke, setNewStroke] = useState<string>(() => chord.resolution?.newStroke ?? '');

  const targetFile = destinationFile ?? '';
  const strategy = kind ? RESOLUTIONS.find((r) => r.kind === kind) : undefined;
  const choice: ResolutionChoice | null = kind
    ? { kind, targetFile: targetFile || undefined, newStroke: newStroke || undefined }
    : null;
  const rawError = strategy && choice ? strategy.validate(ctx, choice) : null;
  // ui/resolutions.ts is a hand-synced mirror of src/domain/resolutions.ts
  // (see its header — divergence between the two suites is the tripwire),
  // so its wording is re-phrased for the screen here rather than edited at
  // the source. "requires a target file" described a control that no longer
  // exists in this box; point at the radio row that replaced it instead.
  const error =
    rawError !== null && rawError.endsWith('requires a target file')
      ? 'Pick a destination dictionary in the columns to the right.'
      : rawError;

  // An invalid choice (e.g. an override target that can't outrank the
  // shadowed file) is reported upward as null — still unresolved, still
  // blocking Save — rather than as the invalid choice itself. A silently
  // no-op override is the worst outcome here, so it must never read as
  // "resolved".
  useEffect(() => {
    onChange(error ? null : choice);
    // Re-run whenever the user's picks change — including `targetFile`,
    // which is now the word's radio selection arriving from above rather
    // than local state. ctx is derived fresh from props each render so it
    // doesn't need to be a dependency itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, targetFile, newStroke, error]);

  const groupName = `resolve-${word}-${chord.stroke}`;

  // Manually choosing override does NOT auto-fill a target — the brief is
  // explicit that override "requires picking a target file". The only
  // place a target gets suggested automatically is the initializer above,
  // for the case where override itself was auto-preselected because the
  // shadowed file is protected.
  function selectKind(next: ResolutionKind) {
    setKind(next);
    onUserChoice?.();
  }

  return (
    <fieldset className="conflict-resolver">
      <legend className="chord-hint chord-hint-conflict">
        conflicts with {chord.diskWord ?? '?'} in {chord.diskFile ?? '?'}
      </legend>
      <div className="conflict-options">
        {RESOLUTIONS.map((resolution) => {
          const disabled = !resolution.isAvailable(ctx);
          return (
            <label
              key={resolution.kind}
              className={disabled ? 'conflict-option conflict-option-disabled' : 'conflict-option'}
            >
              <input
                type="radio"
                name={groupName}
                value={resolution.kind}
                checked={kind === resolution.kind}
                disabled={disabled}
                onChange={() => selectKind(resolution.kind)}
              />
              {LABELS[resolution.kind]}
              {disabled && (
                <span className="conflict-reason">
                  {' '}
                  — disabled: on-disk entry is in a protected file
                </span>
              )}
            </label>
          );
        })}
      </div>

      {kind === 'override' && (
        <div className="conflict-detail">
          {targetFile && !error && (
            <p className="conflict-target">
              writes <span className="chord-stroke">{chord.stroke}</span> to {targetFile}
            </p>
          )}
          {error && (
            <p className="conflict-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {kind === 're-chord' && (
        <div className="conflict-detail">
          <label>
            New stroke
            <input
              type="text"
              aria-label={`New stroke for ${chord.stroke}`}
              value={newStroke}
              onChange={(e) => {
                setNewStroke(e.target.value);
                onUserChoice?.();
              }}
            />
          </label>
          {targetFile && !error && (
            <p className="conflict-target">
              writes <span className="chord-stroke">{newStroke}</span> to {targetFile}
            </p>
          )}
          {error && (
            <p className="conflict-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
