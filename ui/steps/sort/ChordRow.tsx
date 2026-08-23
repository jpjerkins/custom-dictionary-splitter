import { useState } from 'react';
import ConflictResolver from './ConflictResolver.tsx';
import type { CaseKind, NewChord } from './types.ts';
import type { ResolutionChoice } from '../../resolutions.ts';

// One chord's own cells (stroke + a hint about its origin, or — for a live
// conflict — the full ConflictResolver). Rendered inside a <tr> owned by
// WordGroupRow, which also attaches the row-spanning word, radio, and
// delete cells to whichever ChordRow happens to be first.
export default function ChordRow({
  word,
  stroke,
  existing,
  kind,
  diskWord,
  diskFile,
  chord,
  priority,
  protectedFiles,
  destinationFile,
  onResolve,
  onUserResolve,
  saveError,
  editConflict,
  onEditStrokeDraft,
  onCommitStroke,
}: {
  word: string;
  stroke: string;
  existing: boolean;
  kind?: CaseKind;
  diskWord?: string;
  diskFile?: string;
  chord?: NewChord;
  priority?: string[];
  protectedFiles?: string[];
  // The word's radio pick, forwarded to ConflictResolver as the override /
  // re-chord target — that box no longer has a file picker of its own.
  destinationFile?: string | null;
  onResolve?: (resolution: ResolutionChoice | null) => void;
  // See ConflictResolver's onUserChoice: the intent signal, as opposed to
  // onResolve's data signal which also fires on mount.
  onUserResolve?: () => void;
  saveError?: string;
  editConflict?: string;
  onEditStrokeDraft?: (candidate: string) => void;
  onCommitStroke?: (candidate: string) => void;
}) {
  const isConflict = kind === 'chord-taken' || kind === 'both';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stroke);

  // Editing is offered for plain new/word-exists chords only — a live
  // conflict already has its own way to pick a different stroke via the
  // re-chord resolution above, and layering a second stroke editor on top
  // of that would just be two controls fighting over the same value.
  const editable = !existing && !isConflict && onCommitStroke;

  function startEditing() {
    setDraft(stroke);
    setEditing(true);
  }

  function commit() {
    onCommitStroke?.(draft);
    setEditing(false);
  }

  return (
    <td className={existing ? 'chord-cell chord-cell-existing' : 'chord-cell'}>
      {editing ? (
        <input
          type="text"
          className="chord-edit-input"
          aria-label={`Edit stroke for ${word}`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onEditStrokeDraft?.(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
      ) : (
        <span className="chord-stroke">{stroke}</span>
      )}
      {existing && <span className="chord-hint">on disk</span>}
      {editable && !editing && (
        <button type="button" className="chord-edit-toggle" aria-label={`Edit stroke ${stroke}`} onClick={startEditing}>
          &#9998;
        </button>
      )}
      {!existing && isConflict && chord && priority && protectedFiles && onResolve && (
        <ConflictResolver
          word={word}
          chord={chord}
          priority={priority}
          protectedFiles={protectedFiles}
          destinationFile={destinationFile ?? null}
          onChange={onResolve}
          onUserChoice={onUserResolve}
        />
      )}
      {!existing && editConflict && (
        <p className="conflict-error" role="alert">
          That stroke is already used for "{editConflict}" in this batch.
        </p>
      )}
      {!existing && saveError && (
        <p className="conflict-error" role="alert">
          Could not save: {saveError}
        </p>
      )}
    </td>
  );
}
