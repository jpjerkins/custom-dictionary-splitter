import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priorityFromFilenames, deviceOrderMismatch } from '../src/domain/priority.ts';

test('priority follows ascending filename order, first wins', () => {
  const p = priorityFromFilenames(['6-main.json', '1-bible.json', '2-phil-mro.json']);
  assert.deepEqual(p.files, ['1-bible.json', '2-phil-mro.json', '6-main.json']);
  assert.equal(p.rankOf('1-bible.json'), 0);
  assert.equal(p.outranks('1-bible.json', '6-main.json'), true);
  assert.equal(p.outranks('6-main.json', '1-bible.json'), false);
});

test('a file absent from the order never outranks a known file', () => {
  const p = priorityFromFilenames(['1-bible.json']);
  assert.equal(p.rankOf('nope.json'), Number.MAX_SAFE_INTEGER);
  assert.equal(p.outranks('nope.json', '1-bible.json'), false);
});

test('device order mismatch is detected, ignoring files the disk does not have', () => {
  assert.equal(deviceOrderMismatch(['1-a.json', '2-b.json'], ['1-a.json', '2-b.json']), false);
  assert.equal(deviceOrderMismatch(['1-a.json', '2-b.json'], ['2-b.json', '1-a.json']), true);
  // device lists non-file dictionaries too; they are ignored
  assert.equal(deviceOrderMismatch(['1-a.json'], ['user_dictionary', '1-a.json']), false);
});
