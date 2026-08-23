import { useEffect, useState } from 'react';
import SortTable from './sort/SortTable.tsx';
import RetryTable from './sort/RetryTable.tsx';
import { buildRetryRows } from './sort/retry.ts';
import type { RetryRow, MovedEntry } from './sort/retry.ts';
import type { WordGroup } from './sort/types.ts';
import type { ChecklistRow } from '../testChecklist.ts';
import { useWizard } from '../state/WizardContext.tsx';

interface ClassifyData {
  groups: WordGroup[];
  priority: string[];
  protectedFiles: string[];
  deviceOrderMismatch?: boolean;
  deviceMissingFiles?: string[];
}

// The wrapper referenced in SortTable.tsx's header comment ("rather than in
// a separate Step3Sort wrapper, which doesn't exist yet") — it didn't exist
// until this task wired the wizard shell together.
//
// A failed Step 6 test routes back here with `checklist` still holding the
// failed rows (ported from public/js/steps/step3-sort.js's wizard:enter
// handler, which always preferred outstanding retries over a fresh
// classify). Snapshotted once on mount — like SortTable's `groups` and
// Step2Diff/Step6Test's fetch effects — so this component doesn't flip
// between retry and classify mode mid-session as the retry rows resolve.
export default function Step3Sort() {
  const { state } = useWizard();
  const [mode] = useState<{ kind: 'retry'; rows: RetryRow[] } | { kind: 'classify' }>(() => {
    const failedChecklistRows = (state.checklist as ChecklistRow[]).filter((row) => row.status === 'fail');
    if (failedChecklistRows.length === 0) return { kind: 'classify' };
    return { kind: 'retry', rows: buildRetryRows(failedChecklistRows, state.movedEntries as MovedEntry[]) };
  });

  // panel-fill: this step's table has to claim the leftover viewport height
  // rather than grow the page (see WizardShell's comment).
  return (
    <section className="panel panel-fill">
      <h2 className="step-title">3. Sort New &amp; Conflicting Entries</h2>
      {mode.kind === 'retry' ? <RetryTable rows={mode.rows} /> : <ClassifySort />}
    </section>
  );
}

// Fetches priority + protectedFiles from GET /api/dictionaries and the
// classified groups from POST /api/classify, then hands them to SortTable.
// Keyed on a fetch counter (`version`) so a fresh classify remounts
// SortTable rather than leaving it holding stale groups — SortTable copies
// its `groups` prop into local state exactly once, on mount.
function ClassifySort() {
  const { state } = useWizard();
  const [status, setStatus] = useState('Loading...');
  const [data, setData] = useState<ClassifyData | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setData(null);
      setStatus('Classifying...');
      try {
        const [dictResponse, classifyResponse] = await Promise.all([
          fetch('/api/dictionaries'),
          fetch('/api/classify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              downloaded: state.downloadedDictionary,
              deviceOrder: state.deviceOrder ?? undefined,
            }),
          }),
        ]);

        const failed = !dictResponse.ok ? dictResponse : !classifyResponse.ok ? classifyResponse : null;
        if (failed) {
          const { error } = await failed.json().catch(() => ({}));
          if (!cancelled) setStatus(`Error: ${error || failed.statusText}`);
          return;
        }

        const { priority, protectedFiles } = await dictResponse.json();
        const { groups, deviceOrderMismatch, deviceMissingFiles } = await classifyResponse.json();
        if (cancelled) return;

        setData({ groups, priority, protectedFiles, deviceOrderMismatch, deviceMissingFiles });
        setVersion((v) => v + 1);
        setStatus('');
      } catch (err) {
        if (!cancelled) setStatus(`Error: ${(err as Error).message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Runs once per mount; the step-switching shell mounts only the active step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) {
    return (
      <p data-testid="sort-status" className="text-muted">
        {status}
      </p>
    );
  }

  return (
    <SortTable
      key={version}
      groups={data.groups}
      priority={data.priority}
      protectedFiles={data.protectedFiles}
      deviceOrderMismatch={data.deviceOrderMismatch}
      deviceMissingFiles={data.deviceMissingFiles}
    />
  );
}
