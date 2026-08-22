export interface CommitResult {
  committed: boolean;
  pushed: boolean;
  message?: string;
  pushError?: string;
}

export interface GitService {
  commitAndMaybePush(message: string, autoPush: boolean, files?: string[]): Promise<CommitResult>;
}
