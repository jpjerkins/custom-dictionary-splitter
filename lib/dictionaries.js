import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export function loadDictionaryFiles(dirPath) {
  const files = readdirSync(dirPath).filter((f) => f.endsWith('.json'));
  const result = {};
  for (const file of files) {
    const fullPath = join(dirPath, file);
    const raw = readFileSync(fullPath, 'utf8');
    const entries = JSON.parse(raw);
    const hash = createHash('sha256').update(raw).digest('hex');
    result[file] = { path: fullPath, entries, hash, mtimeMs: statSync(fullPath).mtimeMs };
  }
  return result;
}

// When the same stroke appears in more than one file, the file processed
// last (readdirSync order) wins in the index — this should not happen in
// practice since strokes are meant to be unique across the dictionary set.
export function buildStrokeIndex(dictionaryFiles) {
  const index = {};
  for (const [file, { entries }] of Object.entries(dictionaryFiles)) {
    for (const [stroke, translation] of Object.entries(entries)) {
      index[stroke] = { file, translation };
    }
  }
  return index;
}
