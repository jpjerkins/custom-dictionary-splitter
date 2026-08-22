import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { WizardProvider, useWizard } from '../state/WizardContext.tsx';
import Step1Connect from './Step1Connect.tsx';

const close = vi.fn().mockResolvedValue(undefined);
const fakePort = { close };

const connectToKeyboard = vi.fn();
const listDictionaries = vi.fn();
const downloadUserDictionary = vi.fn();

vi.mock('../serial/serial.ts', () => ({
  connectToKeyboard: (...args: unknown[]) => connectToKeyboard(...args),
  listDictionaries: (...args: unknown[]) => listDictionaries(...args),
  downloadUserDictionary: (...args: unknown[]) => downloadUserDictionary(...args),
}));

function CurrentStepProbe() {
  const { currentStep, state } = useWizard();
  return (
    <div>
      <span data-testid="current-step">{currentStep}</span>
      <span data-testid="port">{state.port === null ? 'null' : 'set'}</span>
    </div>
  );
}

describe('Step1Connect', () => {
  beforeEach(() => {
    connectToKeyboard.mockReset();
    listDictionaries.mockReset();
    downloadUserDictionary.mockReset();
    close.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('connect downloads the dictionary, closes the port, then advances to Diff', async () => {
    connectToKeyboard.mockResolvedValue(fakePort);
    listDictionaries.mockResolvedValue(['main', 'user_dictionary']);
    downloadUserDictionary.mockResolvedValue({ KAT: 'cat', TPHOG: 'dog' });

    render(
      <WizardProvider>
        <Step1Connect />
        <CurrentStepProbe />
      </WizardProvider>,
    );

    fireEvent.click(screen.getByText('Connect keyboard'));

    await waitFor(() => expect(screen.getByTestId('current-step').textContent).toBe('diff'));

    // The port must be closed before the wizard advances to the step that
    // hands the same keyboard off to lim.au.
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('port').textContent).toBe('null');
    expect(downloadUserDictionary).toHaveBeenCalledWith(fakePort, 'user_dictionary');
  });

  test('falls back to the last dictionary when no candidate name matches', async () => {
    connectToKeyboard.mockResolvedValue(fakePort);
    listDictionaries.mockResolvedValue(['main', 'commands', 'starboard']);
    downloadUserDictionary.mockResolvedValue({});

    render(
      <WizardProvider>
        <Step1Connect />
      </WizardProvider>,
    );

    fireEvent.click(screen.getByText('Connect keyboard'));

    await waitFor(() => expect(downloadUserDictionary).toHaveBeenCalledWith(fakePort, 'starboard'));
  });

  test('shows an error and stays on the connect step when connecting fails', async () => {
    connectToKeyboard.mockRejectedValue(new Error('no port selected'));

    render(
      <WizardProvider>
        <Step1Connect />
        <CurrentStepProbe />
      </WizardProvider>,
    );

    fireEvent.click(screen.getByText('Connect keyboard'));

    await waitFor(() => expect(screen.getByTestId('connect-status').textContent).toBe('Error: no port selected'));
    expect(screen.getByTestId('current-step').textContent).toBe('connect');
  });
});
