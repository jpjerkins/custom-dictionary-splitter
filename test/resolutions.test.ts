import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priorityFromFilenames } from '../src/domain/priority.ts';
import type { Classified } from '../src/domain/classification.ts';
import type { FileName, Stroke, Word } from '../src/domain/types.ts';
import { RESOLUTIONS, defaultResolution } from '../src/domain/resolutions.ts';
import type { Resolution, ResolutionContext, ResolutionKind } from '../src/domain/resolutions.ts';

const PRIORITY_FILES: FileName[] = [
  '1-bible.json',
  '2-phil-mro.json',
  '4-phil-nav.json',
  '6-main.json',
  '7-commands.json',
];

function ctxFor(
  partial: Partial<Classified> & { kind: Classified['kind'] },
  protectedFiles: FileName[],
): ResolutionContext {
  const entry: Classified = {
    stroke: 'KAT' as Stroke,
    word: 'cat' as Word,
    kind: partial.kind,
    diskWord: partial.diskWord,
    diskFile: partial.diskFile,
    wordFiles: partial.wordFiles ?? [],
  };
  return {
    entry,
    priority: priorityFromFilenames(PRIORITY_FILES),
    protectedFiles,
  };
}

function resolutionByKind(kind: ResolutionKind): Resolution {
  const found = RESOLUTIONS.find((r) => r.kind === kind);
  if (!found) throw new Error(`no resolution for ${kind}`);
  return found;
}

test('keep-keyboard is unavailable when the disk entry is protected', () => {
  const ctx = ctxFor({ kind: 'chord-taken', diskFile: '6-main.json' }, ['6-main.json']);
  assert.equal(resolutionByKind('keep-keyboard').isAvailable(ctx), false);
  assert.equal(resolutionByKind('override').isAvailable(ctx), true);
});

test('override defaults when the shadowed entry is protected', () => {
  const ctx = ctxFor({ kind: 'chord-taken', diskFile: '6-main.json' }, ['6-main.json']);
  assert.equal(defaultResolution(ctx), 'override');
});

test('nothing is preselected when the disk entry is one of your own files', () => {
  const ctx = ctxFor({ kind: 'chord-taken', diskFile: '4-phil-nav.json' }, ['6-main.json']);
  assert.equal(defaultResolution(ctx), null);
});

test('an override target that cannot outrank the shadowed file is rejected', () => {
  const ctx = ctxFor({ kind: 'chord-taken', diskFile: '2-phil-mro.json' }, []);
  const override = resolutionByKind('override');
  assert.match(
    override.validate(ctx, { kind: 'override', targetFile: '7-commands.json' })!,
    /outrank/i,
  );
  assert.equal(override.validate(ctx, { kind: 'override', targetFile: '1-bible.json' }), null);
});

test('an override never writes to the shadowed file', () => {
  const ctx = ctxFor({ stroke: 'KAT', word: 'cat', kind: 'chord-taken', diskFile: '6-main.json' }, ['6-main.json']);
  const ops = resolutionByKind('override').toWriteOps(ctx, { kind: 'override', targetFile: '2-phil-mro.json' });
  assert.deepEqual(ops, [{ file: '2-phil-mro.json', stroke: 'KAT', word: 'cat' }]);
});

test('re-chord removes nothing from disk and writes the new stroke only', () => {
  const ctx = ctxFor({ stroke: 'KAT', word: 'cat', kind: 'chord-taken', diskFile: '6-main.json' }, []);
  const ops = resolutionByKind('re-chord').toWriteOps(ctx, { kind: 're-chord', newStroke: 'K-AT', targetFile: '2-phil-mro.json' });
  assert.deepEqual(ops, [{ file: '2-phil-mro.json', stroke: 'K-AT', word: 'cat' }]);
});

test('keep-disk writes nothing at all', () => {
  const ctx = ctxFor({ kind: 'chord-taken', diskFile: '6-main.json' }, []);
  assert.deepEqual(resolutionByKind('keep-disk').toWriteOps(ctx, { kind: 'keep-disk' }), []);
});

test('keep-keyboard overwrites the on-disk entry in its own file with the keyboard word', () => {
  const ctx = ctxFor(
    { stroke: 'KAT', word: 'cat', kind: 'chord-taken', diskWord: 'kata', diskFile: '4-phil-nav.json' },
    [], // not protected, so keep-keyboard is available
  );
  assert.deepEqual(
    resolutionByKind('keep-keyboard').toWriteOps(ctx, { kind: 'keep-keyboard' }),
    [{ file: '4-phil-nav.json', stroke: 'KAT', word: 'cat' }],
  );
});
