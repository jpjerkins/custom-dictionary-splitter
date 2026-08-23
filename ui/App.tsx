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

// The shell is a full-height flex column rather than a normal flowing page:
// Step 3 is a dense table that has to fill whatever vertical space the
// chrome leaves, and pinning its column headers requires a scroll container
// with a bounded height. Expressing that as a flex chain
// (.wizard-main > .wizard-step > .panel-fill > .sort-step >
// .sort-table-scroll, each flex:1 min-height:0) means the table measures the
// leftover space itself instead of a hard-coded viewport subtraction that
// silently goes wrong whenever a banner appears or the title rewraps.
// The other six steps just scroll inside .wizard-step as usual.
function WizardShell() {
  const { currentStep } = useWizard();
  const StepComponent = STEP_COMPONENTS[currentStep];
  return (
    <main className="wizard-main">
      <h1 className="wizard-title">Custom Dictionary Splitter</h1>
      <div className="wizard-step">
        <StepComponent />
      </div>
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
