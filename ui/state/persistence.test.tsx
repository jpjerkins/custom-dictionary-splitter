import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WizardProvider, useWizard } from './WizardContext.tsx';
import { loadPersisted, savePersisted, clearPersisted, isWorthResuming } from './persistence.ts';
import type { WizardState } from './WizardContext.tsx';

const STORAGE_KEY = 'custom-dictionary-splitter:wizard';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function fullState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    port: null,
    deviceOrder: ['user_dictionary'],
    downloadedDictionary: { STKPW: 'zebra' },
    dictionaryIndex: null,
    fileHashes: { '5-user.json': 'hash' },
    diffResult: null,
    movedEntries: [{ stroke: 'STKPW', translation: 'zebra', destinationFile: '5-user.json' }],
    touchedFiles: ['5-user.json'],
    checklist: [{ stroke: 'STKPW', expected: 'zebra', actual: '', status: 'pending' }],
    groups: null,
    priority: null,
    ...overrides,
  };
}

describe('persistence', () => {
  test('never writes the 10MB dictionaryIndex, or the unserializable port', () => {
    // dictionaryIndex is roughly 10MB of stroke index against a ~5MB
    // localStorage quota — including it would make every write throw and
    // take the fields that matter down with it. Nothing reads it back.
    const heavy = fullState({ dictionaryIndex: { huge: 'x'.repeat(1000) }, port: { real: 'serialport' } });
    savePersisted('test', heavy);

    const raw = window.localStorage.getItem(STORAGE_KEY)!;
    expect(raw).not.toContain('dictionaryIndex');
    expect(raw).not.toContain('serialport');
    // ...but the fields Steps 6 and 7 actually consume are there.
    expect(loadPersisted()!.state.movedEntries).toHaveLength(1);
    expect(loadPersisted()!.state.touchedFiles).toEqual(['5-user.json']);
  });

  test('a snapshot from an incompatible version is discarded, not half-restored', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 999, currentStep: 'test', state: { movedEntries: [], touchedFiles: [], checklist: [] } })
    );
    expect(loadPersisted()).toBeNull();
  });

  test('a snapshot missing the arrays consumers index into is rejected', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, currentStep: 'test', state: { movedEntries: null, touchedFiles: [], checklist: [] } })
    );
    expect(loadPersisted()).toBeNull();
  });

  test('unparseable storage does not throw', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json {{{');
    expect(loadPersisted()).toBeNull();
  });

  test('a run that never left Step 1 with nothing moved is not worth resuming', () => {
    savePersisted('connect', fullState({ movedEntries: [] }));
    expect(isWorthResuming(loadPersisted()!)).toBe(false);

    savePersisted('test', fullState({ movedEntries: [] }));
    expect(isWorthResuming(loadPersisted()!)).toBe(true);
  });

  test('clearPersisted removes the snapshot', () => {
    savePersisted('test', fullState());
    clearPersisted();
    expect(loadPersisted()).toBeNull();
  });
});

function Harness() {
  const { state, currentStep, goToStep, setState, pendingResume, resume, discardResume } = useWizard();
  return (
    <div>
      <span data-testid="step">{currentStep}</span>
      <span data-testid="moved">{(state.movedEntries as unknown[]).length}</span>
      <span data-testid="pending">{pendingResume ? 'yes' : 'no'}</span>
      <button type="button" data-testid="resume" onClick={resume}>
        resume
      </button>
      <button type="button" data-testid="discard" onClick={discardResume}>
        discard
      </button>
      <button
        type="button"
        data-testid="advance"
        onClick={() => {
          setState((prev) => ({ ...prev, movedEntries: [{ stroke: 'K', translation: 'k' }] }));
          goToStep('test');
        }}
      >
        advance
      </button>
    </div>
  );
}

describe('WizardProvider resume', () => {
  test('offers a saved snapshot instead of applying it silently', () => {
    savePersisted('test', fullState());
    render(
      <WizardProvider>
        <Harness />
      </WizardProvider>
    );

    // Still on Step 1 with nothing loaded until the user says so.
    expect(screen.getByTestId('pending')).toHaveTextContent('yes');
    expect(screen.getByTestId('step')).toHaveTextContent('connect');
    expect(screen.getByTestId('moved')).toHaveTextContent('0');

    fireEvent.click(screen.getByTestId('resume'));

    expect(screen.getByTestId('step')).toHaveTextContent('test');
    expect(screen.getByTestId('moved')).toHaveTextContent('1');
    expect(screen.getByTestId('pending')).toHaveTextContent('no');
  });

  // THE TRAP: the persist effect runs on mount with the empty initialState.
  // Without a guard it overwrites the very snapshot being offered, and
  // Resume restores nothing.
  test('mounting does not overwrite the snapshot it is offering', () => {
    savePersisted('test', fullState());
    render(
      <WizardProvider>
        <Harness />
      </WizardProvider>
    );

    // Storage must still hold the saved run, not the empty mount state.
    expect(loadPersisted()!.state.movedEntries).toHaveLength(1);
    expect(loadPersisted()!.currentStep).toBe('test');

    fireEvent.click(screen.getByTestId('resume'));
    expect(screen.getByTestId('moved')).toHaveTextContent('1');
  });

  test('starting fresh clears the snapshot so it is not offered again', () => {
    savePersisted('test', fullState());
    render(
      <WizardProvider>
        <Harness />
      </WizardProvider>
    );

    fireEvent.click(screen.getByTestId('discard'));

    expect(screen.getByTestId('pending')).toHaveTextContent('no');
    expect(screen.getByTestId('step')).toHaveTextContent('connect');
    expect(screen.getByTestId('moved')).toHaveTextContent('0');
  });

  test('progress is written continuously once there is no decision outstanding', () => {
    render(
      <WizardProvider>
        <Harness />
      </WizardProvider>
    );
    expect(screen.getByTestId('pending')).toHaveTextContent('no');

    act(() => {
      fireEvent.click(screen.getByTestId('advance'));
    });

    const saved = loadPersisted()!;
    expect(saved.currentStep).toBe('test');
    expect(saved.state.movedEntries).toHaveLength(1);
  });

  test('nothing is offered when storage is empty', () => {
    render(
      <WizardProvider>
        <Harness />
      </WizardProvider>
    );
    expect(screen.getByTestId('pending')).toHaveTextContent('no');
  });
});
