import WordGroupRow from './WordGroupRow.tsx';
import type { WordGroup } from './types.ts';

// The Step 3 (Sort) table. Filing an entry used to be a two-click <select>
// per row; this replaces it with one radio column per dictionary so filing
// is a single click. `priority` drives column order (leftmost = highest
// priority) and comes from GET /api/dictionaries. `groups` comes from
// POST /api/classify, which already sorts alphabetically by word — this
// component relies on that but does not re-sort, since re-sorting here
// would silently mask the API ever returning an unsorted list.
export default function SortTable({
  groups,
  priority,
  protectedFiles,
}: {
  groups: WordGroup[];
  priority: string[];
  protectedFiles: string[];
}) {
  return (
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
            <WordGroupRow key={group.word} group={group} priority={priority} protectedFiles={protectedFiles} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
