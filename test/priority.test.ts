import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priorityFromFilenames, deviceOrderMismatch, missingFromDevice } from '../src/domain/priority.ts';

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

test('a reorder is still detected when the device also reports unknown dictionaries', () => {
  assert.equal(
    deviceOrderMismatch(['1-a.json', '2-b.json'], ['2-b.json', '1-a.json', 'extra.json']),
    true,
  );
});

test('the real device list shape: unknown leading entries do not mask a reorder', () => {
  const onDisk = ['1-bible.json', '2-phil-mro.json', '6-main.json'];
  // device reports two dictionaries that are not files, then the files IN ORDER
  assert.equal(
    deviceOrderMismatch(onDisk, ['user_dictionary', 'jeff-numbers', ...onDisk]),
    false,
  );
  // same padding, but 6-main flashed ahead of 2-phil-mro
  assert.equal(
    deviceOrderMismatch(onDisk, ['user_dictionary', 'jeff-numbers', '1-bible.json', '6-main.json', '2-phil-mro.json']),
    true,
  );
});

test('missingFromDevice reports on-disk files the device did not report', () => {
  assert.deepEqual(
    missingFromDevice(['1-a.json', '2-b.json', '3-c.json'], ['1-a.json', '3-c.json']),
    ['2-b.json'],
  );
});

test('missingFromDevice is empty when the device reports everything', () => {
  assert.deepEqual(
    missingFromDevice(['1-a.json', '2-b.json'], ['2-b.json', '1-a.json']),
    [],
  );
});

test('missingFromDevice ignores device entries that are not on-disk files', () => {
  assert.deepEqual(
    missingFromDevice(['1-a.json'], ['user_dictionary', 'jeff-numbers']),
    ['1-a.json'],
  );
});
