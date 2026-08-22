import { state, showStep } from '../state.js';
import { buildTestChecklist, checkRow } from '../testChecklist.js';

function renderChecklist(tbody, checklist, onUpdate) {
  tbody.innerHTML = '';
  checklist.forEach((row, i) => {
    const tr = document.createElement('tr');

    const strokeTd = document.createElement('td');
    strokeTd.textContent = row.stroke;
    tr.appendChild(strokeTd);

    const expectedTd = document.createElement('td');
    expectedTd.textContent = row.expected;
    tr.appendChild(expectedTd);

    const actualTd = document.createElement('td');
    const actualInput = document.createElement('input');
    actualInput.value = row.actual;
    actualInput.addEventListener('input', () => onUpdate(i, actualInput.value));
    actualTd.appendChild(actualInput);
    tr.appendChild(actualTd);

    const statusTd = document.createElement('td');
    statusTd.textContent = row.status;
    statusTd.className = `status-${row.status}`;
    tr.appendChild(statusTd);

    tbody.appendChild(tr);
  });
}

export function initStep6() {
  const tbody = document.querySelector('#test-table tbody');
  const retryButton = document.getElementById('test-retry-button');
  const continueButton = document.getElementById('test-continue-button');
  const statusEl = document.getElementById('test-status');

  function update(i, value) {
    state.checklist[i] = checkRow(state.checklist[i], value);
    renderChecklist(tbody, state.checklist, update);
  }

  document.getElementById('step-test').addEventListener('wizard:enter', () => {
    state.checklist = buildTestChecklist(state.movedEntries);
    renderChecklist(tbody, state.checklist, update);
  });

  retryButton.addEventListener('click', () => showStep('sort'));

  continueButton.addEventListener('click', () => {
    const allPass = state.checklist.every((row) => row.status === 'pass');
    if (!allPass) {
      statusEl.textContent = 'Not all entries pass yet.';
      return;
    }
    showStep('commit');
  });
}
