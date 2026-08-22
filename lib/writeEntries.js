import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compareStrokes, isStrokeParseable } from '../src/domain/stenoOrder.ts';

function hashOf(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

export function applyEntries(dictionaryFiles, decisions) {
  const results = [];
  const byFile = new Map();

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
      byFile.set(decision.destinationFile, { path: fileInfo.path, entries: { ...fileInfo.entries } });
    }
    const target = byFile.get(decision.destinationFile).entries;
    if (decision.remove) {
      delete target[decision.stroke];
      results.push({ stroke: decision.stroke, status: 'removed' });
      continue;
    }
    target[decision.stroke] = decision.translation;
    results.push({
      stroke: decision.stroke,
      status: isStrokeParseable(decision.stroke) ? 'written' : 'written-unparseable-appended',
    });
  }

  for (const { path, entries } of byFile.values()) {
    const sortedStrokes = Object.keys(entries).sort((a, b) => {
      const aParseable = isStrokeParseable(a);
      const bParseable = isStrokeParseable(b);
      if (aParseable && !bParseable) return -1;
      if (!aParseable && bParseable) return 1;
      if (!aParseable && !bParseable) return 0;
      return compareStrokes(a, b);
    });
    const sorted = {};
    for (const stroke of sortedStrokes) sorted[stroke] = entries[stroke];
    writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  }

  return results;
}
