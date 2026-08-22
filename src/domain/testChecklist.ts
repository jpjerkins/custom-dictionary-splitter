// Ported from public/js/testChecklist.js (kept there for the legacy
// frontend). Pure logic for the Step 6 "test moved entries" checklist.

export type ChecklistStatus = 'pending' | 'pass' | 'fail';

export interface MovedEntry {
  stroke: string;
  translation: string;
}

export interface ChecklistRow {
  stroke: string;
  expected: string;
  actual: string;
  status: ChecklistStatus;
}

export function buildTestChecklist(movedEntries: MovedEntry[]): ChecklistRow[] {
  return movedEntries.map(({ stroke, translation }) => ({
    stroke,
    expected: translation,
    actual: '',
    status: 'pending',
  }));
}

export function checkRow(row: ChecklistRow, actualValue: string): ChecklistRow {
  return {
    ...row,
    actual: actualValue,
    status: actualValue === row.expected ? 'pass' : 'fail',
  };
}
