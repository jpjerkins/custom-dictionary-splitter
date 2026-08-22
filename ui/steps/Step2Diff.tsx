import { useEffect, useState } from 'react';
import { diffDictionary } from '../diff.ts';
import type { DictionaryIndexEntry } from '../diff.ts';
import { useWizard } from '../state/WizardContext.tsx';

// Ported from public/js/steps/step2-diff.js. The original re-fetches on
// every `wizard:enter`; here that's every mount, which the step-switching
// shell provides by mounting only the active step.
export default function Step2Diff() {
  const { state, setState, goToStep } = useWizard();
  const [summary, setSummary] = useState('Loading dictionaries...');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setReady(false);
      setSummary('Loading dictionaries...');
      try {
        const response = await fetch('/api/dictionaries');
        if (!response.ok) {
          const { error } = await response.json().catch(() => ({}));
          if (!cancelled) setSummary(`Error: ${error || response.statusText}`);
          return;
        }
        const { files, index } = await response.json();
        if (cancelled) return;

        const fileHashes = Object.fromEntries(
          Object.entries(files as Record<string, { hash: string }>).map(([name, info]) => [name, info.hash]),
        );
        const diffResult = diffDictionary(
          state.downloadedDictionary as Record<string, string>,
          index as Record<string, DictionaryIndexEntry>,
        );
        setState((prev) => ({ ...prev, dictionaryIndex: index, fileHashes, diffResult }));
        setSummary(
          `${diffResult.new.length} new, ${diffResult.conflict.length} conflicts, ` +
            `${diffResult.unchanged.length} unchanged.`,
        );
        setReady(true);
      } catch (err) {
        if (!cancelled) setSummary(`Error: ${(err as Error).message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Runs once per mount, matching the original's per-`wizard:enter` fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>2. New &amp; Conflicting Entries</h2>
      <div data-testid="diff-summary">{summary}</div>
      <p>
        <button className="btn" type="button" disabled={!ready} onClick={() => goToStep('sort')}>
          Continue to sort
        </button>
      </p>
    </section>
  );
}
