export const state = {
  port: null,
  downloadedDictionary: null,
  dictionaryIndex: null,
  fileHashes: null,
  diffResult: null,
  movedEntries: [],
  touchedFiles: [],
  checklist: [],
};

const STEP_NAMES = ['connect', 'diff', 'sort', 'empty', 'flash', 'test', 'commit'];

export function showStep(name) {
  for (const step of STEP_NAMES) {
    const el = document.getElementById(`step-${step}`);
    const isTarget = step === name;
    el.hidden = !isTarget;
    if (isTarget) {
      el.dispatchEvent(new CustomEvent('wizard:enter'));
    }
  }
}
