import { useEffect, useState } from 'react';
import { buildTestChecklist, checkRow } from '../testChecklist.ts';
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
    return buildTestChecklist(state.movedEntries as MovedEntry[]).map((row) => previous.get(row.stroke) ?? row);
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

  function handleContinue() {
    const allPass = checklist.every((row) => row.status === 'pass');
    if (!allPass) {
      setStatus('Not all entries pass yet.');
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
                  onChange={(e) => updateRow(i, e.target.value)}
                />
              </td>
              <td className={`status-${row.status}`}>{row.status}</td>
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
