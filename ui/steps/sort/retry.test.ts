import { describe, expect, test } from 'vitest';
import { buildRetryRows } from './retry.ts';
import type { MovedEntry } from './retry.ts';
import type { ChecklistRow } from '../../testChecklist.ts';

describe('buildRetryRows', () => {
  test('carries destinationFile/wasConflict/existingTranslation from the matching moved entry', () => {
    const failed: ChecklistRow[] = [{ stroke: 'SPWANT', expected: 'ant', actual: 'annt', status: 'fail' }];
    const movedEntries: MovedEntry[] = [
      {
        stroke: 'SPWANT',
        translation: 'ant',
        destinationFile: '9-misc.json',
        wasConflict: true,
        existingTranslation: 'aunt',
      },
    ];

    expect(buildRetryRows(failed, movedEntries)).toEqual([
      {
        stroke: 'SPWANT',
        translation: 'ant',
        destinationFile: '9-misc.json',
        wasConflict: true,
        existingTranslation: 'aunt',
      },
    ]);
  });

  test('falls back to a non-conflict row when no moved entry matches', () => {
    const failed: ChecklistRow[] = [{ stroke: 'KAT', expected: 'cat', actual: 'dog', status: 'fail' }];

    expect(buildRetryRows(failed, [])).toEqual([
      { stroke: 'KAT', translation: 'cat', destinationFile: '', wasConflict: false, existingTranslation: undefined },
    ]);
  });
});
