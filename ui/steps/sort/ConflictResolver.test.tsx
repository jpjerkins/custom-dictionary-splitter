import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ConflictResolver from './ConflictResolver.tsx';
import SortTable from './SortTable.tsx';
import type { NewChord, WordGroup } from './types.ts';
import { WizardProvider } from '../../state/WizardContext.tsx';

afterEach(() => {
  cleanup();
});

// Highest priority first, matching what GET /api/dictionaries returns and
// SortTable already threads through as column order.
const priority = ['1-personal.json', '2-other.json', '4-phil-nav.json', '6-main.json', '7-commands.json'];
const protectedFiles = ['6-main.json', '7-commands.json'];

function conflictChord(diskFile: string): NewChord {
  return { stroke: 'SPWANT', kind: 'chord-taken', diskWord: 'aunt', diskFile, resolution: null };
}

describe('ConflictResolver', () => {
  test('offers all four resolutions, with keep-keyboard disabled against a protected file', () => {
    render(
      <ConflictResolver
        word="ant"
        chord={conflictChord('6-main.json')}
        priority={priority}
        protectedFiles={protectedFiles}
        onChange={() => {}}
      />
    );

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(screen.getByRole('radio', { name: /use downloaded word/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /keep on-disk word/i })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: /different chord/i })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: /override/i })).not.toBeDisabled();
  });

  test('override is preselected when the shadowed entry is protected', () => {
    render(
      <ConflictResolver
        word="ant"
        chord={conflictChord('6-main.json')}
        priority={priority}
        protectedFiles={protectedFiles}
        onChange={() => {}}
      />
    );

    expect(screen.getByRole('radio', { name: /override/i })).toBeChecked();
  });

  test('nothing is preselected when the shadowed entry is one of the user\'s own files', () => {
    render(
      <ConflictResolver
        word="ant"
        chord={conflictChord('2-other.json')}
        priority={priority}
        protectedFiles={protectedFiles}
        onChange={() => {}}
      />
    );

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
  });

  test('an override target that cannot outrank the shadowed file is rejected with a message', () => {
    const onChange = vi.fn();
    render(
      <ConflictResolver
        word="ant"
        chord={conflictChord('2-other.json')}
        priority={priority}
        protectedFiles={protectedFiles}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /override/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /override target file/i }), {
      target: { value: '4-phil-nav.json' },
    });

    // 4-phil-nav.json sorts after 2-other.json in `priority`, so it cannot
    // outrank the shadowed file — the UI must say why, not silently accept it.
    expect(screen.getByRole('alert')).toHaveTextContent(/outrank/i);
    // And it must not report this as a resolved conflict.
    expect(onChange).toHaveBeenLastCalledWith(null);

    fireEvent.change(screen.getByRole('combobox', { name: /override target file/i }), {
      target: { value: '1-personal.json' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'override',
      targetFile: '1-personal.json',
      newStroke: undefined,
    });
  });

  test('Save is disabled while any conflict is unresolved, and enabled once all are resolved', () => {
    const groups: WordGroup[] = [
      {
        word: 'ant',
        existingChords: [],
        newChords: [conflictChord('2-other.json')],
        destinationFile: null,
        invariantWarning: null,
        priorityWarning: null,
      },
    ];

    render(
      <WizardProvider>
        <SortTable groups={groups} priority={priority} protectedFiles={protectedFiles} />
      </WizardProvider>
    );

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText(/resolve all chord conflicts/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /keep on-disk word/i }));

    expect(saveButton).not.toBeDisabled();
    expect(screen.queryByText(/resolve all chord conflicts/i)).not.toBeInTheDocument();
  });
});
