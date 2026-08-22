import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { compareStrokes, isStrokeParseable } from '../domain/stenoOrder.ts';
import type { DictionaryFile, DictionaryRepository } from '../application/ports.ts';
import type { ApplyDecision, ApplyResult } from '../application/saveDecisions.ts';
import type { FileName, Stroke, Word } from '../domain/types.ts';

export function loadDictionaryFiles(dirPath: string): Record<FileName, DictionaryFile> {
  const files = readdirSync(dirPath).filter((f) => f.endsWith('.json'));
  const result: Record<FileName, DictionaryFile> = {};
  for (const file of files) {
    const fullPath = join(dirPath, file);
    const raw = readFileSync(fullPath, 'utf8');
    const entries = JSON.parse(raw);
    const hash = createHash('sha256').update(raw).digest('hex');
    result[file] = { path: fullPath, entries, hash, mtimeMs: statSync(fullPath).mtimeMs };
  }
  return result;
}

function hashOf(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function sortEntries(entries: Record<Stroke, Word>): Record<Stroke, Word> {
  const sortedStrokes = Object.keys(entries).sort((a, b) => {
    const aParseable = isStrokeParseable(a);
    const bParseable = isStrokeParseable(b);
    if (aParseable && !bParseable) return -1;
    if (!aParseable && bParseable) return 1;
    if (!aParseable && !bParseable) return 0;
    return compareStrokes(a, b);
  });
  const sorted: Record<Stroke, Word> = {};
  for (const stroke of sortedStrokes) sorted[stroke] = entries[stroke];
  return sorted;
}

function writeSorted(path: string, entries: Record<Stroke, Word>): void {
  writeFileSync(path, `${JSON.stringify(sortEntries(entries), null, 2)}\n`, 'utf8');
}

export function applyEntries(
  dictionaryFiles: Record<FileName, DictionaryFile>,
  decisions: ApplyDecision[],
  repository: DictionaryRepository
): ApplyResult[] {
  const results: ApplyResult[] = [];
  const byFile = new Map<FileName, Record<Stroke, Word>>();

  for (const decision of decisions) {
    const fileInfo = dictionaryFiles[decision.destinationFile];
    if (!fileInfo) {
      results.push({ stroke: decision.stroke, status: 'error', reason: `Unknown file: ${decision.destinationFile}` });
      continue;
    }
    const currentRaw = readFileSync(fileInfo.path, 'utf8');
    if (hashOf(currentRaw) !== decision.capturedHash) {
      results.push({ stroke: decision.stroke, status: 'stale', reason: `${decision.destinationFile} changed since diff; re-run diff` });
      continue;
    }
    if (!byFile.has(decision.destinationFile)) {
      byFile.set(decision.destinationFile, { ...fileInfo.entries });
    }
    const target = byFile.get(decision.destinationFile)!;
    if (decision.remove) {
      delete target[decision.stroke];
      results.push({ stroke: decision.stroke, status: 'removed' });
      continue;
    }
    target[decision.stroke] = decision.translation as Word;
    results.push({
      stroke: decision.stroke,
      status: isStrokeParseable(decision.stroke) ? 'written' : 'written-unparseable-appended',
    });
  }

  for (const [file, entries] of byFile.entries()) {
    repository.write(file, entries);
  }

  return results;
}

export function createFsDictionaryRepository(dirPath: string): DictionaryRepository {
  return {
    load(): Record<FileName, DictionaryFile> {
      return loadDictionaryFiles(dirPath);
    },
    write(file: FileName, entries: Record<Stroke, Word>): void {
      writeSorted(join(dirPath, file), entries);
    },
  };
}
