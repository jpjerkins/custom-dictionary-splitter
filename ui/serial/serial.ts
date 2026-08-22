import { createResponseAccumulator, parseDictionaryList, parseDictionaryJson } from './serialProtocol.ts';

// Minimal Web Serial typings — no @types package is installed for this API,
// and only the surface this module touches is declared here.
interface SerialPortSignals {
  dataTerminalReady?: boolean;
  requestToSend?: boolean;
}

export interface SerialPort {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  open(options: { baudRate: number }): Promise<void>;
  setSignals(signals: SerialPortSignals): Promise<void>;
}

interface Serial {
  requestPort(): Promise<SerialPort>;
}

declare global {
  interface Navigator {
    serial: Serial;
  }
}

// Javelin discards everything written to the CDC port until it sees this exact
// sequence, and routes console output to its HID interface until then, so
// without it every command times out. It sends no reply of its own.
const CONSOLE_HANDSHAKE = 'start_javelin_console\n';

async function writeToPort(port: SerialPort, text: string): Promise<void> {
  const writer = port.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(text));
  } finally {
    writer.releaseLock();
  }
}

export async function connectToKeyboard(): Promise<SerialPort> {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  // The firmware closes the console again the moment DTR drops.
  try {
    await port.setSignals({ dataTerminalReady: true, requestToSend: true });
  } catch (err) {
    console.warn('Failed to assert DTR/RTS', err);
  }
  await writeToPort(port, CONSOLE_HANDSHAKE);
  return port;
}

const COMMAND_TIMEOUT_MS = 10000;

function timeoutAfter(ms: number, command: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Command "${command}" timed out waiting for a response`)), ms);
  });
}

async function readResponse(port: SerialPort, command: string): Promise<string> {
  await writeToPort(port, `${command}\n`);

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

async function sendCommand(port: SerialPort, command: string): Promise<string> {
  return Promise.race([readResponse(port, command), timeoutAfter(COMMAND_TIMEOUT_MS, command)]);
}

export async function listDictionaries(port: SerialPort): Promise<string[]> {
  const response = await sendCommand(port, 'list_dictionaries');
  return parseDictionaryList(response);
}

export async function downloadUserDictionary(port: SerialPort, dictionaryName: string): Promise<unknown> {
  const response = await sendCommand(port, `print_dictionary ${dictionaryName}`);
  try {
    return parseDictionaryJson(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse dictionary JSON: ${message}\n\nRaw response:\n${response}`);
  }
}
