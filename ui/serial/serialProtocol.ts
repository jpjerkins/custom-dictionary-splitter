export interface ResponseAccumulator {
  push(chunk: string): void;
  tryExtractResponse(): string | null;
}

export function createResponseAccumulator(): ResponseAccumulator {
  let buffer = '';
  return {
    push(chunk: string) {
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

export function parseDictionaryList(responseText: string): string[] {
  return responseText
    .split('\n')
    .map((line) => DICTIONARY_RECORD.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, name]) => (name.startsWith('"') ? JSON.parse(name) : name));
}

export function parseDictionaryJson(responseText: string): unknown {
  return JSON.parse(responseText);
}
