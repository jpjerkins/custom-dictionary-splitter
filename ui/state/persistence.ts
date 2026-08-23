// Survives a page reload for the wizard's irreplaceable state.
//
// Why this exists: everything the wizard knows lived in React state, so a
// refresh reset it to nothing. That is fine at Step 1 — reconnect the
// keyboard and start again — but it is destructive from Step 4 onward,
// because Step 4 tells you to EMPTY the keyboard's user dictionary. After
// that the entries pending test exist only in this tab and on disk; there
// is no device left to re-download them from.
//
// What is deliberately NOT persisted, and why:
//   port              a Web Serial port object. Not JSON-serializable, and
//                     reopening one after a reload requires a fresh user
//                     gesture regardless.
//   dictionaryIndex   ~10 MB of stroke index — twice a typical 5 MB
//                     localStorage quota, so including it would make every
//                     write fail. Nothing reads it back.
//   diffResult        written by Step 2, never read.
//   groups, priority  declared on WizardState, never used.
//
// The rest is an explicit allowlist rather than a blanket copy, so a future
// field added to WizardState cannot silently blow the quota and take the
// working fields down with it.
import type { StepName, WizardState } from './WizardContext.tsx';
import { STEP_NAMES } from './WizardContext.tsx';

const STORAGE_KEY = 'custom-dictionary-splitter:wizard';
// Bump when the persisted shape changes incompatibly. A snapshot with a
// different version is discarded rather than half-restored.
const VERSION = 1;

export type PersistedState = Pick<
  WizardState,
  'deviceOrder' | 'downloadedDictionary' | 'fileHashes' | 'movedEntries' | 'touchedFiles' | 'checklist'
>;

export interface PersistedWizard {
  version: number;
  currentStep: StepName;
  state: PersistedState;
}

function pick(state: WizardState): PersistedState {
  return {
    deviceOrder: state.deviceOrder,
    downloadedDictionary: state.downloadedDictionary,
    fileHashes: state.fileHashes,
    movedEntries: state.movedEntries,
    touchedFiles: state.touchedFiles,
    checklist: state.checklist,
  };
}

// Nothing here may throw: storage is unavailable in private browsing on some
// browsers, and a full quota throws on write. Losing persistence is a
// degraded experience; taking the whole wizard down with it is not
// acceptable, since the in-memory state is still the live copy.
export function savePersisted(currentStep: StepName, state: WizardState): void {
  try {
    const payload: PersistedWizard = { version: VERSION, currentStep, state: pick(state) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore: quota exceeded, storage disabled, or no localStorage at all.
  }
}

export function loadPersisted(): PersistedWizard | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<PersistedWizard>;
    if (candidate.version !== VERSION) return null;
    if (!STEP_NAMES.includes(candidate.currentStep as StepName)) return null;
    if (typeof candidate.state !== 'object' || candidate.state === null) return null;
    // Arrays are what every consumer indexes into (buildTestChecklist,
    // Step 7's touchedFiles). A snapshot missing them is not restorable, so
    // reject it rather than resume into a crash.
    const { movedEntries, touchedFiles, checklist } = candidate.state;
    if (!Array.isArray(movedEntries) || !Array.isArray(touchedFiles) || !Array.isArray(checklist)) {
      return null;
    }
    return candidate as PersistedWizard;
  } catch {
    return null;
  }
}

export function clearPersisted(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore, as above.
  }
}

// Is a snapshot worth offering to restore? A run that never got past
// downloading has nothing at stake — the keyboard still holds everything —
// so prompting there is just noise on every visit.
export function isWorthResuming(snapshot: PersistedWizard): boolean {
  return snapshot.state.movedEntries.length > 0 || snapshot.currentStep !== 'connect';
}
