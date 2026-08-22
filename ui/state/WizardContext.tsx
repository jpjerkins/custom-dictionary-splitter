import { createContext, useCallback, useContext, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

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
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initialState);
  const [currentStep, setCurrentStep] = useState<StepName>('connect');

  const goToStep = useCallback((name: StepName) => {
    setCurrentStep(name);
  }, []);

  return (
    <WizardContext.Provider value={{ state, setState, currentStep, goToStep }}>
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
