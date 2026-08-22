import type { ComponentType } from 'react';
import { WizardProvider, useWizard } from './state/WizardContext.tsx';
import type { StepName } from './state/WizardContext.tsx';
import Step1Connect from './steps/Step1Connect.tsx';
import Step2Diff from './steps/Step2Diff.tsx';
import Step3Sort from './steps/Step3Sort.tsx';
import Step4Empty from './steps/Step4Empty.tsx';
import Step5Flash from './steps/Step5Flash.tsx';
import Step6Test from './steps/Step6Test.tsx';
import Step7Commit from './steps/Step7Commit.tsx';

// Ported from public/app.js + public/js/state.js's showStep: instead of
// toggling `hidden` on seven pre-rendered <section>s and dispatching a
// `wizard:enter` DOM event, this mounts only the ONE component matching
// currentStep. Step2Diff and Step6Test rely on that — their data-loading
// effects run once per mount, replacing the old per-`wizard:enter` refetch.
const STEP_COMPONENTS: Record<StepName, ComponentType> = {
  connect: Step1Connect,
  diff: Step2Diff,
  sort: Step3Sort,
  empty: Step4Empty,
  flash: Step5Flash,
  test: Step6Test,
  commit: Step7Commit,
};

function WizardShell() {
  const { currentStep } = useWizard();
  const StepComponent = STEP_COMPONENTS[currentStep];
  return (
    <main style={{ padding: 'var(--space-6)', maxWidth: 720 }}>
      <h1>Custom Dictionary Splitter</h1>
      <StepComponent />
    </main>
  );
}

export default function App() {
  return (
    <WizardProvider>
      <WizardShell />
    </WizardProvider>
  );
}
