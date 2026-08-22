import type { FileName } from './types.ts';

export interface PriorityOrder {
  files: FileName[];
  rankOf(file: FileName): number;
  outranks(a: FileName, b: FileName): boolean;
}

export function priorityFromFilenames(files: FileName[]): PriorityOrder {
  const ordered = [...files].sort((a, b) => a.localeCompare(b, 'en'));
  const ranks = new Map<FileName, number>(ordered.map((f, i) => [f, i]));
  const rankOf = (file: FileName): number =>
    ranks.get(file) ?? Number.MAX_SAFE_INTEGER;
  return {
    files: ordered,
    rankOf,
    outranks: (a, b) => rankOf(a) < rankOf(b),
  };
}

// The device lists dictionaries the filesystem does not have (user_dictionary,
// jeff-numbers). Only the files present on disk are comparable.
export function deviceOrderMismatch(expected: FileName[], device: FileName[]): boolean {
  const known = new Set(expected);
  const filtered = device.filter((d) => known.has(d));
  return filtered.length === expected.length &&
    filtered.some((f, i) => f !== expected[i]);
}

// A short device list short-circuits deviceOrderMismatch to false — it only
// compares order, not completeness. This catches the sibling accident: a
// firmware build that leaves a dictionary out entirely, silently making its
// entries unavailable on the keyboard. Entries the device reports that are
// not on-disk files (user_dictionary, jeff-numbers) are irrelevant here too.
export function missingFromDevice(expected: FileName[], device: FileName[]): FileName[] {
  const reported = new Set(device);
  return expected.filter((f) => !reported.has(f));
}
