import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareStrokes, isStrokeParseable } from '../src/domain/stenoOrder.ts';

test('compareStrokes orders single strokes by canonical key position', () => {
  assert.ok(compareStrokes('S', 'T') < 0);
  assert.ok(compareStrokes('TAP', 'TOP') < 0);
  assert.ok(compareStrokes('TOP', 'TAP') > 0);
  assert.equal(compareStrokes('KAT', 'KAT'), 0);
});

test('compareStrokes orders multi-strokes by first differing chord, then length', () => {
  assert.ok(compareStrokes('KAT', 'KAT/TOEG') < 0);
  assert.ok(compareStrokes('TEFT/-G', 'TEFT/-D') < 0);
});

test('isStrokeParseable is true for keys in the canonical order and false otherwise', () => {
  assert.equal(isStrokeParseable('KAT'), true);
  assert.equal(isStrokeParseable('STAPBD/*UP'), true);
  assert.equal(isStrokeParseable('123XYZ'), false);
});
