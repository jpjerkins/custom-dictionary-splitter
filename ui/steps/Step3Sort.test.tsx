import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WizardProvider, useWizard } from '../state/WizardContext.tsx';
import type { WizardState } from '../state/WizardContext.tsx';
import Step3Sort from './Step3Sort.tsx';

afterEach(() => {
  cleanup();
});

// Step3Sort's classify fetch runs once per mount (matching the
// step-switching shell's mount-only-the-active-step rule), so the seed must
// land in wizard state BEFORE Step3Sort itself mounts — mirrors
// Step6Test.test.tsx's Harness pattern.
function renderStep3Sort(seed: Partial<WizardState>) {
  function Harness() {
    const { setState } = useWizard();
    const [seeded, setSeeded] = useState(false);

    if (!seeded) {
      return (
        <button
          type="button"
          data-testid="seed"
          onClick={() => {
            setState((prev) => ({ ...prev, ...seed }));
            setSeeded(true);
          }}
        >
          seed
        </button>
      );
    }

    return <Step3Sort />;
  }

  render(
    <WizardProvider>
      <Harness />
    </WizardProvider>,
  );
  fireEvent.click(screen.getByTestId('seed'));
}

describe('Step3Sort', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/api/dictionaries') {
        return { ok: true, json: async () => ({ files: {}, index: {}, priority: [], protectedFiles: [] }) };
      }
      if (url === '/api/classify') {
        return { ok: true, json: async () => ({ groups: [], deviceOrderMismatch: false, deviceMissingFiles: [] }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("POST /api/classify's request body carries the device order Step 1 stored", async () => {
    renderStep3Sort({
      downloadedDictionary: { KAT: 'cat' },
      deviceOrder: ['6-main.json', '1-personal.json', 'user_dictionary'],
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/classify', expect.anything()));

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/api/classify')!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      downloaded: { KAT: 'cat' },
      deviceOrder: ['6-main.json', '1-personal.json', 'user_dictionary'],
    });
  });

  test('omits deviceOrder from the classify request when Step 1 never set one', async () => {
    renderStep3Sort({ downloadedDictionary: { KAT: 'cat' } });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/classify', expect.anything()));

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/api/classify')!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ downloaded: { KAT: 'cat' } });
  });
});
