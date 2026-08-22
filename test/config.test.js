import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.js';

test('loadConfig reads dictionariesPath and defaults git.autoPush to false', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-config-'));
  const dictDir = join(dir, 'dicts');
  await mkdir(dictDir);
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify({ dictionariesPath: dictDir }));

  const config = loadConfig(configPath);

  assert.equal(config.dictionariesPath, dictDir);
  assert.equal(config.git.autoPush, false);
});

test('loadConfig throws when dictionariesPath does not exist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-config-'));
  const configPath = join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify({ dictionariesPath: join(dir, 'missing') }));

  assert.throws(() => loadConfig(configPath), /does not exist/);
});

test('loadConfig throws when the config file is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-config-'));
  assert.throws(() => loadConfig(join(dir, 'config.json')), /not found/);
});
