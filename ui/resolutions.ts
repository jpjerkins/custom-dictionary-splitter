// Browser-side duplicate of src/domain/resolutions.ts (+ the
// hasUnresolvedConflicts half of src/domain/grouping.ts). ui/ talks to the
// backend over HTTP only and must not import server code into the bundle
// (see .superpowers/sdd/2026-08-22-typescript-overrides-react task 18/19
// briefs, and the ui/testChecklist.ts precedent), so this pure logic is
// kept in sync by hand rather than shared. If it drifts from the domain
// version, the two suites (test/resolutions.test.ts and this file's own
// tests) will disagree on the same scenarios — that's the tripwire.
//
// One deliberate simplification versus the domain version: instead of a
// PriorityOrder object with rankOf/outranks methods, `priority` here is
// just the already-rank-ordered string[] the backend returns from
// GET /api/dictionaries (highest priority first) — the same array SortTable
// already threads through as column order. `outranks` below is the same
// "lower index wins" rule, applied directly to that array.
import type { WordGroup } from './steps/sort/types.ts';

export type ResolutionKind = 'keep-keyboard' | 'keep-disk' | 're-chord' | 'override';

export interface ResolutionEntry {
  stroke: string;
  word: string;
  diskFile?: string;
}

export interface ResolutionContext {
  entry: ResolutionEntry;
  priority: string[];
  protectedFiles: string[];
}

export interface WriteOp {
  file: string;
  stroke: string;
  word?: string;
  remove?: boolean;
}

export interface ResolutionChoice {
  kind: ResolutionKind;
  targetFile?: string;
  newStroke?: string;
}

export interface Resolution {
  kind: ResolutionKind;
  isAvailable(ctx: ResolutionContext): boolean;
  validate(ctx: ResolutionContext, choice: ResolutionChoice): string | null;
  toWriteOps(ctx: ResolutionContext, choice: ResolutionChoice): WriteOp[];
}

function isProtected(ctx: ResolutionContext, file: string | undefined): boolean {
  return file !== undefined && ctx.protectedFiles.includes(file);
}

export function outranks(priority: string[], a: string, b: string): boolean {
  const rankOf = (file: string): number => {
    const i = priority.indexOf(file);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return rankOf(a) < rankOf(b);
}

// keep-keyboard: the downloaded chord overwrites the on-disk entry, in
// place, in the file that currently owns it. Unavailable when that file is
// one of the stock dictionaries the user never edits directly.
const keepKeyboard: Resolution = {
  kind: 'keep-keyboard',
  isAvailable(ctx) {
    return !isProtected(ctx, ctx.entry.diskFile);
  },
  validate(ctx) {
    if (!this.isAvailable(ctx)) {
      return 'keep-keyboard is unavailable: the on-disk entry lives in a protected file';
    }
    return null;
  },
  toWriteOps(ctx) {
    return [{ file: ctx.entry.diskFile!, stroke: ctx.entry.stroke, word: ctx.entry.word }];
  },
};

// keep-disk: discard the downloaded entry entirely. Writes nothing.
const keepDisk: Resolution = {
  kind: 'keep-disk',
  isAvailable() {
    return true;
  },
  validate() {
    return null;
  },
  toWriteOps() {
    return [];
  },
};

// re-chord: leave the on-disk entry untouched; assign the downloaded word a
// different, free chord instead. Removes nothing.
const reChord: Resolution = {
  kind: 're-chord',
  isAvailable() {
    return true;
  },
  validate(_ctx, choice) {
    if (!choice.newStroke) {
      return 're-chord requires a new stroke';
    }
    if (!choice.targetFile) {
      return 're-chord requires a target file';
    }
    return null;
  },
  toWriteOps(ctx, choice) {
    return [{ file: choice.targetFile!, stroke: choice.newStroke!, word: ctx.entry.word }];
  },
};

// override: write the downloaded chord into a higher-priority file, leaving
// the shadowed on-disk entry exactly as it is. The target must outrank the
// shadowed file, or the keyboard will keep resolving to the old word.
const override: Resolution = {
  kind: 'override',
  isAvailable() {
    return true;
  },
  validate(ctx, choice) {
    if (!choice.targetFile) {
      return 'override requires a target file';
    }
    const shadowed = ctx.entry.diskFile;
    if (shadowed !== undefined && !outranks(ctx.priority, choice.targetFile, shadowed)) {
      return `override target must outrank the shadowed file (${shadowed})`;
    }
    return null;
  },
  toWriteOps(ctx, choice) {
    return [{ file: choice.targetFile!, stroke: ctx.entry.stroke, word: ctx.entry.word }];
  },
};

export const RESOLUTIONS: Resolution[] = [keepKeyboard, keepDisk, reChord, override];

export function defaultResolution(ctx: ResolutionContext): ResolutionKind | null {
  return isProtected(ctx, ctx.entry.diskFile) ? 'override' : null;
}

// A chord blocks Save while it is a live conflict ('chord-taken' or 'both')
// and still has no resolution chosen. 'new' and 'word-exists' never block.
// Mirrors src/domain/grouping.ts hasUnresolvedConflicts.
export function hasUnresolvedConflicts(groups: WordGroup[]): boolean {
  return groups.some((group) =>
    group.newChords.some(
      (chord) =>
        (chord.kind === 'chord-taken' || chord.kind === 'both') && chord.resolution === null
    )
  );
}
