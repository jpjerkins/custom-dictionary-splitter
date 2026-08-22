import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CommitResult, GitService } from '../application/ports.ts';

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

export function createGitAdapter(cwd: string): GitService {
  return {
    async commitAndMaybePush(message: string, autoPush: boolean, files?: string[]): Promise<CommitResult> {
      if (files && files.length > 0) {
        await runGit(['add', '--', ...files], cwd);
      } else {
        await runGit(['add', '-A'], cwd);
      }
      const staged = await runGit(['diff', '--cached', '--name-only'], cwd);
      if (!staged) {
        return { committed: false, pushed: false, message: 'Nothing to commit' };
      }
      await runGit(['commit', '-m', message], cwd);
      if (!autoPush) {
        return { committed: true, pushed: false, message };
      }
      try {
        await runGit(['push'], cwd);
      } catch (err) {
        return { committed: true, pushed: false, pushError: (err as Error).message, message };
      }
      return { committed: true, pushed: true, message };
    },
  };
}
