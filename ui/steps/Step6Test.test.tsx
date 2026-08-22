import { useState } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WizardProvider, useWizard } from '../state/WizardContext.tsx';
import Step6Test from './Step6Test.tsx';

afterEach(() => {
  cleanup();
});

// Mirrors how the step-switching shell works: Step6Test only mounts once
// its movedEntries are already in wizard state, matching a real transition
// from Step 3 (Sort).
function Harness({ movedEntries }: { movedEntries: { stroke: string; translation: string }[] }) {
  const { setState } = useWizard();
  const [seeded, setSeeded] = useState(false);

  if (!seeded) {
    return (
      <button
        type="button"
        data-testid="seed"
        onClick={() => {
          setState((prev) => ({ ...prev, movedEntries }));
          setSeeded(true);
        }}
      >
        seed
      </button>
    );
  }

  return <Step6Test />;
}

function CurrentStepProbe() {
  const { currentStep } = useWizard();
  return <span data-testid="current-step">{currentStep}</span>;
}

describe('Step6Test', () => {
  test('a failing row blocks continue, and Go back to Sort routes to Sort', () => {
    render(
      <WizardProvider>
        <Harness movedEntries={[{ stroke: 'KAT', translation: 'cat' }]} />
        <CurrentStepProbe />
      </WizardProvider>,
    );
    fireEvent.click(screen.getByTestId('seed'));

    fireEvent.change(screen.getByLabelText('Actual translation for KAT'), { target: { value: 'dog' } });
    expect(screen.getByText('KAT').closest('tr')?.querySelector('.status-fail')).not.toBeNull();

    fireEvent.click(screen.getByText('All entries pass, continue'));
    expect(screen.getByTestId('test-status').textContent).toBe('Not all entries pass yet.');
    expect(screen.getByTestId('current-step').textContent).not.toBe('sort');

    fireEvent.click(screen.getByText('Go back to Sort'));
    expect(screen.getByTestId('current-step').textContent).toBe('sort');
  });

  test('all rows passing advances to Commit', () => {
    render(
      <WizardProvider>
        <Harness
          movedEntries={[
            { stroke: 'KAT', translation: 'cat' },
            { stroke: 'TPHOG', translation: 'dog' },
          ]}
        />
        <CurrentStepProbe />
      </WizardProvider>,
    );
    fireEvent.click(screen.getByTestId('seed'));

    fireEvent.change(screen.getByLabelText('Actual translation for KAT'), { target: { value: 'cat' } });
    fireEvent.change(screen.getByLabelText('Actual translation for TPHOG'), { target: { value: 'dog' } });

    fireEvent.click(screen.getByText('All entries pass, continue'));
    expect(screen.getByTestId('current-step').textContent).toBe('commit');
  });
});
