import { useState } from 'react';
import type { RetryRow } from './retry.ts';
import { useWizard } from '../../state/WizardContext.tsx';

interface Decision {
  stroke: string;
  translation?: string;
  destinationFile: string;
  capturedHash: string | undefined;
  remove?: boolean;
}

interface SaveResult {
  stroke: string;
  status: string;
  reason?: string;
}

// Ported from public/js/steps/step3-sort.js's retry-row rendering, Save,
// and dropRow. Step3Sort renders this instead of the classify-driven
// SortTable whenever a Step 6 test failure sent rows back here (see
// ui/steps/sort/retry.ts). Each row's destination file is fixed — the
// entry is already on disk there, so moving it would leave a duplicate
// behind — and its Drop button restores the prior translation instead of
// deleting when the row started life as a conflict (`wasConflict`), never
// destroying a pre-existing dictionary entry outright (commit 70deb4e).
//
// `rows` is copied into local state once on mount, same as SortTable's
// `groups` — the caller should remount (via `key`) rather than expect a
// changed prop to re-sync.
export default function RetryTable({ rows: initialRows }: { rows: RetryRow[] }) {
  const { state, setState, goToStep } = useWizard();
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialRows.map((r) => [r.stroke, r.translation]))
  );
  const [status, setStatus] = useState('');

  const fileHashes = (state.fileHashes as Record<string, string> | null) ?? {};

  async function postDecisions(decisions: Decision[]): Promise<SaveResult[] | null> {
    let response: Response;
    try {
      response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions }),
      });
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
      return null;
    }
    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}));
      setStatus(`Error: ${error || response.statusText}`);
      return null;
    }
    const { results } = await response.json();
    return results as SaveResult[];
  }

  async function refreshDictionaries() {
    try {
      const response = await fetch('/api/dictionaries');
      if (!response.ok) return;
      const { files, index } = await response.json();
      setState((prev) => ({
        ...prev,
        dictionaryIndex: index,
        fileHashes: Object.fromEntries(
          Object.entries(files as Record<string, { hash: string }>).map(([name, info]) => [name, info.hash])
        ),
      }));
    } catch {
      // Leave the previous hashes in place; the next save will report them as stale.
    }
  }

  function forgetRow(stroke: string) {
    setState((prev) => ({
      ...prev,
      movedEntries: (prev.movedEntries as { stroke: string }[]).filter((e) => e.stroke !== stroke),
      checklist: (prev.checklist as { stroke: string }[]).filter((r) => r.stroke !== stroke),
    }));
  }

  async function handleDrop(row: RetryRow) {
    // A row that started life as a conflict already had a translation in
    // the dictionary before this session touched it — dropping it must
    // restore that translation, not delete the stroke, or the
    // pre-existing entry is lost for good.
    const isRestore = row.wasConflict && row.existingTranslation !== undefined;
    setStatus(isRestore ? `Restoring ${row.stroke}...` : `Dropping ${row.stroke}...`);
    const decision: Decision = isRestore
      ? {
          stroke: row.stroke,
          translation: row.existingTranslation,
          destinationFile: row.destinationFile,
          capturedHash: fileHashes[row.destinationFile],
        }
      : {
          stroke: row.stroke,
          destinationFile: row.destinationFile,
          capturedHash: fileHashes[row.destinationFile],
          remove: true,
        };
    const results = await postDecisions([decision]);
    await refreshDictionaries();
    if (!results) return;

    const result = results[0];
    if (result.status === 'stale' || result.status === 'error') {
      setStatus(`Could not ${isRestore ? 'restore' : 'drop'} ${row.stroke}: ${result.reason}`);
      return;
    }

    forgetRow(row.stroke);
    setRows((prev) => prev.filter((r) => r.stroke !== row.stroke));
    setStatus(isRestore ? `Restored ${row.stroke} to its prior value.` : `Dropped ${row.stroke}.`);
  }

  async function handleSave() {
    if (rows.length === 0) {
      goToStep('empty');
      return;
    }
    setStatus('Saving...');
    const decisions: Decision[] = rows.map((row) => ({
      stroke: row.stroke,
      translation: drafts[row.stroke] ?? row.translation,
      destinationFile: row.destinationFile,
      capturedHash: fileHashes[row.destinationFile],
    }));
    const results = await postDecisions(decisions);
    await refreshDictionaries();
    if (!results) return;

    const succeeded: RetryRow[] = [];
    const failed: RetryRow[] = [];
    const failures: SaveResult[] = [];
    results.forEach((result, i) => {
      const row = rows[i];
      if (result.status === 'stale' || result.status === 'error') {
        failed.push(row);
        failures.push(result);
      } else {
        succeeded.push(row);
      }
    });

    setState((prev) => ({
      ...prev,
      movedEntries: (prev.movedEntries as { stroke: string; translation: string }[]).map((e) =>
        succeeded.some((r) => r.stroke === e.stroke) ? { ...e, translation: drafts[e.stroke] ?? e.translation } : e
      ),
      checklist: (prev.checklist as { stroke: string }[]).filter(
        (r) => !succeeded.some((row) => row.stroke === r.stroke)
      ),
    }));

    setRows(failed);

    if (failures.length > 0) {
      setStatus(`${failures.length} entries failed: ${failures.map((f) => `${f.stroke} (${f.reason})`).join(', ')}`);
      return;
    }

    setStatus(`Saved ${succeeded.length} entries.`);
    goToStep('empty');
  }

  return (
    <div className="sort-step">
      <p className="device-banner" role="status">
        Retrying {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} that failed testing. Each is already on disk in
        its listed file, so the destination is fixed.
      </p>
      <div className="sort-table-scroll">
        <table className="entry-table sort-table">
          <thead>
            <tr>
              <th scope="col">Stroke</th>
              <th scope="col">Translation</th>
              <th scope="col">File</th>
              <th scope="col">Drop</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.stroke} className="conflict-row">
                <td>{row.stroke}</td>
                <td>
                  <input
                    aria-label={`Translation for ${row.stroke}`}
                    value={drafts[row.stroke] ?? row.translation}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [row.stroke]: e.target.value }))}
                  />
                </td>
                <td>
                  <select aria-label={`Destination for ${row.stroke}`} value={row.destinationFile} disabled>
                    <option value={row.destinationFile}>{row.destinationFile}</option>
                  </select>
                </td>
                <td>
                  <button type="button" className="btn btn-secondary" onClick={() => handleDrop(row)}>
                    {row.wasConflict && row.existingTranslation !== undefined ? 'Restore prior value' : 'Drop'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sort-table-actions">
        <button type="button" className="btn" onClick={handleSave}>
          Save
        </button>
      </div>
      <p data-testid="sort-save-status" role="status" className="text-muted">
        {status}
      </p>
    </div>
  );
}
