import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitAndMaybePush } from '../lib/git.js';

const execFileAsync = promisify(execFile);

async function initRepo(dir) {
  await execFileAsync('git', ['init'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

test('commitAndMaybePush commits without pushing when autoPush is false', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-git-'));
  await initRepo(dir);
  await writeFile(join(dir, 'a.json'), '{}');

  const result = await commitAndMaybePush(dir, 'test commit', false);

  assert.equal(result.committed, true);
  assert.equal(result.pushed, false);
  const { stdout } = await execFileAsync('git', ['log', '--oneline'], { cwd: dir });
  assert.match(stdout, /test commit/);
});

test('commitAndMaybePush reports nothing to commit when working tree is clean', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cds-git-'));
  await initRepo(dir);
  await writeFile(join(dir, 'a.json'), '{}');
  await commitAndMaybePush(dir, 'first commit', false);

  const result = await commitAndMaybePush(dir, 'second commit', false);

  assert.equal(result.committed, false);
});

test('commitAndMaybePush pushes when autoPush is true', async () => {
  const bareDir = await mkdtemp(join(tmpdir(), 'cds-bare-'));
  await execFileAsync('git', ['init', '--bare'], { cwd: bareDir });

  const dir = await mkdtemp(join(tmpdir(), 'cds-git-'));
  await initRepo(dir);
  await execFileAsync('git', ['remote', 'add', 'origin', bareDir], { cwd: dir });
  await writeFile(join(dir, 'a.json'), '{}');
  await execFileAsync('git', ['add', '-A'], { cwd: dir });
  await execFileAsync('git', ['commit', '-m', 'seed'], { cwd: dir });
  await execFileAsync('git', ['push', '-u', 'origin', 'HEAD'], { cwd: dir });

  await writeFile(join(dir, 'b.json'), '{}');
  const result = await commitAndMaybePush(dir, 'second commit', true);

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  const { stdout } = await execFileAsync('git', ['log', '--oneline'], { cwd: bareDir });
  assert.match(stdout, /second commit/);
});
