import { createResponseAccumulator, parseDictionaryList, parseDictionaryJson } from './serial-protocol.js';

export async function connectToKeyboard() {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  return port;
}

const COMMAND_TIMEOUT_MS = 10000;

function timeoutAfter(ms, command) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Command "${command}" timed out waiting for a response`)), ms);
  });
}

async function readResponse(port, command) {
  const writer = port.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${command}\n`));
  } finally {
    writer.releaseLock();
  }

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

async function sendCommand(port, command) {
  return Promise.race([readResponse(port, command), timeoutAfter(COMMAND_TIMEOUT_MS, command)]);
}

export async function listDictionaries(port) {
  const response = await sendCommand(port, 'list_dictionaries');
  return parseDictionaryList(response);
}

export async function downloadUserDictionary(port, dictionaryName) {
  const response = await sendCommand(port, `print_dictionary ${dictionaryName}`);
  try {
    return parseDictionaryJson(response);
  } catch (err) {
    throw new Error(`Failed to parse dictionary JSON: ${err.message}\n\nRaw response:\n${response}`);
  }
}
