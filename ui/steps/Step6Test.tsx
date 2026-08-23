import { useEffect, useState } from 'react';
import { buildTestChecklist, checkRow, skipRow, isChecklistSettled } from '../testChecklist.ts';
import type { ChecklistRow, MovedEntry } from '../testChecklist.ts';
import { useWizard } from '../state/WizardContext.tsx';

// Ported from public/js/steps/step6-test.js + public/js/testChecklist.js.
// Re-checking a device stroke against the moved entry's translation routes
// back to Sort on any failure, and only advances to Commit once every row
// passes.
export default function Step6Test() {
  const { state, setState, goToStep } = useWizard();
  const [checklist, setChecklist] = useState<ChecklistRow[]>(() => {
    const previous = new Map((state.checklist as ChecklistRow[]).map((row) => [row.stroke, row]));
    return (
      buildTestChecklist(state.movedEntries as MovedEntry[])
        .map((row) => previous.get(row.stroke) ?? row)
        // movedEntries arrives in whatever order the writes happened —
        // grouped by destination file, which reads as random when working
        // down a list of a hundred-plus rows. Sorted by word here rather
        // than in buildTestChecklist, which is a hand-synced mirror of
        // src/domain/testChecklist.ts: display order is this component's
        // business and changing both copies to agree on it would be one
        // more thing to keep in step. Stroke breaks ties, since two chords
        // can produce the same word.
        .sort((a, b) => a.expected.localeCompare(b.expected) || a.stroke.localeCompare(b.stroke))
    );
  });
  const [status, setStatus] = useState('');

  // Keep wizard state in sync so the checklist survives navigating away and back.
  useEffect(() => {
    setState((prev) => ({ ...prev, checklist }));
  }, [checklist, setState]);

  function updateRow(i: number, value: string) {
    setChecklist((prev) => {
      const next = prev.slice();
      next[i] = checkRow(next[i], value);
      return next;
    });
  }

  // Toggle: un-skipping re-runs the check against whatever is in the box,
  // rather than dropping the row back to pending and losing a result the
  // user already typed.
  function toggleSkip(i: number) {
    setChecklist((prev) => {
      const next = prev.slice();
      next[i] = next[i].status === 'skipped' ? checkRow(next[i], next[i].actual) : skipRow(next[i]);
      return next;
    });
  }

  function handleContinue() {
    if (!isChecklistSettled(checklist)) {
      const outstanding = checklist.filter((row) => row.status !== 'pass' && row.status !== 'skipped');
      setStatus(
        `${outstanding.length} ${outstanding.length === 1 ? 'entry is' : 'entries are'} still untested or failing.`
      );
      return;
    }
    goToStep('commit');
  }

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>6. Test Moved Entries</h2>
      <table className="entry-table" id="test-table">
        <thead>
          <tr>
            <th>Stroke</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Status</th>
            <th>Untestable</th>
          </tr>
        </thead>
        <tbody>
          {checklist.map((row, i) => (
            <tr key={row.stroke}>
              <td>{row.stroke}</td>
              <td>{row.expected}</td>
              <td>
                <input
                  value={row.actual}
                  aria-label={`Actual translation for ${row.stroke}`}
                  disabled={row.status === 'skipped'}
                  onChange={(e) => updateRow(i, e.target.value)}
                />
              </td>
              <td className={`status-${row.status}`}>{row.status}</td>
              <td>
                <button
                  type="button"
                  className="btn-icon"
                  aria-label={
                    row.status === 'skipped' ? `Test ${row.stroke} after all` : `Skip ${row.stroke} as untestable`
                  }
                  onClick={() => toggleSkip(i)}
                >
                  {row.status === 'skipped' ? 'Undo' : 'Skip'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <button className="btn btn-secondary" type="button" onClick={() => goToStep('sort')}>
          Go back to Sort
        </button>{' '}
        <button className="btn" type="button" onClick={handleContinue}>
          All entries pass, continue
        </button>
      </p>
      <p data-testid="test-status" className="text-muted">
        {status}
      </p>
    </section>
  );
}
