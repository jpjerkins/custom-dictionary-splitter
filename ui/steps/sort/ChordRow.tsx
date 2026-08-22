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
  onResolve,
  saveError,
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
  onResolve?: (resolution: ResolutionChoice | null) => void;
  saveError?: string;
}) {
  const isConflict = kind === 'chord-taken' || kind === 'both';

  return (
    <td className={existing ? 'chord-cell chord-cell-existing' : 'chord-cell'}>
      <span className="chord-stroke">{stroke}</span>
      {existing && <span className="chord-hint">on disk</span>}
      {!existing && isConflict && chord && priority && protectedFiles && onResolve && (
        <ConflictResolver
          word={word}
          chord={chord}
          priority={priority}
          protectedFiles={protectedFiles}
          onChange={onResolve}
        />
      )}
      {!existing && saveError && (
        <p className="conflict-error" role="alert">
          Could not save: {saveError}
        </p>
      )}
    </td>
  );
}
