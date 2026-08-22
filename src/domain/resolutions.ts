import type { FileName, Stroke, Word } from './types.ts';
import type { PriorityOrder } from './priority.ts';
import type { Classified } from './classification.ts';

export type ResolutionKind = 'keep-keyboard' | 'keep-disk' | 're-chord' | 'override';

export interface ResolutionContext {
  entry: Classified;
  priority: PriorityOrder;
  protectedFiles: FileName[];
}

export interface WriteOp {
  file: FileName;
  stroke: Stroke;
  word?: Word;
  remove?: boolean;
}

export interface Resolution {
  kind: ResolutionKind;
  isAvailable(ctx: ResolutionContext): boolean;
  validate(ctx: ResolutionContext, choice: ResolutionChoice): string | null;
  toWriteOps(ctx: ResolutionContext, choice: ResolutionChoice): WriteOp[];
}

export interface ResolutionChoice {
  kind: ResolutionKind;
  targetFile?: FileName;
  newStroke?: Stroke;
}

function isProtected(ctx: ResolutionContext, file: FileName | undefined): boolean {
  return file !== undefined && ctx.protectedFiles.includes(file);
}

// keep-keyboard: the downloaded chord overwrites the on-disk entry, in place,
// in the file that currently owns it. Unavailable when that file is one of
// the stock dictionaries the user never edits directly.
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
    if (shadowed !== undefined && !ctx.priority.outranks(choice.targetFile, shadowed)) {
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
