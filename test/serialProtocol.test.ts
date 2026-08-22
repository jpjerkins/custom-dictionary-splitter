import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResponseAccumulator, parseDictionaryList, parseDictionaryJson } from '../ui/serial/serialProtocol.ts';

test('createResponseAccumulator waits for a blank-line terminator across chunks', () => {
  const accumulator = createResponseAccumulator();

  accumulator.push('KAT: cat\n');
  assert.equal(accumulator.tryExtractResponse(), null);

  accumulator.push('TKOG: dog\n\n');
  assert.equal(accumulator.tryExtractResponse(), 'KAT: cat\nTKOG: dog');
});

test('parseDictionaryList reads the bracketed record list the firmware emits', () => {
  // Captured verbatim from a Starboard running Javelin.
  const response = [
    '[',
    '{d: user_dictionary},',
    '{d: jeff-numbers},',
    '{d: 1-bible.json},',
    '{d: 7-commands.json}',
    ']',
  ].join('\n');

  assert.deepEqual(parseDictionaryList(response), [
    'user_dictionary',
    'jeff-numbers',
    '1-bible.json',
    '7-commands.json',
  ]);
});

test('parseDictionaryList includes disabled dictionaries', () => {
  assert.deepEqual(parseDictionaryList('[\n{d: on.json},\n{d: off.json,v: 0}\n]'), ['on.json', 'off.json']);
});

test('parseDictionaryList unquotes names that were not YAML-safe', () => {
  assert.deepEqual(parseDictionaryList('[\n{d: "a b: c"}\n]'), ['a b: c']);
});

test('parseDictionaryList returns nothing for an empty list', () => {
  assert.deepEqual(parseDictionaryList('[\n]'), []);
});

test('parseDictionaryJson parses valid JSON and throws on malformed input', () => {
  assert.deepEqual(parseDictionaryJson('{"KAT":"cat"}'), { KAT: 'cat' });
  assert.throws(() => parseDictionaryJson('not json'));
});
