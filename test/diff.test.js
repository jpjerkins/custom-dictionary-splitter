import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffDictionary } from '../public/js/diff.js';

test('diffDictionary buckets new, conflicting, and unchanged strokes', () => {
  const downloaded = { KAT: 'cat', TKOG: 'dog', SPH: 'smile' };
  const index = {
    KAT: { file: 'a.json', translation: 'cat' },
    TKOG: { file: 'a.json', translation: 'canine' },
  };

  const result = diffDictionary(downloaded, index);

  assert.deepEqual(result.new, [{ stroke: 'SPH', translation: 'smile' }]);
  assert.deepEqual(result.conflict, [
    { stroke: 'TKOG', keyboardTranslation: 'dog', existingTranslation: 'canine', existingFile: 'a.json' },
  ]);
  assert.deepEqual(result.unchanged, [{ stroke: 'KAT', translation: 'cat' }]);
});
