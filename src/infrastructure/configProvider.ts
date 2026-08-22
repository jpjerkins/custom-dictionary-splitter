import { readFileSync, existsSync } from 'node:fs';
import type { FileName } from '../domain/types.ts';

const DEFAULT_PROTECTED: FileName[] = ['6-main.json', '7-commands.json'];

export interface AppConfig {
  dictionariesPath: string;
  protectedFiles: FileName[];
  git: { autoPush: boolean };
}

// Parses an already-loaded config object. Pure — does not touch the filesystem,
// so it is safe to unit test without a real dictionariesPath on disk.
export function loadConfigFrom(raw: unknown): AppConfig {
  const parsed = raw as Record<string, unknown>;

  if (!parsed.dictionariesPath || typeof parsed.dictionariesPath !== 'string') {
    throw new Error('config.json must set "dictionariesPath" to a string path');
  }

  // An explicit empty array is meaningful ("protect nothing"), so only a missing
  // key falls back to the defaults.
  const protectedFiles = parsed.protectedFiles === undefined ? DEFAULT_PROTECTED : parsed.protectedFiles;

  if (!Array.isArray(protectedFiles) || protectedFiles.some((f) => typeof f !== 'string')) {
    throw new Error('config: protectedFiles must be an array of strings');
  }

  const git = parsed.git as { autoPush?: unknown } | undefined;

  return {
    dictionariesPath: parsed.dictionariesPath,
    protectedFiles: protectedFiles as FileName[],
    git: { autoPush: git?.autoPush === true },
  };
}

export function loadConfig(configPath: string): AppConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Copy config.example.json to config.json and edit it.`);
  }
  const raw = readFileSync(configPath, 'utf8');
  const config = loadConfigFrom(JSON.parse(raw));
  if (!existsSync(config.dictionariesPath)) {
    throw new Error(`dictionariesPath does not exist: ${config.dictionariesPath}`);
  }
  return config;
}
