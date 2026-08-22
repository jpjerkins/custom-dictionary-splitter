import { state, showStep } from '../state.js';
import { diffDictionary } from '../diff.js';

export function initStep2() {
  const summaryEl = document.getElementById('diff-summary');
  const continueButton = document.getElementById('diff-continue-button');

  continueButton.addEventListener('click', () => showStep('sort'));

  document.getElementById('step-diff').addEventListener('wizard:enter', async () => {
    continueButton.disabled = true;
    summaryEl.textContent = 'Loading dictionaries...';
    try {
      const response = await fetch('/api/dictionaries');
      if (!response.ok) {
        const { error } = await response.json().catch(() => ({}));
        summaryEl.textContent = `Error: ${error || response.statusText}`;
        return;
      }
      const { files, index } = await response.json();
      state.dictionaryIndex = index;
      state.fileHashes = Object.fromEntries(Object.entries(files).map(([name, info]) => [name, info.hash]));
      state.diffResult = diffDictionary(state.downloadedDictionary, index);
      summaryEl.textContent =
        `${state.diffResult.new.length} new, ${state.diffResult.conflict.length} conflicts, ` +
        `${state.diffResult.unchanged.length} unchanged.`;
      continueButton.disabled = false;
    } catch (err) {
      summaryEl.textContent = `Error: ${err.message}`;
    }
  });
}
