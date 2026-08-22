import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runGit(args, cwd) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

export async function commitAndMaybePush(dirPath, message, autoPush, files) {
  if (files && files.length > 0) {
    await runGit(['add', '--', ...files], dirPath);
  } else {
    await runGit(['add', '-A'], dirPath);
  }
  const staged = await runGit(['diff', '--cached', '--name-only'], dirPath);
  if (!staged) {
    return { committed: false, pushed: false, message: 'Nothing to commit' };
  }
  await runGit(['commit', '-m', message], dirPath);
  if (!autoPush) {
    return { committed: true, pushed: false, message };
  }
  try {
    await runGit(['push'], dirPath);
  } catch (err) {
    return { committed: true, pushed: false, pushError: err.message, message };
  }
  return { committed: true, pushed: true, message };
}
