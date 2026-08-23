import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { clearPersisted, isWorthResuming, loadPersisted, savePersisted } from './persistence.ts';
import type { PersistedWizard } from './persistence.ts';

export const STEP_NAMES = ['connect', 'diff', 'sort', 'empty', 'flash', 'test', 'commit'] as const;

export type StepName = (typeof STEP_NAMES)[number];

// Flat state mirroring public/js/state.js, plus the classification fields
// (`groups`, `priority`) the new wizard steps need.
export interface WizardState {
  port: unknown;
  // Step 1's raw `list_dictionaries` reply, verbatim — including names that
  // are not files on disk (e.g. 'user_dictionary', 'jeff-numbers'). Threaded
  // through to POST /api/classify as `deviceOrder` so the backend can warn
  // when the firmware's dictionary order doesn't match what's on disk; the
  // domain functions filter non-file entries themselves, so stripping them
  // here would break that comparison.
  deviceOrder: string[] | null;
  downloadedDictionary: unknown;
  dictionaryIndex: unknown;
  fileHashes: unknown;
  diffResult: unknown;
  movedEntries: unknown[];
  touchedFiles: unknown[];
  checklist: unknown[];
  groups: unknown;
  priority: unknown;
}

const initialState: WizardState = {
  port: null,
  deviceOrder: null,
  downloadedDictionary: null,
  dictionaryIndex: null,
  fileHashes: null,
  diffResult: null,
  movedEntries: [],
  touchedFiles: [],
  checklist: [],
  groups: null,
  priority: null,
};

interface WizardContextValue {
  state: WizardState;
  setState: Dispatch<SetStateAction<WizardState>>;
  currentStep: StepName;
  goToStep: (name: StepName) => void;
  // A snapshot found in localStorage at mount, held for the user to accept
  // or discard rather than applied silently — otherwise there would be no
  // way to start a clean run. Null once decided, or if there was nothing
  // worth resuming. See Step1Connect for the prompt.
  pendingResume: PersistedWizard | null;
  resume: () => void;
  discardResume: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initialState);
  const [currentStep, setCurrentStep] = useState<StepName>('connect');
  const [pendingResume, setPendingResume] = useState<PersistedWizard | null>(() => {
    const snapshot = loadPersisted();
    return snapshot && isWorthResuming(snapshot) ? snapshot : null;
  });

  // Persist on every change — EXCEPT while a resume decision is outstanding.
  // Without that guard this effect fires on mount with the empty
  // initialState and overwrites the very snapshot being offered, so the
  // Resume button would restore nothing.
  useEffect(() => {
    if (pendingResume) return;
    savePersisted(currentStep, state);
  }, [state, currentStep, pendingResume]);

  const goToStep = useCallback((name: StepName) => {
    setCurrentStep(name);
  }, []);

  const resume = useCallback(() => {
    if (!pendingResume) return;
    // Spread over the current state rather than replacing it: `port` is
    // never persisted, so this keeps whatever this session holds (nothing,
    // at mount) instead of clobbering it with undefined.
    setState((prev) => ({ ...prev, ...pendingResume.state }));
    setCurrentStep(pendingResume.currentStep);
    setPendingResume(null);
  }, [pendingResume]);

  const discardResume = useCallback(() => {
    clearPersisted();
    setPendingResume(null);
  }, []);

  return (
    <WizardContext.Provider
      value={{ state, setState, currentStep, goToStep, pendingResume, resume, discardResume }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard(): WizardContextValue {
  const value = useContext(WizardContext);
  if (!value) {
    throw new Error('useWizard must be used within a WizardProvider');
  }
  return value;
}
