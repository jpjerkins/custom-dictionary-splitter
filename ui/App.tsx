const sampleEntries = [
  { stroke: 'TKPWR-BG', word: 'debugging', strokes: 2 },
  { stroke: 'PWEUL/HRELG', word: 'billable', strokes: 2 },
  { stroke: 'STOEPBG', word: 'stochastic', strokes: 1 },
];

export default function App() {
  return (
    <main style={{ padding: 'var(--space-6)', maxWidth: 720 }}>
      <h1>Custom Dictionary Splitter</h1>
      <p className="text-muted">
        React + Vite + Vitest toolchain scaffold. Wizard steps are ported in
        later tasks.
      </p>

      <section className="panel" style={{ marginTop: 'var(--space-4)' }}>
        <h2 style={{ marginTop: 0 }}>Theme check</h2>
        <p>
          <span className="badge">token-driven</span>{' '}
          <button className="btn" type="button">
            Primary action
          </button>{' '}
          <button className="btn btn-secondary" type="button">
            Secondary action
          </button>
        </p>

        <table className="entry-table">
          <thead>
            <tr>
              <th>Stroke</th>
              <th>Word</th>
              <th>Strokes</th>
            </tr>
          </thead>
          <tbody>
            {sampleEntries.map((entry) => (
              <tr key={entry.stroke}>
                <td>
                  <code>{entry.stroke}</code>
                </td>
                <td>{entry.word}</td>
                <td>{entry.strokes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
