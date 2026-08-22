import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RetryTable from './RetryTable.tsx';
import type { RetryRow } from './retry.ts';
import { WizardProvider, useWizard } from '../../state/WizardContext.tsx';
import type { WizardState } from '../../state/WizardContext.tsx';

afterEach(() => {
  cleanup();
});

function renderRetryTable(rows: RetryRow[], seed?: Partial<WizardState>) {
  function Seed() {
    const { setState } = useWizard();
    return (
      <button type="button" data-testid="seed" onClick={() => setState((prev) => ({ ...prev, ...seed }))}>
        seed
      </button>
    );
  }

  render(
    <WizardProvider>
      {seed && <Seed />}
      <RetryTable rows={rows} />
    </WizardProvider>
  );
  if (seed) fireEvent.click(screen.getByTestId('seed'));
}

describe('RetryTable', () => {
  test("a retry row's destination select is disabled", () => {
    renderRetryTable([
      { stroke: 'KAT', translation: 'cat', destinationFile: '1-personal.json', wasConflict: false },
    ]);

    expect(screen.getByLabelText('Destination for KAT')).toBeDisabled();
  });

  test('dropping a conflict row RESTORES the prior translation, not a remove', async () => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/api/save') {
        return { ok: true, json: async () => ({ results: [{ stroke: 'SPWANT', status: 'written' }] }) };
      }
      if (url === '/api/dictionaries') {
        return { ok: true, json: async () => ({ files: {}, index: {} }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderRetryTable(
      [
        {
          stroke: 'SPWANT',
          translation: 'ant',
          destinationFile: '9-misc.json',
          wasConflict: true,
          existingTranslation: 'aunt',
        },
      ],
      { fileHashes: { '9-misc.json': 'hash-1' } }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore prior value' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/save', expect.anything()));

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/api/save')!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.decisions).toEqual([
      { stroke: 'SPWANT', translation: 'aunt', destinationFile: '9-misc.json', capturedHash: 'hash-1' },
    ]);
    expect(body.decisions[0].remove).toBeUndefined();

    vi.unstubAllGlobals();
  });

  test('dropping a non-conflict row removes it (no restore)', async () => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/api/save') {
        return { ok: true, json: async () => ({ results: [{ stroke: 'KAT', status: 'written' }] }) };
      }
      if (url === '/api/dictionaries') {
        return { ok: true, json: async () => ({ files: {}, index: {} }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderRetryTable(
      [{ stroke: 'KAT', translation: 'cat', destinationFile: '1-personal.json', wasConflict: false }],
      { fileHashes: { '1-personal.json': 'hash-1' } }
    );

    expect(screen.getByRole('button', { name: 'Drop' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/save', expect.anything()));

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/api/save')!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.decisions).toEqual([
      { stroke: 'KAT', destinationFile: '1-personal.json', capturedHash: 'hash-1', remove: true },
    ]);

    await waitFor(() => expect(screen.queryByText('KAT')).not.toBeInTheDocument());

    vi.unstubAllGlobals();
  });
});
