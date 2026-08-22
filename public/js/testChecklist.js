export function buildTestChecklist(movedEntries) {
  return movedEntries.map(({ stroke, translation }) => ({
    stroke,
    expected: translation,
    actual: '',
    status: 'pending',
  }));
}

export function checkRow(row, actualValue) {
  return {
    ...row,
    actual: actualValue,
    status: actualValue === row.expected ? 'pass' : 'fail',
  };
}
