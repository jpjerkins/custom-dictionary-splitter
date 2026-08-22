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
    keyboardTranslation: e.keyboardTranslation,
    existingTranslation: e.existingTranslation,
    destinationFile: e.existingFile,
    conflict: true,
  }));
  return [...newRows, ...conflictRows];
}

function renderRows(tbody, rows) {
  tbody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.conflict) tr.classList.add('conflict-row');

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

    if (row.conflict) {
      const keyboardButton = document.createElement('button');
      keyboardButton.type = 'button';
      keyboardButton.textContent = 'Use keyboard value';
      keyboardButton.addEventListener('click', () => {
        row.translation = row.keyboardTranslation;
        translationInput.value = row.keyboardTranslation;
      });
      translationTd.appendChild(keyboardButton);

      const existingButton = document.createElement('button');
      existingButton.type = 'button';
      existingButton.textContent = 'Use existing value';
      existingButton.addEventListener('click', () => {
        row.translation = row.existingTranslation;
        translationInput.value = row.existingTranslation;
      });
      translationTd.appendChild(existingButton);
    }

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

    const succeededRows = [];
    const failedRows = [];
    const failures = [];
    results.forEach((result, i) => {
      const row = rows[i];
      if (result.status === 'stale' || result.status === 'error') {
        failedRows.push(row);
        failures.push(result);
      } else {
        succeededRows.push(row);
      }
    });

    if (succeededRows.length > 0) {
      state.movedEntries = [
        ...state.movedEntries,
        ...succeededRows.map((row) => ({ stroke: row.stroke, translation: row.translation })),
      ];
    }

    const dictResponse = await fetch('/api/dictionaries');
    const { files, index } = await dictResponse.json();
    state.dictionaryIndex = index;
    state.fileHashes = Object.fromEntries(Object.entries(files).map(([name, info]) => [name, info.hash]));

    rows = failedRows;
    renderRows(tbody, rows);

    if (failures.length > 0) {
      statusEl.textContent = `${failures.length} entries failed: ${failures.map((f) => `${f.stroke} (${f.reason})`).join(', ')}`;
      return;
    }

    statusEl.textContent = `Saved ${succeededRows.length} entries.`;
    showStep('empty');
  });
}
