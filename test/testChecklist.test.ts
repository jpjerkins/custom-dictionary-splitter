import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestChecklist, checkRow } from '../src/domain/testChecklist.ts';

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
