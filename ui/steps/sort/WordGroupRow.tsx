import { useState } from 'react';
import ChordRow from './ChordRow.tsx';
import type { WordGroup } from './types.ts';
import type { ResolutionChoice } from '../../resolutions.ts';

// Renders one word as N stacked <tr>s (existing on-disk chords first,
// greyed, then the incoming chords from the keyboard). The word, the radio
// column, and the delete button are all cells with rowSpan attached only to
// the first <tr> — that's what makes them shared by every chord in the
// group rather than repeated per row. The radios all carry
// name={group.word}, so within one word only one destination file can be
// selected at a time, and there is exactly one delete button for the
// whole word, per the user's explicit request.
//
// Radio selection is controlled (checked/onChange), not defaultChecked, so
// picking a destination for a word is recorded by the caller (SortTable)
// rather than silently living only in the DOM.
export default function WordGroupRow({
  group,
  priority,
  protectedFiles,
  status,
  onResolveChord,
  onUserAction,
  onSelectDestination,
  onDeleteWord,
  onEditStrokeDraft,
  onCommitStroke,
  invariantWarning,
  priorityWarning,
}: {
  group: WordGroup;
  priority: string[];
  protectedFiles: string[];
  // 'decided' (green) once the user has acted on this word, 'suggested'
  // (yellow) while it still sits on a filing the app chose, null otherwise.
  // Computed by SortTable, which owns both sets.
  status: 'decided' | 'suggested' | null;
  onResolveChord: (word: string, stroke: string, resolution: ResolutionChoice | null) => void;
  // "The user did something to this word" — the intent signal behind the
  // green tint, deliberately separate from the data callbacks. Needed
  // because neither data path reports a confirmation: onResolveChord also
  // fires from ConflictResolver's mount effect (a suggestion, not a
  // decision), and a radio's onChange does not fire at all when the user
  // clicks the option that is already checked.
  onUserAction: (word: string) => void;
  onSelectDestination: (word: string, file: string) => void;
  onDeleteWord: (word: string) => void;
  onEditStrokeDraft: (word: string, originalStroke: string, candidate: string) => void;
  onCommitStroke: (word: string, originalStroke: string, candidate: string) => void;
  // Computed fresh every render from the CURRENT groups (destinationFile,
  // resolutions) rather than read off `group` itself — see SortTable's
  // computeGroupWarnings. The backend always ships these as null (they only
  // arise once the UI mutates a preset after the initial classify).
  invariantWarning: string | null;
  priorityWarning: string | null;
}) {
  // Plain click-to-delete risks losing a whole word's pending chords by
  // accident; a native `confirm()` dialog is jarring and untestable the same
  // way the rest of this UI is, so confirmation lives inline: first click
  // swaps the button for Confirm?/Cancel, second click (Confirm?) deletes.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const rows = [
    ...group.existingChords.map((chord) => ({
      key: `existing:${chord.stroke}`,
      stroke: chord.stroke,
      existing: true as const,
    })),
    ...group.newChords.map((chord) => ({
      key: `new:${chord.stroke}`,
      stroke: chord.stroke,
      existing: false as const,
      kind: chord.kind,
      diskWord: chord.diskWord,
      diskFile: chord.diskFile,
      chord,
    })),
  ];
  const rowCount = rows.length;
  const warnings = [invariantWarning, priorityWarning].filter((w): w is string => w !== null);

  // The status tint goes on EVERY <tr> of the group, not just the first, so
  // a multi-chord word reads as one coloured block rather than a tinted
  // header row above untinted ones.
  const statusClass = status === null ? '' : ` word-group-row-${status}`;

  return (
    <>
      {rows.map((row, i) => (
        <tr
          key={row.key}
          className={
            (row.existing ? 'word-group-row word-group-row-existing' : 'word-group-row') + statusClass
          }
        >
          <ChordRow
            word={group.word}
            stroke={row.stroke}
            existing={row.existing}
            kind={row.existing ? undefined : row.kind}
            diskWord={row.existing ? undefined : row.diskWord}
            diskFile={row.existing ? undefined : row.diskFile}
            chord={row.existing ? undefined : row.chord}
            priority={row.existing ? undefined : priority}
            protectedFiles={row.existing ? undefined : protectedFiles}
            destinationFile={row.existing ? undefined : group.destinationFile}
            onResolve={row.existing ? undefined : (resolution) => onResolveChord(group.word, row.stroke, resolution)}
            onUserResolve={row.existing ? undefined : () => onUserAction(group.word)}
            saveError={row.existing ? undefined : row.chord?.saveError}
            editConflict={row.existing ? undefined : row.chord?.editConflict}
            onEditStrokeDraft={
              row.existing ? undefined : (candidate) => onEditStrokeDraft(group.word, row.stroke, candidate)
            }
            onCommitStroke={
              row.existing ? undefined : (candidate) => onCommitStroke(group.word, row.stroke, candidate)
            }
          />
          {i === 0 && (
            <>
              <td className="word-cell" rowSpan={rowCount}>
                {group.word}
                {warnings.map((warning) => (
                  <p key={warning} className="word-warning" role="status">
                    {warning}
                  </p>
                ))}
              </td>
              {priority.map((file) => {
                const isProtected = protectedFiles.includes(file);
                return (
                  <td
                    key={file}
                    className={isProtected ? 'radio-cell radio-cell-protected' : 'radio-cell'}
                    rowSpan={rowCount}
                  >
                    <input
                      type="radio"
                      name={group.word}
                      aria-label={file}
                      value={file}
                      disabled={isProtected}
                      checked={!isProtected && group.destinationFile === file}
                      onChange={() => onSelectDestination(group.word, file)}
                      // onClick, not onChange: clicking the radio that is
                      // already checked fires no change event, so confirming
                      // the app's suggestion would otherwise be invisible.
                      // Fires alongside onChange on a genuine change too;
                      // marking a word decided twice is a no-op.
                      onClick={() => onUserAction(group.word)}
                    />
                  </td>
                );
              })}
              <td className="delete-cell" rowSpan={rowCount}>
                {confirmingDelete ? (
                  <>
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label={`Confirm delete ${group.word}`}
                      onClick={() => onDeleteWord(group.word)}
                    >
                      Confirm?
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label={`Cancel delete ${group.word}`}
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`Delete ${group.word}`}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    &#x2715;
                  </button>
                )}
              </td>
            </>
          )}
        </tr>
      ))}
    </>
  );
}
