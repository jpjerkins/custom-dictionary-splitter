import type { CommitResult, GitService } from './ports.ts';

export interface CommitAndPushDeps {
  gitService: GitService;
  autoPush: boolean;
}

export interface CommitAndPushInput {
  message: string;
  files?: string[];
}

export function createCommitAndPushUseCase({ gitService, autoPush }: CommitAndPushDeps) {
  return {
    execute({ message, files }: CommitAndPushInput): Promise<CommitResult> {
      return gitService.commitAndMaybePush(message, autoPush, files);
    },
  };
}
