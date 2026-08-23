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

  // The conflict box has no target-file dropdown any more — the word's radio
  // row is the only control that files it. These cover the seam that move
  // created: an auto-preselected `override` has to arrive with a valid
  // destination already ticked, or it would block Save on a choice the UI
  // made for the user.
  describe('override target comes from the radio row', () => {
    const protectedConflict: WordGroup[] = [
      {
        word: 'ant',
        existingChords: [],
        newChords: [
          { stroke: 'SPWANT', kind: 'chord-taken', diskWord: 'aunt', diskFile: '6-main.json', resolution: null },
        ],
        destinationFile: null,
        invariantWarning: null,
        priorityWarning: null,
      },
    ];

    test('a conflict shadowed by a protected file arrives with a valid destination ticked, and Save unblocked', () => {
      renderSortTable({ groups: protectedConflict });

      // 6-main.json is protected, so `override` is preselected. priority is
      // ['6-main.json', '1-personal.json', '9-misc.json'], so the only
      // writable file that outranks 6-main.json is... none of them by index.
      // 1-personal.json ranks BELOW 6-main.json here, so no valid target
      // exists and the row must stay blocked rather than silently no-op.
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    test('picks the writable file sitting immediately above the shadowed one', () => {
      // Both 1-personal.json and 9-misc.json outrank the protected
      // 6-main.json, so both are legitimate override targets. The default
      // must be the NEAREST one above it (9-misc.json), not the
      // highest-priority one — an override should win by the smallest
      // margin that works rather than also shadowing everything between.
      renderSortTable({
        groups: protectedConflict,
        priority: ['1-personal.json', '9-misc.json', '6-main.json'],
        protectedFiles: ['6-main.json'],
      });

      const nearest = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
        (radio) => radio.getAttribute('name') === 'ant'
      ) as HTMLInputElement;
      const strongest = screen.getAllByRole('radio', { name: '1-personal.json' }).find(
        (radio) => radio.getAttribute('name') === 'ant'
      ) as HTMLInputElement;
      expect(nearest.checked).toBe(true);
      expect(strongest.checked).toBe(false);
      expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
    });

    test('a destination already preset by /api/classify is never overwritten', () => {
      renderSortTable({
        groups: [{ ...protectedConflict[0]!, destinationFile: '9-misc.json' }],
        priority: ['1-personal.json', '9-misc.json', '6-main.json'],
        protectedFiles: ['6-main.json'],
      });

      const preset = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
        (radio) => radio.getAttribute('name') === 'ant'
      ) as HTMLInputElement;
      expect(preset.checked).toBe(true);
    });
  });

  // Green = the user filed this word; yellow = it's sitting on a filing the
  // app chose for them; neutral = still needs a decision. The distinction is
  // provenance, not completeness, so these assert the CLASS on the row
  // rather than any rendered colour (jsdom computes no CSS).
  describe('row status tint', () => {
    function rowClassesFor(word: string): string[] {
      return screen
        .getAllByRole('row')
        .filter((row) => within(row).queryByText(word) !== null)
        .map((row) => row.className);
    }

    test('a word preset by /api/classify reads as suggested, not decided', () => {
      renderSortTable({ groups });

      // 'cat' arrives with destinationFile: '1-personal.json' from the API.
      for (const className of rowClassesFor('cat')) {
        expect(className).toContain('word-group-row-suggested');
        expect(className).not.toContain('word-group-row-decided');
      }
    });

    test('a word with an unresolved conflict reads as blocked', () => {
      renderSortTable({ groups });

      // 'ant' arrives with an unresolved conflict against 9-misc.json,
      // which is not protected — so no override is preselected and nothing
      // resolves it. It is what stops Save, so it must say so.
      for (const className of rowClassesFor('ant')) {
        expect(className).toContain('word-group-row-blocked');
      }
    });

    // THE REGRESSION. Filing a word is per-WORD; resolving a conflict is
    // per-CHORD. Marking the word decided on a radio click painted it green
    // while its conflict was still null, so a table where every row read
    // "done" refused to save and named nothing. Green must mean "this word
    // will be written", never "the user clicked something on this row".
    test('picking a destination does NOT turn a word green while its conflict is unresolved', () => {
      renderSortTable({ groups });

      const antRadio = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
        (radio) => radio.getAttribute('name') === 'ant'
      ) as HTMLInputElement;
      fireEvent.click(antRadio);

      expect(antRadio.checked).toBe(true);
      for (const className of rowClassesFor('ant')) {
        expect(className).toContain('word-group-row-blocked');
        expect(className).not.toContain('word-group-row-decided');
      }
      expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    });

    test('resolving the conflict then releases the word to green', () => {
      renderSortTable({ groups });

      fireEvent.click(
        screen.getAllByRole('radio', { name: '9-misc.json' }).find(
          (radio) => radio.getAttribute('name') === 'ant'
        ) as HTMLInputElement
      );
      fireEvent.click(screen.getByRole('radio', { name: /keep on-disk word/i }));

      for (const className of rowClassesFor('ant')) {
        expect(className).toContain('word-group-row-decided');
        expect(className).not.toContain('word-group-row-blocked');
      }
    });

    test('clicking a radio flips a conflict-free word to decided, and only that word', () => {
      renderSortTable({ groups });

      // 'cat' has only a 'new' chord, so nothing blocks it.
      const catRadio = screen.getAllByRole('radio', { name: '1-personal.json' }).find(
        (radio) => radio.getAttribute('name') === 'cat'
      ) as HTMLInputElement;
      fireEvent.click(catRadio);

      for (const className of rowClassesFor('cat')) {
        expect(className).toContain('word-group-row-decided');
      }
      // 'ant' was not touched and is still blocked.
      for (const className of rowClassesFor('ant')) {
        expect(className).not.toContain('word-group-row-decided');
      }
    });

    test('the save gate names the words that are blocking it', () => {
      renderSortTable({ groups });

      expect(screen.getByText(/Resolve conflicts for:.*\bant\b/)).toBeInTheDocument();
      // 'cat' is not blocking, so it must not be named.
      expect(screen.queryByText(/Resolve conflicts for:.*\bcat\b/)).not.toBeInTheDocument();
    });

    test('confirming the suggested file still counts as deciding', () => {
      renderSortTable({ groups });

      // Re-picking what was already suggested is a confirmation, not a no-op.
      const catRadio = screen.getAllByRole('radio', { name: '1-personal.json' }).find(
        (radio) => radio.getAttribute('name') === 'cat'
      ) as HTMLInputElement;
      fireEvent.click(catRadio);

      for (const className of rowClassesFor('cat')) {
        expect(className).toContain('word-group-row-decided');
      }
    });

    test('an auto-preselected override stays yellow until the user touches it', () => {
      // The trap this guards: ConflictResolver reports its preselected
      // override through onChange from a MOUNT EFFECT. If that data signal
      // were treated as intent, every protected-file conflict would render
      // green on first paint without the user doing anything.
      renderSortTable({
        groups: [
          {
            word: 'ant',
            existingChords: [],
            newChords: [
              { stroke: 'SPWANT', kind: 'chord-taken', diskWord: 'aunt', diskFile: '6-main.json', resolution: null },
            ],
            destinationFile: null,
            invariantWarning: null,
            priorityWarning: null,
          },
        ],
        priority: ['1-personal.json', '9-misc.json', '6-main.json'],
        protectedFiles: ['6-main.json'],
      });

      expect(screen.getByRole('radio', { name: /override/i })).toBeChecked();
      for (const className of rowClassesFor('ant')) {
        expect(className).toContain('word-group-row-suggested');
        expect(className).not.toContain('word-group-row-decided');
      }

      // Picking a resolution by hand is intent, and flips it green.
      fireEvent.click(screen.getByRole('radio', { name: /keep on-disk word/i }));
      for (const className of rowClassesFor('ant')) {
        expect(className).toContain('word-group-row-decided');
      }
    });
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

    // Abandoning the prompt by picking somewhere else must leave the word
    // that raised it exactly as it was found — the prompt is a question, and
    // walking away from a question is not an answer.
    describe('abandoning the prompt', () => {
      const twoWords: WordGroup[] = [
        ...splitGroups,
        {
          word: 'ant',
          existingChords: [],
          newChords: [{ stroke: 'SPWANT', kind: 'new', resolution: null }],
          destinationFile: null,
          invariantWarning: null,
          priorityWarning: null,
        },
      ];

      function rowClassesFor(word: string): string[] {
        return screen
          .getAllByRole('row')
          .filter((row) => within(row).queryByText(word) !== null)
          .map((row) => row.className);
      }

      test('picking another word dismisses the prompt and reverts the trigger row', () => {
        renderSortTable({ groups: twoWords });

        // 'cat' lives in 1-personal.json, so filing it to 9-misc.json is a
        // split and raises the prompt.
        const catMisc = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
          (radio) => radio.getAttribute('name') === 'cat'
        ) as HTMLInputElement;
        fireEvent.click(catMisc);
        expect(screen.getByRole('button', { name: 'Move all' })).toBeInTheDocument();

        // Now file a different word instead, never answering the question.
        const antMisc = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
          (radio) => radio.getAttribute('name') === 'ant'
        ) as HTMLInputElement;
        fireEvent.click(antMisc);

        expect(screen.queryByRole('button', { name: 'Move all' })).not.toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

        // 'cat' is back to how it was before the click: original file still
        // selected, and no longer tinted as a decision the user made.
        expect(catMisc.checked).toBe(false);
        const catPersonal = screen.getAllByRole('radio', { name: '1-personal.json' }).find(
          (radio) => radio.getAttribute('name') === 'cat'
        ) as HTMLInputElement;
        expect(catPersonal.checked).toBe(true);
        for (const className of rowClassesFor('cat')) {
          expect(className).not.toContain('word-group-row-decided');
        }

        // ...while the word actually picked is decided.
        expect(antMisc.checked).toBe(true);
        for (const className of rowClassesFor('ant')) {
          expect(className).toContain('word-group-row-decided');
        }
      });

      test('a word that was already decided stays decided when its prompt is abandoned', () => {
        renderSortTable({ groups: twoWords });

        // Decide 'cat' legitimately first (its own file — no split).
        const catPersonal = screen.getAllByRole('radio', { name: '1-personal.json' }).find(
          (radio) => radio.getAttribute('name') === 'cat'
        ) as HTMLInputElement;
        fireEvent.click(catPersonal);
        for (const className of rowClassesFor('cat')) {
          expect(className).toContain('word-group-row-decided');
        }

        // Raise a prompt, then abandon it. Reverting must restore the state
        // before THAT click, not blanket-clear the word's decided status.
        fireEvent.click(
          screen.getAllByRole('radio', { name: '9-misc.json' }).find(
            (radio) => radio.getAttribute('name') === 'cat'
          ) as HTMLInputElement
        );
        fireEvent.click(
          screen.getAllByRole('radio', { name: '9-misc.json' }).find(
            (radio) => radio.getAttribute('name') === 'ant'
          ) as HTMLInputElement
        );

        for (const className of rowClassesFor('cat')) {
          expect(className).toContain('word-group-row-decided');
        }
        expect(catPersonal.checked).toBe(true);
      });

      test('re-picking the same word replaces the prompt but keeps the true starting state', () => {
        renderSortTable({ groups: twoWords });

        const catMisc = screen.getAllByRole('radio', { name: '9-misc.json' }).find(
          (radio) => radio.getAttribute('name') === 'cat'
        ) as HTMLInputElement;
        const catMain = screen.getAllByRole('radio', { name: '6-main.json' }).find(
          (radio) => radio.getAttribute('name') === 'cat'
        ) as HTMLInputElement;

        fireEvent.click(catMisc);
        // 6-main.json is protected/disabled, so bounce off 9-misc and back:
        // raise the prompt twice for the same word.
        fireEvent.click(catMisc);
        expect(catMain).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Move all' })).toBeInTheDocument();

        // Abandon it. The second prompt must have carried the ORIGINAL
        // "was not decided" forward, not the value after the first click.
        fireEvent.click(
          screen.getAllByRole('radio', { name: '9-misc.json' }).find(
            (radio) => radio.getAttribute('name') === 'ant'
          ) as HTMLInputElement
        );

        for (const className of rowClassesFor('cat')) {
          expect(className).not.toContain('word-group-row-decided');
        }
      });
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
