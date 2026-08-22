import { afterEach, describe, expect, test } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SortTable from './SortTable.tsx';
import type { WordGroup } from './types.ts';

afterEach(() => {
  cleanup();
});

const priority = ['6-main.json', '1-personal.json', '9-misc.json'];
const protectedFiles = ['6-main.json'];

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
    render(<SortTable groups={groups} priority={priority} protectedFiles={protectedFiles} />);

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
    render(<SortTable groups={groups} priority={priority} protectedFiles={['6-main.json']} />);

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
    render(<SortTable groups={groups} priority={priority} protectedFiles={protectedFiles} />);

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
    render(<SortTable groups={groups} priority={priority} protectedFiles={protectedFiles} />);

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
    render(<SortTable groups={alphabetical} priority={priority} protectedFiles={protectedFiles} />);

    const table = screen.getByRole('table');
    const renderedWords = within(table)
      .getAllByText(/^(ant|cat)$/)
      .map((el) => el.textContent);

    expect(renderedWords).toEqual(['ant', 'cat']);
  });
});
