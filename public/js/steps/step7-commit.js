import { state } from '../state.js';

export function initStep7() {
  const commitButton = document.getElementById('commit-button');
  const statusEl = document.getElementById('commit-status');

  commitButton.addEventListener('click', async () => {
    statusEl.textContent = 'Committing...';
    const strokes = state.movedEntries.map((e) => e.stroke).join(', ');
    const message = `Add ${state.movedEntries.length} entries from Starboard: ${strokes}`;
    const response = await fetch('/api/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const result = await response.json();
    if (!result.committed) {
      statusEl.textContent = result.message || 'Nothing to commit.';
      return;
    }
    statusEl.textContent = result.pushed ? 'Committed and pushed.' : 'Committed locally. Push it yourself when ready.';
  });
}
