import { readFileSync, existsSync } from 'node:fs';

export function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Copy config.example.json to config.json and edit it.`);
  }
  const raw = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.dictionariesPath || typeof parsed.dictionariesPath !== 'string') {
    throw new Error('config.json must set "dictionariesPath" to a string path');
  }
  if (!existsSync(parsed.dictionariesPath)) {
    throw new Error(`dictionariesPath does not exist: ${parsed.dictionariesPath}`);
  }
  return {
    dictionariesPath: parsed.dictionariesPath,
    git: { autoPush: parsed.git?.autoPush === true },
  };
}
