import { useEffect, useState } from 'react';
import type { NewChord } from './types.ts';
import { RESOLUTIONS, defaultResolution, outranks } from '../../resolutions.ts';
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
export default function ConflictResolver({
  word,
  chord,
  priority,
  protectedFiles,
  onChange,
}: {
  word: string;
  chord: NewChord;
  priority: string[];
  protectedFiles: string[];
  onChange: (resolution: ResolutionChoice | null) => void;
}) {
  const ctx: ResolutionContext = {
    entry: { stroke: chord.stroke, word, diskFile: chord.diskFile },
    priority,
    protectedFiles,
  };
  // override/re-chord can only ever target a file the user actually edits —
  // writing into a protected baseline would contradict the reason it's
  // protected, so it never appears as a choosable target.
  const writableFiles = priority.filter((f) => !protectedFiles.includes(f));

  const [kind, setKind] = useState<ResolutionKind | null>(
    () => chord.resolution?.kind ?? defaultResolution(ctx)
  );
  const [targetFile, setTargetFile] = useState<string>(() => {
    if (chord.resolution?.targetFile) return chord.resolution.targetFile;
    const initialKind = chord.resolution?.kind ?? defaultResolution(ctx);
    // When override is auto-preselected (shadowed file is protected), also
    // suggest a target that actually outranks it, so the preselection is
    // immediately valid rather than silently incomplete. This is just a
    // convenience default for the input — validate() below still governs
    // whether the resolution counts as resolved.
    if (initialKind === 'override' && chord.diskFile) {
      return writableFiles.find((f) => outranks(priority, f, chord.diskFile!)) ?? '';
    }
    return '';
  });
  const [newStroke, setNewStroke] = useState<string>(() => chord.resolution?.newStroke ?? '');

  const strategy = kind ? RESOLUTIONS.find((r) => r.kind === kind) : undefined;
  const choice: ResolutionChoice | null = kind
    ? { kind, targetFile: targetFile || undefined, newStroke: newStroke || undefined }
    : null;
  const error = strategy && choice ? strategy.validate(ctx, choice) : null;

  // An invalid choice (e.g. an override target that can't outrank the
  // shadowed file) is reported upward as null — still unresolved, still
  // blocking Save — rather than as the invalid choice itself. A silently
  // no-op override is the worst outcome here, so it must never read as
  // "resolved".
  useEffect(() => {
    onChange(error ? null : choice);
    // Re-run whenever the user's picks change; ctx is derived fresh from
    // props each render so it doesn't need to be a dependency itself.
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
          <label>
            Target file
            <select
              aria-label={`Override target file for ${chord.stroke}`}
              value={targetFile}
              onChange={(e) => setTargetFile(e.target.value)}
            >
              <option value="">Choose a file…</option>
              {writableFiles.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
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
              onChange={(e) => setNewStroke(e.target.value)}
            />
          </label>
          <label>
            Target file
            <select
              aria-label={`Re-chord target file for ${chord.stroke}`}
              value={targetFile}
              onChange={(e) => setTargetFile(e.target.value)}
            >
              <option value="">Choose a file…</option>
              {writableFiles.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
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
