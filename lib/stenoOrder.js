const KEY_ORDER = 'STKPWHRAO*EUFRPBLGTSDZ';

export function strokeToKeyIndices(stroke) {
  const chars = stroke.replace(/-/g, '').split('');
  const indices = [];
  let cursor = 0;
  let unparseable = false;
  for (const ch of chars) {
    const found = KEY_ORDER.indexOf(ch, cursor);
    if (found === -1) {
      unparseable = true;
      indices.push(KEY_ORDER.length);
    } else {
      indices.push(found);
      cursor = found + 1;
    }
  }
  return { indices, unparseable };
}

export function compareStrokes(a, b) {
  const strokesA = a.split('/');
  const strokesB = b.split('/');
  const len = Math.max(strokesA.length, strokesB.length);
  for (let i = 0; i < len; i++) {
    if (i >= strokesA.length) return -1;
    if (i >= strokesB.length) return 1;
    const { indices: ia } = strokeToKeyIndices(strokesA[i]);
    const { indices: ib } = strokeToKeyIndices(strokesB[i]);
    const cmpLen = Math.max(ia.length, ib.length);
    for (let j = 0; j < cmpLen; j++) {
      const va = j < ia.length ? ia[j] : -1;
      const vb = j < ib.length ? ib[j] : -1;
      if (va !== vb) return va - vb;
    }
  }
  return 0;
}

export function isStrokeParseable(stroke) {
  return stroke.split('/').every((s) => !strokeToKeyIndices(s).unparseable);
}
