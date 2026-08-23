import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestChecklist, checkRow, skipRow, isChecklistSettled } from '../src/domain/testChecklist.ts';

test('buildTestChecklist creates a pending row per moved entry', () => {
  const checklist = buildTestChecklist([{ stroke: 'KAT', translation: 'cat' }]);
  assert.deepEqual(checklist, [{ stroke: 'KAT', expected: 'cat', actual: '', status: 'pending' }]);
});

test('checkRow marks pass when actual matches expected, fail otherwise', () => {
  const row = { stroke: 'KAT', expected: 'cat', actual: '', status: 'pending' as const };
  assert.equal(checkRow(row, 'cat').status, 'pass');
  assert.equal(checkRow(row, 'dog').status, 'fail');
});

// Steno output carries a leading space before a word, so stroking the entry
// under test types " cat" into the box and an exact comparison called that a
// failure. Dictionary values can carry one too — 2-phil-mro.json really does
// hold ' Chinmay'. Surrounding whitespace is never the difference being
// tested for here, on either side.
test('checkRow ignores surrounding whitespace on both sides', () => {
  const row = { stroke: 'KAT', expected: 'cat', actual: '', status: 'pending' as const };
  assert.equal(checkRow(row, ' cat').status, 'pass');
  assert.equal(checkRow(row, 'cat ').status, 'pass');

  const padded = { stroke: 'KAT', expected: ' cat', actual: '', status: 'pending' as const };
  assert.equal(checkRow(padded, 'cat').status, 'pass');
});

// Case is NOT folded: 'Nabal' and 'nabal' are genuinely different entries,
// and treating them as equal would pass a test that should fail.
test('checkRow still fails on a case difference', () => {
  const row = { stroke: 'TPHA/PWAL', expected: 'Nabal', actual: '', status: 'pending' as const };
  assert.equal(checkRow(row, 'nabal').status, 'fail');
});

// An empty box is untested, not failed — clearing a row must not leave a red
// 'fail' behind, and a fresh checklist reads as pending throughout.
test('checkRow returns to pending when the box is emptied', () => {
  const row = { stroke: 'KAT', expected: 'cat', actual: 'dog', status: 'fail' as const };
  assert.equal(checkRow(row, '').status, 'pending');
  assert.equal(checkRow(row, '   ').status, 'pending');
});

// The raw text is preserved for display even though the comparison is
// trimmed, so the box shows exactly what was typed.
test('checkRow keeps the untrimmed text for display', () => {
  const row = { stroke: 'KAT', expected: 'cat', actual: '', status: 'pending' as const };
  assert.equal(checkRow(row, ' cat').actual, ' cat');
});

// Some entries cannot be tested by typing at all. Phil's dictionaries hold
// Plover formatting entries like '{^`}' — stroking one emits a backtick,
// never the literal text, so the row could never pass and would block
// Step 7 forever.
test('skipRow marks a row untestable', () => {
  const row = { stroke: 'TR-RL', expected: '{^`}', actual: '', status: 'pending' as const };
  assert.equal(skipRow(row).status, 'skipped');
});

test('typing into a skipped row re-tests it', () => {
  const skipped = skipRow({ stroke: 'KAT', expected: 'cat', actual: '', status: 'pending' as const });
  assert.equal(checkRow(skipped, 'cat').status, 'pass');
  assert.equal(checkRow(skipped, 'dog').status, 'fail');
  // Clearing it again leaves it pending, not stuck skipped.
  assert.equal(checkRow(skipped, '').status, 'pending');
});

test('isChecklistSettled accepts passed and skipped rows, nothing else', () => {
  const pass = { stroke: 'KAT', expected: 'cat', actual: 'cat', status: 'pass' as const };
  const skipped = { stroke: 'TR-RL', expected: '{^`}', actual: '', status: 'skipped' as const };
  const failed = { stroke: 'TPHOG', expected: 'dog', actual: 'cow', status: 'fail' as const };
  const pending = { stroke: 'STKPW', expected: 'zebra', actual: '', status: 'pending' as const };

  assert.equal(isChecklistSettled([pass, skipped]), true);
  assert.equal(isChecklistSettled([pass, failed]), false);
  assert.equal(isChecklistSettled([pass, pending]), false);
  // An empty checklist is vacuously settled — there is nothing to test.
  assert.equal(isChecklistSettled([]), true);
});
