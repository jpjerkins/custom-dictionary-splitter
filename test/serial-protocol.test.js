import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResponseAccumulator, parseDictionaryList, parseDictionaryJson } from '../public/js/serial-protocol.js';

test('createResponseAccumulator waits for a blank-line terminator across chunks', () => {
  const accumulator = createResponseAccumulator();

  accumulator.push('KAT: cat\n');
  assert.equal(accumulator.tryExtractResponse(), null);

  accumulator.push('TKOG: dog\n\n');
  assert.equal(accumulator.tryExtractResponse(), 'KAT: cat\nTKOG: dog');
});

test('parseDictionaryList splits and trims lines', () => {
  assert.deepEqual(parseDictionaryList('user_dictionary\nmain_dictionary\n'), ['user_dictionary', 'main_dictionary']);
});

test('parseDictionaryJson parses valid JSON and throws on malformed input', () => {
  assert.deepEqual(parseDictionaryJson('{"KAT":"cat"}'), { KAT: 'cat' });
  assert.throws(() => parseDictionaryJson('not json'));
});
