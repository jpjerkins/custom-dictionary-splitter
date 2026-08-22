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
  props: { groups: WordGroup[]; priority?: string[]; protectedFiles?: string[] },
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
    renderSortTable({ groups });

    const catMiscRadio = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
      (radio) => radio.getAttribute('name') === 'cat'
    ) as HTMLInputElement;
    const catPersonalRadio = screen.getAllByRole('radio', { name: '1-personal.json' }).find(
      (radio) => radio.getAttribute('name') === 'cat'
    ) as HTMLInputElement;

    expect(catPersonalRadio.checked).toBe(true);
    expect(catMiscRadio.checked).toBe(false);

    fireEvent.click(catMiscRadio);

    expect(catMiscRadio.checked).toBe(true);
    expect(catPersonalRadio.checked).toBe(false);
  });

  test('delete removes the word', () => {
    renderSortTable({ groups });

    expect(screen.getByText('cat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete cat' }));

    expect(screen.queryByText('cat')).not.toBeInTheDocument();
    expect(screen.getByText('ant')).toBeInTheDocument();
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
        expect(probe.movedEntries).toEqual([{ stroke: 'PWAT', translation: 'bat', destinationFile: '1-personal.json' }]);
        expect(probe.touchedFiles).toEqual(['1-personal.json']);
        expect(probe.checklist).toEqual([]);
      });
    });
  });
});
