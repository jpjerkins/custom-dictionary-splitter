import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SortTable from './SortTable.tsx';
import type { WordGroup } from './types.ts';
import { WizardProvider, useWizard } from '../../state/WizardContext.tsx';
import type { WizardState } from '../../state/WizardContext.tsx';

afterEach(() => {
  cleanup();
});

const priority = ['6-main.json', '1-personal.json', '9-misc.json'];
const protectedFiles = ['6-main.json'];

// SortTable reads/writes wizard state directly (fileHashes for capturedHash,
// movedEntries/touchedFiles/checklist after a save, goToStep on full
// success), so every render needs a WizardProvider. `seed` lets a test
// preload fileHashes/checklist the way a real transition from Diff would.
function renderSortTable(
  props: {
    groups: WordGroup[];
    priority?: string[];
    protectedFiles?: string[];
    deviceOrderMismatch?: boolean;
    deviceMissingFiles?: string[];
  },
  seed?: Partial<WizardState>
) {
  function Seed() {
    const { setState } = useWizard();
    return (
      <button type="button" data-testid="seed" onClick={() => setState((prev) => ({ ...prev, ...seed }))}>
        seed
      </button>
    );
  }

  function CurrentStepProbe() {
    const { currentStep } = useWizard();
    return <span data-testid="current-step">{currentStep}</span>;
  }

  render(
    <WizardProvider>
      {seed && <Seed />}
      <CurrentStepProbe />
      <SortTable
        groups={props.groups}
        priority={props.priority ?? priority}
        protectedFiles={props.protectedFiles ?? protectedFiles}
        deviceOrderMismatch={props.deviceOrderMismatch}
        deviceMissingFiles={props.deviceMissingFiles}
      />
    </WizardProvider>
  );
  if (seed) fireEvent.click(screen.getByTestId('seed'));
}

const groups: WordGroup[] = [
  {
    word: 'cat',
    existingChords: [
      { stroke: 'KAT', word: 'cat', file: '1-personal.json' },
      { stroke: 'K-T', word: 'cat', file: '1-personal.json' },
    ],
    newChords: [{ stroke: 'K-AT', kind: 'new', resolution: null }],
    destinationFile: '1-personal.json',
    invariantWarning: null,
    priorityWarning: null,
  },
  {
    word: 'ant',
    existingChords: [],
    newChords: [
      { stroke: 'SPWANT', kind: 'chord-taken', diskWord: 'aunt', diskFile: '9-misc.json', resolution: null },
    ],
    destinationFile: null,
    invariantWarning: null,
    priorityWarning: null,
  },
];

describe('SortTable', () => {
  test('renders one radio column per dictionary with rotated headers', () => {
    renderSortTable({ groups });

    // Rotation is applied via the `.dict-header` class in theme.css
    // (writing-mode: vertical-rl; transform: rotate(180deg)) rather than
    // inline styles, so assert the class jsdom won't compute the CSS for.
    for (const file of priority) {
      const header = screen.getByText(file).closest('th');
      expect(header).not.toBeNull();
      expect(header).toHaveClass('dict-header');
    }

    // Every group offers exactly one radio per dictionary column.
    const catRadios = screen.getAllByRole('radio', { name: /\.json$/ }).filter((radio) => radio.getAttribute('name') === 'cat');
    expect(catRadios).toHaveLength(priority.length);
  });

  test('protected dictionaries render as disabled columns', () => {
    renderSortTable({ groups, protectedFiles: ['6-main.json'] });

    const protectedRadios = screen.getAllByRole('radio', { name: /6-main\.json/ });
    expect(protectedRadios.length).toBeGreaterThan(0);
    for (const radio of protectedRadios) {
      expect(radio).toBeDisabled();
    }

    const unprotectedRadios = screen.getAllByRole('radio', { name: /1-personal\.json/ });
    for (const radio of unprotectedRadios) {
      expect(radio).not.toBeDisabled();
    }
  });

  test('all chords for a word share one radio group and one delete button', () => {
    renderSortTable({ groups });

    // "cat" has 3 chords (2 existing + 1 new) but must produce only one
    // radio per dictionary column (not one per chord) and one delete button.
    const catRadios = screen.getAllByRole('radio').filter((radio) => radio.getAttribute('name') === 'cat');
    expect(catRadios).toHaveLength(priority.length);

    const deleteButtons = screen.getAllByRole('button', { name: /Delete cat/ });
    expect(deleteButtons).toHaveLength(1);

    // All radios for "cat" share the same name, forming a single group.
    const names = new Set(catRadios.map((radio) => radio.getAttribute('name')));
    expect(names.size).toBe(1);
  });

  test('existing on-disk chords render greyed inside the group', () => {
    renderSortTable({ groups });

    const existingRow = screen.getByText('KAT').closest('tr');
    const newRow = screen.getByText('K-AT').closest('tr');
    expect(existingRow).not.toBeNull();
    expect(newRow).not.toBeNull();
    expect(existingRow).toHaveClass('word-group-row-existing');
    expect(newRow).not.toHaveClass('word-group-row-existing');
  });

  test('groups render in alphabetical order by word', () => {
    // The API is responsible for the alphabetical sort; this asserts the
    // component preserves the order it's given (document order matches the
    // groups prop order) rather than silently reshuffling.
    const alphabetical = [...groups].sort((a, b) => a.word.localeCompare(b.word));
    renderSortTable({ groups: alphabetical });

    const table = screen.getByRole('table');
    const renderedWords = within(table)
      .getAllByText(/^(ant|cat)$/)
      .map((el) => el.textContent);

    expect(renderedWords).toEqual(['ant', 'cat']);
  });

  test('selecting a radio records that word\'s destination', () => {
    // "ant" has no existingChords, so picking any writable file records the
    // choice directly — no move/split prompt to interpose (that's a
    // separate scenario, covered under "Move word" below).
    renderSortTable({ groups });

    const antMiscRadio = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
      (radio) => radio.getAttribute('name') === 'ant'
    ) as HTMLInputElement;
    const antPersonalRadio = screen.getAllByRole('radio', { name: '1-personal.json' }).find(
      (radio) => radio.getAttribute('name') === 'ant'
    ) as HTMLInputElement;

    expect(antMiscRadio.checked).toBe(false);
    expect(antPersonalRadio.checked).toBe(false);

    fireEvent.click(antMiscRadio);

    expect(antMiscRadio.checked).toBe(true);
    expect(antPersonalRadio.checked).toBe(false);
  });

  test('delete asks for confirmation inline and only removes on confirm', () => {
    renderSortTable({ groups });

    expect(screen.getByText('cat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete cat' }));

    // First click swaps in Confirm?/Cancel rather than deleting outright.
    expect(screen.getByText('cat')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Confirm delete cat' });
    expect(screen.getByRole('button', { name: 'Cancel delete cat' })).toBeInTheDocument();

    fireEvent.click(confirmButton);

    expect(screen.queryByText('cat')).not.toBeInTheDocument();
    expect(screen.getByText('ant')).toBeInTheDocument();
  });

  test('cancelling a delete leaves the group intact', () => {
    renderSortTable({ groups });

    fireEvent.click(screen.getByRole('button', { name: 'Delete cat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel delete cat' }));

    expect(screen.getByText('cat')).toBeInTheDocument();
    // Back to the plain delete button, not stuck mid-confirmation.
    expect(screen.getByRole('button', { name: 'Delete cat' })).toBeInTheDocument();
  });

  describe('Save', () => {
    const savableGroups: WordGroup[] = [
      {
        word: 'bat',
        existingChords: [],
        newChords: [{ stroke: 'PWAT', kind: 'new', resolution: null }],
        destinationFile: '1-personal.json',
        invariantWarning: null,
        priorityWarning: null,
      },
    ];

    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function mockFetch(saveResults: { stroke: string; status: string; reason?: string }[]) {
      (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
        if (url === '/api/save') {
          return { ok: true, json: async () => ({ results: saveResults }) };
        }
        if (url === '/api/dictionaries') {
          return {
            ok: true,
            json: async () => ({
              files: { '1-personal.json': { hash: 'hash-2' } },
              index: {},
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
    }

    test('SAVE posts the right decision shape', async () => {
      mockFetch([{ stroke: 'PWAT', status: 'written' }]);
      renderSortTable({ groups: savableGroups }, { fileHashes: { '1-personal.json': 'hash-1' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/save', expect.anything()));

      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/api/save')!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.decisions).toEqual([
        { stroke: 'PWAT', translation: 'bat', destinationFile: '1-personal.json', capturedHash: 'hash-1' },
      ]);
    });

    test('a stale result keeps that row visible with its reason while successful rows disappear', async () => {
      const twoGroups: WordGroup[] = [
        ...savableGroups,
        {
          word: 'cow',
          existingChords: [],
          newChords: [{ stroke: 'KOU', kind: 'new', resolution: null }],
          destinationFile: '1-personal.json',
          invariantWarning: null,
          priorityWarning: null,
        },
      ];
      mockFetch([
        { stroke: 'PWAT', status: 'stale', reason: '1-personal.json changed since diff; re-run diff' },
        { stroke: 'KOU', status: 'written' },
      ]);
      renderSortTable({ groups: twoGroups }, { fileHashes: { '1-personal.json': 'hash-1' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.queryByText('cow')).not.toBeInTheDocument());
      expect(screen.getByText('bat')).toBeInTheDocument();
      expect(screen.getByText(/changed since diff/)).toBeInTheDocument();
    });

    test('movedEntries, touchedFiles, and checklist are updated on success', async () => {
      mockFetch([{ stroke: 'PWAT', status: 'written' }]);

      function StateProbe() {
        const { state } = useWizard();
        return (
          <div data-testid="state-probe">
            {JSON.stringify({
              movedEntries: state.movedEntries,
              touchedFiles: state.touchedFiles,
              checklist: state.checklist,
            })}
          </div>
        );
      }

      function Seed() {
        const { setState } = useWizard();
        return (
          <button
            type="button"
            data-testid="seed"
            onClick={() =>
              setState((prev) => ({
                ...prev,
                fileHashes: { '1-personal.json': 'hash-1' },
                checklist: [{ stroke: 'PWAT', expected: 'bat', actual: '', status: 'pending' }],
              }))
            }
          >
            seed
          </button>
        );
      }

      render(
        <WizardProvider>
          <Seed />
          <StateProbe />
          <SortTable groups={savableGroups} priority={priority} protectedFiles={protectedFiles} />
        </WizardProvider>
      );
      fireEvent.click(screen.getByTestId('seed'));

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        const probe = JSON.parse(screen.getByTestId('state-probe').textContent!);
        expect(probe.movedEntries).toEqual([
          { stroke: 'PWAT', translation: 'bat', destinationFile: '1-personal.json', wasConflict: false },
        ]);
        expect(probe.touchedFiles).toEqual(['1-personal.json']);
        expect(probe.checklist).toEqual([]);
      });
    });
  });

  test('editing a chord re-runs conflict detection', () => {
    const editableGroups: WordGroup[] = [
      {
        word: 'bat',
        existingChords: [],
        newChords: [{ stroke: 'PWAT', kind: 'new', resolution: null }],
        destinationFile: '1-personal.json',
        invariantWarning: null,
        priorityWarning: null,
      },
      {
        word: 'cow',
        existingChords: [],
        newChords: [{ stroke: 'KOU', kind: 'new', resolution: null }],
        destinationFile: '1-personal.json',
        invariantWarning: null,
        priorityWarning: null,
      },
    ];
    renderSortTable({ groups: editableGroups });

    fireEvent.click(screen.getByRole('button', { name: 'Edit stroke PWAT' }));
    const input = screen.getByLabelText('Edit stroke for bat');

    // Typing the OTHER pending chord's stroke is a live collision within
    // this same batch — flag it and block Save, without touching the
    // server (no classify against disk has anything to say about it).
    fireEvent.change(input, { target: { value: 'KOU' } });
    expect(screen.getByText(/already used for "cow"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'TPWAT' } });
    expect(screen.queryByText(/already used for "cow"/)).not.toBeInTheDocument();

    fireEvent.blur(input);
    expect(screen.getByText('TPWAT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  test('a device-order mismatch renders a warning banner', () => {
    renderSortTable({ groups, deviceOrderMismatch: true });
    expect(screen.getByText(/dictionary order doesn't match/)).toBeInTheDocument();
  });

  test('deviceMissingFiles renders a different warning than a device-order mismatch', () => {
    renderSortTable({ groups, deviceMissingFiles: ['9-misc.json'] });
    expect(screen.getByText(/firmware doesn't have these dictionaries loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/dictionary order doesn't match/)).not.toBeInTheDocument();
  });

  describe('Move word', () => {
    const splitGroups: WordGroup[] = [
      {
        word: 'cat',
        existingChords: [{ stroke: 'KAT', word: 'cat', file: '1-personal.json' }],
        newChords: [{ stroke: 'K-AT', kind: 'new', resolution: null }],
        destinationFile: '1-personal.json',
        invariantWarning: null,
        priorityWarning: null,
      },
    ];

    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    test('moving a group off its word file offers move-all or split-anyway', () => {
      renderSortTable({ groups: splitGroups });

      const miscRadio = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
        (radio) => radio.getAttribute('name') === 'cat'
      ) as HTMLInputElement;
      fireEvent.click(miscRadio);

      expect(screen.getByRole('button', { name: 'Move all' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Split anyway' })).toBeInTheDocument();
      // Nothing applied yet — the radio itself hasn't moved to the new file.
      expect(miscRadio.checked).toBe(false);
    });

    test('split anyway files the new chord without moving the existing ones', () => {
      renderSortTable({ groups: splitGroups });

      const miscRadio = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
        (radio) => radio.getAttribute('name') === 'cat'
      ) as HTMLInputElement;
      fireEvent.click(miscRadio);
      fireEvent.click(screen.getByRole('button', { name: 'Split anyway' }));

      expect(miscRadio.checked).toBe(true);
      expect(screen.queryByRole('button', { name: 'Move all' })).not.toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    });

    test('move all calls POST /api/move-word and relocates the existing chords', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      renderSortTable({ groups: splitGroups }, { fileHashes: { '1-personal.json': 'h1', '9-misc.json': 'h2' } });

      const miscRadio = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
        (radio) => radio.getAttribute('name') === 'cat'
      ) as HTMLInputElement;
      fireEvent.click(miscRadio);
      fireEvent.click(screen.getByRole('button', { name: 'Move all' }));

      await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/move-word', expect.anything()));

      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toEqual({
        word: 'cat',
        fromFile: '1-personal.json',
        toFile: '9-misc.json',
        capturedHashes: { '1-personal.json': 'h1', '9-misc.json': 'h2' },
      });

      await waitFor(() => expect(miscRadio.checked).toBe(true));
      expect(screen.queryByRole('button', { name: 'Move all' })).not.toBeInTheDocument();
    });

    test('a partial move-word result is surfaced clearly and never treated as success', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'partial',
          reason: "'cat' was written to 9-misc.json but could not be removed from 1-personal.json",
        }),
      });

      renderSortTable({ groups: splitGroups }, { fileHashes: { '1-personal.json': 'h1', '9-misc.json': 'h2' } });

      const miscRadio = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
        (radio) => radio.getAttribute('name') === 'cat'
      ) as HTMLInputElement;
      fireEvent.click(miscRadio);
      fireEvent.click(screen.getByRole('button', { name: 'Move all' }));

      await waitFor(() => expect(screen.getByText(/BOTH files/)).toBeInTheDocument());
      // The prompt stays up (not silently dismissed as if it succeeded) and
      // the radio was never applied.
      expect(screen.getByRole('button', { name: 'Move all' })).toBeInTheDocument();
      expect(miscRadio.checked).toBe(false);
    });

    test('a successful move refreshes hashes so a subsequent Save is not rejected as stale', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
        if (url === '/api/move-word') {
          return { ok: true, json: async () => ({ status: 'ok' }) };
        }
        if (url === '/api/dictionaries') {
          return {
            ok: true,
            json: async () => ({
              files: { '1-personal.json': { hash: 'h1-fresh' }, '9-misc.json': { hash: 'h2-fresh' } },
              index: {},
            }),
          };
        }
        if (url === '/api/save') {
          return { ok: true, json: async () => ({ results: [{ stroke: 'K-AT', status: 'written' }] }) };
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

      renderSortTable({ groups: splitGroups }, { fileHashes: { '1-personal.json': 'h1', '9-misc.json': 'h2' } });

      const miscRadio = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
        (radio) => radio.getAttribute('name') === 'cat'
      ) as HTMLInputElement;
      fireEvent.click(miscRadio);
      fireEvent.click(screen.getByRole('button', { name: 'Move all' }));

      // Wait for the move to fully land (the radio only flips once
      // handleMoveAll's setGroups runs, which is after refreshDictionaries).
      await waitFor(() => expect(miscRadio.checked).toBe(true));

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/save', expect.anything()));

      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/api/save')!;
      const body = JSON.parse((init as RequestInit).body as string);
      // The pre-move seeded hash was 'h2' — if the move hadn't refreshed
      // fileHashes, this decision would still carry that stale value.
      expect(body.decisions[0].capturedHash).toBe('h2-fresh');
      expect(body.decisions[0].capturedHash).not.toBe('h2');
    });

    test('a successful move adds both the destination and the source file to touchedFiles', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
        if (url === '/api/move-word') {
          return { ok: true, json: async () => ({ status: 'ok' }) };
        }
        if (url === '/api/dictionaries') {
          return {
            ok: true,
            json: async () => ({
              files: { '1-personal.json': { hash: 'h1-fresh' }, '9-misc.json': { hash: 'h2-fresh' } },
              index: {},
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      });

      function TouchedFilesProbe() {
        const { state } = useWizard();
        return <div data-testid="touched-files">{JSON.stringify(state.touchedFiles)}</div>;
      }

      render(
        <WizardProvider>
          <TouchedFilesProbe />
          <SortTable groups={splitGroups} priority={priority} protectedFiles={protectedFiles} />
        </WizardProvider>
      );

      const miscRadio = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
        (radio) => radio.getAttribute('name') === 'cat'
      ) as HTMLInputElement;
      fireEvent.click(miscRadio);
      fireEvent.click(screen.getByRole('button', { name: 'Move all' }));

      // Asserts what Step 7 would actually POST to /api/commit as `files` —
      // both the destination the word moved to and the source it moved out
      // of, so `git add -- <files>` stages the deletion, not just the add.
      await waitFor(() => {
        const touchedFiles = JSON.parse(screen.getByTestId('touched-files').textContent!);
        expect(touchedFiles).toEqual(expect.arrayContaining(['9-misc.json', '1-personal.json']));
      });
    });
  });
});
