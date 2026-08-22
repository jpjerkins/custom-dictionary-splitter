import { describe, expect, test } from 'vitest';
import { RESOLUTIONS, defaultResolution, hasUnresolvedConflicts, outranks } from './resolutions.ts';
import type { Resolution, ResolutionContext, ResolutionKind } from './resolutions.ts';
import type { WordGroup } from './steps/sort/types.ts';

// Mirrors test/resolutions.test.ts against ui/resolutions.ts (the browser
// duplicate — see that file's header comment). Same scenarios, same
// expected outcomes: if this file and the domain suite ever disagree, the
// mirror has drifted.

const PRIORITY_FILES = ['1-bible.json', '2-phil-mro.json', '4-phil-nav.json', '6-main.json', '7-commands.json'];

function ctxFor(
  partial: { diskFile?: string; diskWord?: string },
  protectedFiles: string[]
): ResolutionContext {
  return {
    entry: { stroke: 'KAT', word: 'cat', diskFile: partial.diskFile },
    priority: PRIORITY_FILES,
    protectedFiles,
  };
}

function resolutionByKind(kind: ResolutionKind): Resolution {
  const found = RESOLUTIONS.find((r) => r.kind === kind);
  if (!found) throw new Error(`no resolution for ${kind}`);
  return found;
}

describe('ui/resolutions.ts (browser mirror)', () => {
  test('keep-keyboard is unavailable when the disk entry is protected', () => {
    const ctx = ctxFor({ diskFile: '6-main.json' }, ['6-main.json']);
    expect(resolutionByKind('keep-keyboard').isAvailable(ctx)).toBe(false);
    expect(resolutionByKind('override').isAvailable(ctx)).toBe(true);
  });

  test('override defaults when the shadowed entry is protected', () => {
    const ctx = ctxFor({ diskFile: '6-main.json' }, ['6-main.json']);
    expect(defaultResolution(ctx)).toBe('override');
  });

  test('nothing is preselected when the disk entry is one of your own files', () => {
    const ctx = ctxFor({ diskFile: '4-phil-nav.json' }, ['6-main.json']);
    expect(defaultResolution(ctx)).toBeNull();
  });

  test('an override target that cannot outrank the shadowed file is rejected', () => {
    const ctx = ctxFor({ diskFile: '2-phil-mro.json' }, []);
    const override = resolutionByKind('override');
    expect(override.validate(ctx, { kind: 'override', targetFile: '7-commands.json' })).toMatch(/outrank/i);
    expect(override.validate(ctx, { kind: 'override', targetFile: '1-bible.json' })).toBeNull();
  });

  test('an override never writes to the shadowed file', () => {
    const ctx = ctxFor({ diskFile: '6-main.json' }, ['6-main.json']);
    const ops = resolutionByKind('override').toWriteOps(ctx, { kind: 'override', targetFile: '2-phil-mro.json' });
    expect(ops).toEqual([{ file: '2-phil-mro.json', stroke: 'KAT', word: 'cat' }]);
  });

  test('re-chord removes nothing from disk and writes the new stroke only', () => {
    const ctx = ctxFor({ diskFile: '6-main.json' }, []);
    const ops = resolutionByKind('re-chord').toWriteOps(ctx, {
      kind: 're-chord',
      newStroke: 'K-AT',
      targetFile: '2-phil-mro.json',
    });
    expect(ops).toEqual([{ file: '2-phil-mro.json', stroke: 'K-AT', word: 'cat' }]);
  });

  test('keep-disk writes nothing at all', () => {
    const ctx = ctxFor({ diskFile: '6-main.json' }, []);
    expect(resolutionByKind('keep-disk').toWriteOps(ctx, { kind: 'keep-disk' })).toEqual([]);
  });

  test('outranks compares by position in the priority array (leftmost wins)', () => {
    expect(outranks(PRIORITY_FILES, '1-bible.json', '6-main.json')).toBe(true);
    expect(outranks(PRIORITY_FILES, '6-main.json', '1-bible.json')).toBe(false);
  });

  test('hasUnresolvedConflicts is true only while a live conflict has no resolution', () => {
    const groups: WordGroup[] = [
      {
        word: 'ant',
        existingChords: [],
        newChords: [{ stroke: 'SPWANT', kind: 'chord-taken', diskWord: 'aunt', diskFile: '6-main.json', resolution: null }],
        destinationFile: null,
        invariantWarning: null,
        priorityWarning: null,
      },
    ];
    expect(hasUnresolvedConflicts(groups)).toBe(true);

    groups[0]!.newChords[0]!.resolution = { kind: 'keep-disk' };
    expect(hasUnresolvedConflicts(groups)).toBe(false);

    const newWordOnly: WordGroup[] = [
      {
        word: 'zoo',
        existingChords: [],
        newChords: [{ stroke: 'TKOO', kind: 'new', resolution: null }],
        destinationFile: '1-bible.json',
        invariantWarning: null,
        priorityWarning: null,
      },
    ];
    expect(hasUnresolvedConflicts(newWordOnly)).toBe(false);
  });
});
