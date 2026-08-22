import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runGit(args, cwd) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

export async function commitAndMaybePush(dirPath, message, autoPush) {
  await runGit(['add', '-A'], dirPath);
  const status = await runGit(['status', '--porcelain'], dirPath);
  if (!status) {
    return { committed: false, pushed: false, message: 'Nothing to commit' };
  }
  await runGit(['commit', '-m', message], dirPath);
  let pushed = false;
  if (autoPush) {
    await runGit(['push'], dirPath);
    pushed = true;
  }
  return { committed: true, pushed, message };
}
