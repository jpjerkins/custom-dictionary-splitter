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
        destinationFile={null}
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
        destinationFile={null}
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
        destinationFile={null}
        onChange={() => {}}
      />
    );

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
  });

  // The target file is the word's radio row (the `destinationFile` prop),
  // not a dropdown in this box — there is deliberately only one control on
  // the screen that files a word. These two tests are what stops that
  // dropdown quietly coming back.
  test('offers no target-file picker of its own', () => {
    render(
      <ConflictResolver
        word="ant"
        chord={conflictChord('2-other.json')}
        priority={priority}
        protectedFiles={protectedFiles}
        destinationFile={null}
        onChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /override/i }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  test('an override target that cannot outrank the shadowed file is rejected with a message', () => {
    const onChange = vi.fn();
    // 4-phil-nav.json sorts after 2-other.json in `priority`, so it cannot
    // outrank the shadowed file — the UI must say why, not silently accept it.
    const { rerender } = render(
      <ConflictResolver
        word="ant"
        chord={conflictChord('2-other.json')}
        priority={priority}
        protectedFiles={protectedFiles}
        destinationFile="4-phil-nav.json"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /override/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/outrank/i);
    // And it must not report this as a resolved conflict.
    expect(onChange).toHaveBeenLastCalledWith(null);

    // Moving the word's radio to a file that does outrank it clears the
    // error and resolves the conflict — no second control involved.
    rerender(
      <ConflictResolver
        word="ant"
        chord={conflictChord('2-other.json')}
        priority={priority}
        protectedFiles={protectedFiles}
        destinationFile="1-personal.json"
        onChange={onChange}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'override',
      targetFile: '1-personal.json',
      newStroke: undefined,
    });
  });

  test('with no radio picked, override points the user at the dictionary columns', () => {
    const onChange = vi.fn();
    render(
      <ConflictResolver
        word="ant"
        chord={conflictChord('2-other.json')}
        priority={priority}
        protectedFiles={protectedFiles}
        destinationFile={null}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /override/i }));

    // The domain wording ("override requires a target file") describes a
    // control this box no longer has; the screen must name the one it does.
    expect(screen.getByRole('alert')).toHaveTextContent(/destination dictionary/i);
    expect(onChange).toHaveBeenLastCalledWith(null);
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
    // The gate names the blocking word rather than restating the rule.
    expect(screen.getByText(/Resolve conflicts for:.*\bant\b/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /keep on-disk word/i }));

    expect(saveButton).not.toBeDisabled();
    expect(screen.queryByText(/Resolve conflicts for:/i)).not.toBeInTheDocument();
  });
});
