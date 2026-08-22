// Browser-side duplicate of src/domain/testChecklist.ts. ui/ talks to the
// backend over HTTP only and must not import server code into the bundle
// (see .superpowers/sdd/2026-08-22-typescript-overrides-react task 18/19
// briefs), so this pure logic is kept in sync by hand rather than shared.

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
