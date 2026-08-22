import { describe, expect, test } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WizardProvider, useWizard } from './WizardContext.tsx';

function Probe() {
  const { state, setState, currentStep, goToStep } = useWizard();
  return (
    <div>
      <span data-testid="current-step">{currentStep}</span>
      <span data-testid="port">{state.port === null ? 'null' : 'set'}</span>
      <button type="button" onClick={() => setState((prev) => ({ ...prev, port: 'fake-port' }))}>
        set port
      </button>
      <button type="button" onClick={() => goToStep('sort')}>
        go to sort
      </button>
    </div>
  );
}

describe('WizardContext', () => {
  test('goToStep updates currentStep and state survives the transition', () => {
    render(
      <WizardProvider>
        <Probe />
      </WizardProvider>,
    );

    expect(screen.getByTestId('current-step').textContent).toBe('connect');

    fireEvent.click(screen.getByText('set port'));
    expect(screen.getByTestId('port').textContent).toBe('set');

    fireEvent.click(screen.getByText('go to sort'));

    expect(screen.getByTestId('current-step').textContent).toBe('sort');
    // State set before the transition must survive it.
    expect(screen.getByTestId('port').textContent).toBe('set');
  });
});
