import { state, showStep } from '../state.js';

function buildRows() {
  const newRows = state.diffResult.new.map((e) => ({
    stroke: e.stroke,
    translation: e.translation,
    destinationFile: Object.keys(state.fileHashes)[0],
    conflict: false,
  }));
  const conflictRows = state.diffResult.conflict.map((e) => ({
    stroke: e.stroke,
    translation: e.keyboardTranslation,
    destinationFile: e.existingFile,
    conflict: true,
  }));
  return [...newRows, ...conflictRows];
}

function renderRows(tbody, rows) {
  tbody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');

    const strokeTd = document.createElement('td');
    strokeTd.textContent = row.stroke + (row.conflict ? ' (conflict)' : '');
    tr.appendChild(strokeTd);

    const translationTd = document.createElement('td');
    const translationInput = document.createElement('input');
    translationInput.value = row.translation;
    translationInput.addEventListener('input', () => {
      row.translation = translationInput.value;
    });
    translationTd.appendChild(translationInput);
    tr.appendChild(translationTd);

    const fileTd = document.createElement('td');
    const fileSelect = document.createElement('select');
    for (const fileName of Object.keys(state.fileHashes)) {
      const option = document.createElement('option');
      option.value = fileName;
      option.textContent = fileName;
      if (fileName === row.destinationFile) option.selected = true;
      fileSelect.appendChild(option);
    }
    fileSelect.addEventListener('change', () => {
      row.destinationFile = fileSelect.value;
    });
    fileTd.appendChild(fileSelect);
    tr.appendChild(fileTd);

    tbody.appendChild(tr);
  }
}

export function initStep3() {
  const tbody = document.querySelector('#sort-table tbody');
  const saveButton = document.getElementById('save-button');
  const statusEl = document.getElementById('save-status');
  let rows = [];

  document.getElementById('step-sort').addEventListener('wizard:enter', () => {
    rows = buildRows();
    renderRows(tbody, rows);
  });

  saveButton.addEventListener('click', async () => {
    const decisions = rows.map((row) => ({
      stroke: row.stroke,
      translation: row.translation,
      destinationFile: row.destinationFile,
      capturedHash: state.fileHashes[row.destinationFile],
    }));
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions }),
    });
    const { results } = await response.json();
    const failed = results.filter((r) => r.status === 'stale' || r.status === 'error');
    if (failed.length > 0) {
      statusEl.textContent = `${failed.length} entries failed: ${failed.map((f) => `${f.stroke} (${f.reason})`).join(', ')}`;
      return;
    }
    statusEl.textContent = `Saved ${results.length} entries.`;
    state.movedEntries = rows.map((row) => ({ stroke: row.stroke, translation: row.translation }));
    showStep('empty');
  });
}
