export function diffDictionary(downloaded, index) {
  const result = { new: [], conflict: [], unchanged: [] };
  for (const [stroke, translation] of Object.entries(downloaded)) {
    const existing = index[stroke];
    if (!existing) {
      result.new.push({ stroke, translation });
    } else if (existing.translation !== translation) {
      result.conflict.push({
        stroke,
        keyboardTranslation: translation,
        existingTranslation: existing.translation,
        existingFile: existing.file,
      });
    } else {
      result.unchanged.push({ stroke, translation });
    }
  }
  return result;
}
