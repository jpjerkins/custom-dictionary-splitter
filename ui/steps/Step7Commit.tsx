import { useState } from 'react';
import { useWizard } from '../state/WizardContext.tsx';

interface MovedEntry {
  stroke: string;
  translation: string;
}

interface CommitResult {
  committed: boolean;
  message?: string;
  pushed?: boolean;
  pushError?: string;
}

// Ported from public/js/steps/step7-commit.js. Must surface a push failure
// as an error rather than reporting success.
export default function Step7Commit() {
  const { state } = useWizard();
  const [status, setStatus] = useState('');

  async function handleCommit() {
    setStatus('Committing...');
    const movedEntries = state.movedEntries as MovedEntry[];
    const strokes = movedEntries.map((e) => e.stroke).join(', ');
    const message = `Add ${movedEntries.length} entries from Starboard: ${strokes}`;

    let response: Response;
    try {
      response = await fetch('/api/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, files: state.touchedFiles }),
      });
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
      return;
    }

    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}));
      setStatus(`Error: ${error || response.statusText}`);
      return;
    }

    const result: CommitResult = await response.json();
    if (!result.committed) {
      setStatus(result.message || 'Nothing to commit.');
      return;
    }
    if (result.pushError) {
      setStatus(`Committed locally, but push failed: ${result.pushError}`);
      return;
    }
    setStatus(result.pushed ? 'Committed and pushed.' : 'Committed locally. Push it yourself when ready.');
  }

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>7. Commit &amp; Push</h2>
      <p>
        <button className="btn" type="button" onClick={handleCommit}>
          Commit &amp; push
        </button>
      </p>
      <p data-testid="commit-status" className="text-muted">
        {status}
      </p>
    </section>
  );
}
