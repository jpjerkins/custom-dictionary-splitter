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

// Compares on trimmed values, but stores the raw text so the box keeps
// showing exactly what was typed.
//
// Trimming is not laxness. Steno inserts a space before a word, so stroking
// the entry under test types " cat" into the box and an exact comparison
// reported a correct stroke as a failure. Dictionary values can carry
// surrounding space too (2-phil-mro.json really does hold ' Chinmay').
// Neither is the difference this check exists to catch.
//
// Case is deliberately NOT folded: 'Nabal' and 'nabal' are different
// dictionary entries, and passing one for the other would defeat the test.
export function checkRow(row: ChecklistRow, actualValue: string): ChecklistRow {
  const actual = actualValue.trim();
  return {
    ...row,
    actual: actualValue,
    // An empty box is untested, not failed — otherwise clearing a row leaves
    // a red 'fail' behind that no longer describes anything.
    status: actual === '' ? 'pending' : actual === row.expected.trim() ? 'pass' : 'fail',
  };
}
