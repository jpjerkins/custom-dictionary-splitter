import { state, showStep } from '../state.js';

function buildRows() {
  const newRows = state.diffResult.new.map((e) => ({
    stroke: e.stroke,
    translation: e.translation,
    destinationFile: Object.keys(state.fileHashes)[0],
    conflict: false,
    retry: false,
  }));
  const conflictRows = state.diffResult.conflict.map((e) => ({
    stroke: e.stroke,
    translation: e.keyboardTranslation,
    keyboardTranslation: e.keyboardTranslation,
    existingTranslation: e.existingTranslation,
    destinationFile: e.existingFile,
    conflict: true,
    retry: false,
  }));
  return [...newRows, ...conflictRows];
}

function buildRetryRows(failedChecklistRows) {
  return failedChecklistRows.map((row) => {
    const moved = state.movedEntries.find((e) => e.stroke === row.stroke);
    return {
      stroke: row.stroke,
      translation: row.expected,
      destinationFile: moved ? moved.destinationFile : Object.keys(state.fileHashes)[0],
      conflict: false,
      retry: true,
    };
  });
}

function upsertMovedEntry(entry) {
  const i = state.movedEntries.findIndex((e) => e.stroke === entry.stroke);
  if (i === -1) state.movedEntries.push(entry);
  else state.movedEntries[i] = entry;
}

function markTouched(fileName) {
  if (!state.touchedFiles.includes(fileName)) state.touchedFiles.push(fileName);
}

function renderRows(tbody, rows, onDrop) {
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
    // A retried entry is already on disk in this file; moving it here would leave a duplicate behind.
    fileSelect.disabled = row.retry;
    fileSelect.addEventListener('change', () => {
      row.destinationFile = fileSelect.value;
    });
    fileTd.appendChild(fileSelect);
    tr.appendChild(fileTd);

    if (row.retry) {
      const dropTd = document.createElement('td');
      const dropButton = document.createElement('button');
      dropButton.type = 'button';
      dropButton.textContent = 'Drop';
      dropButton.addEventListener('click', () => onDrop(row));
      dropTd.appendChild(dropButton);
      tr.appendChild(dropTd);
    }

    tbody.appendChild(tr);
  }
}

export function initStep3() {
  const tbody = document.querySelector('#sort-table tbody');
  const saveButton = document.getElementById('save-button');
  const statusEl = document.getElementById('save-status');
  let rows = [];

  async function refreshDictionaries() {
    try {
      const response = await fetch('/api/dictionaries');
      if (!response.ok) return;
      const { files, index } = await response.json();
      state.dictionaryIndex = index;
      state.fileHashes = Object.fromEntries(Object.entries(files).map(([name, info]) => [name, info.hash]));
    } catch {
      // Leave the previous hashes in place; the next save will report them as stale.
    }
  }

  async function postDecisions(decisions) {
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions }),
    });
    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}));
      statusEl.textContent = `Error: ${error || response.statusText}`;
      return null;
    }
    const { results } = await response.json();
    return results;
  }

  async function dropRow(row) {
    statusEl.textContent = `Dropping ${row.stroke}...`;
    const results = await postDecisions([
      {
        stroke: row.stroke,
        destinationFile: row.destinationFile,
        capturedHash: state.fileHashes[row.destinationFile],
        remove: true,
      },
    ]);
    await refreshDictionaries();
    if (!results) return;

    const result = results[0];
    if (result.status !== 'removed') {
      statusEl.textContent = `Could not drop ${row.stroke}: ${result.reason}`;
      return;
    }

    markTouched(row.destinationFile);
    state.movedEntries = state.movedEntries.filter((e) => e.stroke !== row.stroke);
    state.checklist = state.checklist.filter((r) => r.stroke !== row.stroke);
    rows = rows.filter((r) => r !== row);
    renderRows(tbody, rows, dropRow);
    statusEl.textContent = `Dropped ${row.stroke}.`;
  }

  document.getElementById('step-sort').addEventListener('wizard:enter', () => {
    const failed = state.checklist.filter((row) => row.status === 'fail');
    rows = failed.length > 0 ? buildRetryRows(failed) : buildRows();
    renderRows(tbody, rows, dropRow);
    statusEl.textContent = '';
  });

  saveButton.addEventListener('click', async () => {
    if (rows.length === 0) {
      showStep('empty');
      return;
    }

    statusEl.textContent = 'Saving...';
    const decisions = rows.map((row) => ({
      stroke: row.stroke,
      translation: row.translation,
      destinationFile: row.destinationFile,
      capturedHash: state.fileHashes[row.destinationFile],
    }));
    const results = await postDecisions(decisions);
    await refreshDictionaries();
    if (!results) return;

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

    for (const row of succeededRows) {
      upsertMovedEntry({
        stroke: row.stroke,
        translation: row.translation,
        destinationFile: row.destinationFile,
      });
      markTouched(row.destinationFile);
      state.checklist = state.checklist.filter((r) => r.stroke !== row.stroke);
    }

    rows = failedRows;
    renderRows(tbody, rows, dropRow);

    if (failures.length > 0) {
      statusEl.textContent = `${failures.length} entries failed: ${failures.map((f) => `${f.stroke} (${f.reason})`).join(', ')}`;
      return;
    }

    statusEl.textContent = `Saved ${succeededRows.length} entries.`;
    showStep('empty');
  });
}
