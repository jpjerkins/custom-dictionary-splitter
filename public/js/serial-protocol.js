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

export function parseDictionaryList(responseText) {
  return responseText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseDictionaryJson(responseText) {
  return JSON.parse(responseText);
}
