import { createResponseAccumulator, parseDictionaryList, parseDictionaryJson } from './serial-protocol.js';

export async function connectToKeyboard() {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  return port;
}

async function sendCommand(port, command) {
  const writer = port.writable.getWriter();
  await writer.write(new TextEncoder().encode(`${command}\n`));
  writer.releaseLock();

  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  const accumulator = createResponseAccumulator();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      accumulator.push(decoder.decode(value, { stream: true }));
      const response = accumulator.tryExtractResponse();
      if (response !== null) return response;
    }
    throw new Error('Serial connection closed before response completed');
  } finally {
    reader.releaseLock();
  }
}

export async function listDictionaries(port) {
  const response = await sendCommand(port, 'list_dictionaries');
  return parseDictionaryList(response);
}

export async function downloadUserDictionary(port, dictionaryName) {
  const response = await sendCommand(port, `print_dictionary ${dictionaryName}`);
  return parseDictionaryJson(response);
}
