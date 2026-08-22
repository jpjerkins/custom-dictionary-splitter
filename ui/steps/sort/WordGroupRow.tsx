import ChordRow from './ChordRow.tsx';
import type { WordGroup } from './types.ts';

// Renders one word as N stacked <tr>s (existing on-disk chords first,
// greyed, then the incoming chords from the keyboard). The word, the radio
// column, and the delete button are all cells with rowSpan attached only to
// the first <tr> — that's what makes them shared by every chord in the
// group rather than repeated per row. The radios all carry
// name={group.word}, so within one word only one destination file can be
// selected at a time, and there is exactly one delete button for the
// whole word, per the user's explicit request.
export default function WordGroupRow({
  group,
  priority,
  protectedFiles,
}: {
  group: WordGroup;
  priority: string[];
  protectedFiles: string[];
}) {
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
    })),
  ];
  const rowCount = rows.length;

  return (
    <>
      {rows.map((row, i) => (
        <tr key={row.key} className={row.existing ? 'word-group-row word-group-row-existing' : 'word-group-row'}>
          <ChordRow
            stroke={row.stroke}
            existing={row.existing}
            kind={row.existing ? undefined : row.kind}
            diskWord={row.existing ? undefined : row.diskWord}
            diskFile={row.existing ? undefined : row.diskFile}
          />
          {i === 0 && (
            <>
              <td className="word-cell" rowSpan={rowCount}>
                {group.word}
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
                      defaultChecked={!isProtected && group.destinationFile === file}
                    />
                  </td>
                );
              })}
              <td className="delete-cell" rowSpan={rowCount}>
                <button type="button" className="btn-icon" aria-label={`Delete ${group.word}`}>
                  &#x2715;
                </button>
              </td>
            </>
          )}
        </tr>
      ))}
    </>
  );
}
