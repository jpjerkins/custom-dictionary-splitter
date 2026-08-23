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
    // The gate now counts what is outstanding rather than restating the rule,
    // and treats skipped rows as settled.
    expect(screen.getByTestId('test-status').textContent).toBe('1 entry is still untested or failing.');
    expect(screen.getByTestId('current-step').textContent).not.toBe('sort');

    fireEvent.click(screen.getByText('Go back to Sort'));
    expect(screen.getByTestId('current-step').textContent).toBe('sort');
  });

  test('rows are ordered by word, not by the order the writes happened', () => {
    // movedEntries arrives grouped by destination file, which reads as
    // random when working down a long list.
    render(
      <WizardProvider>
        <Harness
          movedEntries={[
            { stroke: 'TPHOG', translation: 'dog' },
            { stroke: 'STKPW', translation: 'zebra' },
            { stroke: 'KAT', translation: 'cat' },
            { stroke: 'K-T', translation: 'cat' },
            { stroke: 'APL', translation: 'apple' },
          ]}
        />
      </WizardProvider>,
    );
    fireEvent.click(screen.getByTestId('seed'));

    const words = screen
      .getAllByRole('row')
      .slice(1) // drop the header row
      .map((row) => row.querySelectorAll('td')[1]!.textContent);
    expect(words).toEqual(['apple', 'cat', 'cat', 'dog', 'zebra']);

    // Two chords for the same word tie on the word, so the stroke breaks it.
    const strokes = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelectorAll('td')[0]!.textContent);
    expect(strokes.slice(1, 3)).toEqual(['K-T', 'KAT']);
  });

  test('a stroked answer passes despite the leading space steno inserts', () => {
    render(
      <WizardProvider>
        <Harness movedEntries={[{ stroke: 'KAT', translation: 'cat' }]} />
      </WizardProvider>,
    );
    fireEvent.click(screen.getByTestId('seed'));

    const box = screen.getByLabelText('Actual translation for KAT');
    fireEvent.change(box, { target: { value: ' cat' } });

    expect(screen.getByText('KAT').closest('tr')?.querySelector('.status-pass')).not.toBeNull();
    // The box still shows exactly what was typed.
    expect((box as HTMLInputElement).value).toBe(' cat');
  });

  test('clearing a row returns it to pending rather than leaving it failed', () => {
    render(
      <WizardProvider>
        <Harness movedEntries={[{ stroke: 'KAT', translation: 'cat' }]} />
      </WizardProvider>,
    );
    fireEvent.click(screen.getByTestId('seed'));

    const box = screen.getByLabelText('Actual translation for KAT');
    fireEvent.change(box, { target: { value: 'dog' } });
    expect(screen.getByText('KAT').closest('tr')?.querySelector('.status-fail')).not.toBeNull();

    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByText('KAT').closest('tr')?.querySelector('.status-pending')).not.toBeNull();
  });

  // Some entries cannot be produced by typing at all — a Plover formatting
  // entry like '{^`}' emits a backtick when stroked, never its own literal
  // text. Without a way to set one aside it would block Step 7 forever.
  test('an untestable row can be skipped, and skipping unblocks Continue', () => {
    render(
      <WizardProvider>
        <Harness
          movedEntries={[
            { stroke: 'KAT', translation: 'cat' },
            { stroke: 'TR-RL', translation: '{^`}' },
          ]}
        />
        <CurrentStepProbe />
      </WizardProvider>,
    );
    fireEvent.click(screen.getByTestId('seed'));

    fireEvent.change(screen.getByLabelText('Actual translation for KAT'), { target: { value: 'cat' } });

    // The formatting row can never pass, so Continue is blocked.
    fireEvent.click(screen.getByText('All entries pass, continue'));
    expect(screen.getByTestId('current-step').textContent).not.toBe('commit');
    expect(screen.getByTestId('test-status').textContent).toBe('1 entry is still untested or failing.');

    fireEvent.click(screen.getByLabelText('Skip TR-RL as untestable'));
    expect(screen.getByText('TR-RL').closest('tr')?.querySelector('.status-skipped')).not.toBeNull();

    fireEvent.click(screen.getByText('All entries pass, continue'));
    expect(screen.getByTestId('current-step').textContent).toBe('commit');
  });

  test('undoing a skip re-tests against what was already typed', () => {
    render(
      <WizardProvider>
        <Harness movedEntries={[{ stroke: 'KAT', translation: 'cat' }]} />
      </WizardProvider>,
    );
    fireEvent.click(screen.getByTestId('seed'));

    fireEvent.change(screen.getByLabelText('Actual translation for KAT'), { target: { value: 'cat' } });
    fireEvent.click(screen.getByLabelText('Skip KAT as untestable'));
    expect(screen.getByText('KAT').closest('tr')?.querySelector('.status-skipped')).not.toBeNull();

    // Undo must restore the PASS it already had, not drop back to pending.
    fireEvent.click(screen.getByLabelText('Test KAT after all'));
    expect(screen.getByText('KAT').closest('tr')?.querySelector('.status-pass')).not.toBeNull();
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
