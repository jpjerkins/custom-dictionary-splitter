export function createResponseAccumulator() {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
    },
    tryExtractResponse() {
      const terminatorIndex = buffer.indexOf('\n\n');
      if (terminatorIndex === -1) return null;
      const response = buffer.slice(0, terminatorIndex);
      buffer = buffer.slice(terminatorIndex + 2);
      return response;
    },
  };
}

// The firmware prints one `{d: name}` record per line, `{d: name,v: 0}` when the
// dictionary is disabled, wrapped in `[`/`]`. Names are bare unless they need
// escaping, in which case they arrive JSON-quoted.
const DICTIONARY_RECORD = /^\{d:\s*(.*?)(?:,v:\s*\d+)?\},?$/;

export function parseDictionaryList(responseText) {
  return responseText
    .split('\n')
    .map((line) => DICTIONARY_RECORD.exec(line.trim()))
    .filter(Boolean)
    .map(([, name]) => (name.startsWith('"') ? JSON.parse(name) : name));
}

export function parseDictionaryJson(responseText) {
  return JSON.parse(responseText);
}
