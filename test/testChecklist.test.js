import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestChecklist, checkRow } from '../public/js/testChecklist.js';

test('buildTestChecklist creates a pending row per moved entry', () => {
  const checklist = buildTestChecklist([{ stroke: 'KAT', translation: 'cat' }]);
  assert.deepEqual(checklist, [{ stroke: 'KAT', expected: 'cat', actual: '', status: 'pending' }]);
});

test('checkRow marks pass when actual matches expected, fail otherwise', () => {
  const row = { stroke: 'KAT', expected: 'cat', actual: '', status: 'pending' };
  assert.equal(checkRow(row, 'cat').status, 'pass');
  assert.equal(checkRow(row, 'dog').status, 'fail');
});
