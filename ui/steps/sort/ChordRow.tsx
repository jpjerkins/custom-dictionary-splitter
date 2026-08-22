import type { CaseKind } from './types.ts';

// One chord's own cells (stroke + a hint about its origin). Rendered inside
// a <tr> owned by WordGroupRow, which also attaches the row-spanning word,
// radio, and delete cells to whichever ChordRow happens to be first.
export default function ChordRow({
  stroke,
  existing,
  kind,
  diskWord,
  diskFile,
}: {
  stroke: string;
  existing: boolean;
  kind?: CaseKind;
  diskWord?: string;
  diskFile?: string;
}) {
  const isConflict = kind === 'chord-taken' || kind === 'both';

  return (
    <td className={existing ? 'chord-cell chord-cell-existing' : 'chord-cell'}>
      <span className="chord-stroke">{stroke}</span>
      {existing && <span className="chord-hint">on disk</span>}
      {!existing && isConflict && (
        <span className="chord-hint chord-hint-conflict">
          conflicts with {diskWord ?? '?'} in {diskFile ?? '?'}
        </span>
      )}
    </td>
  );
}
