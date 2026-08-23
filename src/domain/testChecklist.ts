// Ported from public/js/testChecklist.js (kept there for the legacy
// frontend). Pure logic for the Step 6 "test moved entries" checklist.

// 'skipped' means untestable, not untested: some dictionary values cannot be
// produced by typing at all. A Plover formatting entry like '{^`}' emits a
// backtick when stroked, never its own literal text, so the row can never
// pass — and since Step 7 is gated on the whole checklist, one of them would
// block the run forever.
export type ChecklistStatus = 'pending' | 'pass' | 'fail' | 'skipped';

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

// Mark a row untestable. Not sticky: checkRow re-derives status from
// whatever is in the box, so typing into a skipped row tests it again.
export function skipRow(row: ChecklistRow): ChecklistRow {
  return { ...row, status: 'skipped' };
}

// Is the checklist done enough to move on? Passed rows have been verified;
// skipped rows have been judged unverifiable. Anything still pending or
// failing is outstanding.
export function isChecklistSettled(rows: ChecklistRow[]): boolean {
  return rows.every((row) => row.status === 'pass' || row.status === 'skipped');
}
