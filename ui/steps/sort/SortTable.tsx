import { useState } from 'react';
import WordGroupRow from './WordGroupRow.tsx';
import type { WordGroup } from './types.ts';
import { hasUnresolvedConflicts } from '../../resolutions.ts';
import type { ResolutionChoice } from '../../resolutions.ts';

// The Step 3 (Sort) table. Filing an entry used to be a two-click <select>
// per row; this replaces it with one radio column per dictionary so filing
// is a single click. `priority` drives column order (leftmost = highest
// priority) and comes from GET /api/dictionaries. `groups` comes from
// POST /api/classify, which already sorts alphabetically by word — this
// component relies on that but does not re-sort, since re-sorting here
// would silently mask the API ever returning an unsorted list.
//
// Conflict resolutions are owned here (not lifted further up) because
// nothing outside the sort step needs to react to them mid-edit — only the
// Save gate, which lives right below the table, and `onSave`, which hands
// the resolved groups to the caller. `groups` is copied into local state on
// mount so resolution choices can be recorded per chord; if the `groups`
// prop itself changes later (e.g. a fresh classify), the caller should
// remount this component (e.g. via `key`) rather than expect it to re-sync.
export default function SortTable({
  groups: initialGroups,
  priority,
  protectedFiles,
  onSave,
}: {
  groups: WordGroup[];
  priority: string[];
  protectedFiles: string[];
  onSave?: (groups: WordGroup[]) => void;
}) {
  const [groups, setGroups] = useState(initialGroups);

  function handleResolveChord(word: string, stroke: string, resolution: ResolutionChoice | null) {
    setGroups((prev) =>
      prev.map((group) =>
        group.word === word
          ? {
              ...group,
              newChords: group.newChords.map((chord) =>
                chord.stroke === stroke ? { ...chord, resolution } : chord
              ),
            }
          : group
      )
    );
  }

  const blocked = hasUnresolvedConflicts(groups);

  return (
    <div className="sort-step">
      <div className="sort-table-scroll">
        <table className="entry-table sort-table">
          <thead>
            <tr>
              <th scope="col" className="chords-header">
                Chords
              </th>
              <th scope="col" className="word-header">
                Word
              </th>
              {priority.map((file) => {
                const isProtected = protectedFiles.includes(file);
                return (
                  <th
                    key={file}
                    scope="col"
                    className={isProtected ? 'dict-header dict-header-protected' : 'dict-header'}
                    title={isProtected ? `${file} (protected baseline — read only)` : file}
                  >
                    <span className="dict-header-label">{file}</span>
                    {isProtected && <span className="dict-header-badge">baseline</span>}
                  </th>
                );
              })}
              <th scope="col" className="delete-header">
                Delete
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <WordGroupRow
                key={group.word}
                group={group}
                priority={priority}
                protectedFiles={protectedFiles}
                onResolveChord={handleResolveChord}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="sort-table-actions">
        <button type="button" className="btn" disabled={blocked} onClick={() => onSave?.(groups)}>
          Save
        </button>
        {blocked && (
          <p className="sort-table-save-reason" role="status">
            Resolve all chord conflicts before saving.
          </p>
        )}
      </div>
    </div>
  );
}
