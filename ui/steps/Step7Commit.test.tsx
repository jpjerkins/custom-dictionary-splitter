import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { WizardProvider, useWizard } from '../state/WizardContext.tsx';
import Step7Commit from './Step7Commit.tsx';

function Seed() {
  const { setState } = useWizard();
  return (
    <button
      type="button"
      data-testid="seed"
      onClick={() =>
        setState((prev) => ({
          ...prev,
          movedEntries: [{ stroke: 'KAT', translation: 'cat' }],
          touchedFiles: ['1-nouns.json'],
        }))
      }
    >
      seed
    </button>
  );
}

function renderStep() {
  render(
    <WizardProvider>
      <Seed />
      <Step7Commit />
    </WizardProvider>,
  );
  fireEvent.click(screen.getByTestId('seed'));
}

describe('Step7Commit', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test('commits and reports the pushed status', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ committed: true, pushed: true }),
    });

    renderStep();
    fireEvent.click(screen.getByText('Commit & push'));

    await waitFor(() => expect(screen.getByTestId('commit-status').textContent).toBe('Committed and pushed.'));

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.message).toBe('Add 1 entries from Starboard: KAT');
    expect(body.files).toEqual(['1-nouns.json']);
  });

  test('surfaces a push failure as an error, not a success', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ committed: true, pushed: false, pushError: 'remote rejected' }),
    });

    renderStep();
    fireEvent.click(screen.getByText('Commit & push'));

    await waitFor(() =>
      expect(screen.getByTestId('commit-status').textContent).toBe(
        'Committed locally, but push failed: remote rejected',
      ),
    );
  });

  test('reports nothing-to-commit without claiming success', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ committed: false, message: 'Nothing to commit.' }),
    });

    renderStep();
    fireEvent.click(screen.getByText('Commit & push'));

    await waitFor(() => expect(screen.getByTestId('commit-status').textContent).toBe('Nothing to commit.'));
  });

  test('surfaces a non-ok response as an error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'git commit failed' }),
    });

    renderStep();
    fireEvent.click(screen.getByText('Commit & push'));

    await waitFor(() => expect(screen.getByTestId('commit-status').textContent).toBe('Error: git commit failed'));
  });
});
