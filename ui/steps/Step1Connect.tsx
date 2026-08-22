import { useState } from 'react';
import { connectToKeyboard, downloadUserDictionary, listDictionaries } from '../serial/serial.ts';
import { useWizard } from '../state/WizardContext.tsx';

// Ported from public/js/steps/step1-connect.js. Preserve the candidate list
// and last-dictionary fallback exactly.
const USER_DICTIONARY_CANDIDATES = ['user_dictionary', 'user'];

export default function Step1Connect() {
  const { setState, goToStep } = useWizard();
  const [status, setStatus] = useState('');

  async function handleConnect() {
    setStatus('Connecting...');
    try {
      const port = await connectToKeyboard();
      const names = await listDictionaries(port);
      const userDictName = USER_DICTIONARY_CANDIDATES.find((c) => names.includes(c)) ?? names[names.length - 1];
      setStatus(`Downloading "${userDictName}"...`);
      const downloadedDictionary = await downloadUserDictionary(port, userDictName);
      setStatus(`Downloaded ${Object.keys(downloadedDictionary as Record<string, unknown>).length} entries.`);
      // Steps 4-5 hand the same keyboard to lim.au, which cannot open a
      // port this tab still holds.
      try {
        await port.close();
      } catch (err) {
        console.warn('Failed to close serial port', err);
      }
      setState((prev) => ({ ...prev, port: null, downloadedDictionary, deviceOrder: names }));
      goToStep('diff');
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>1. Connect &amp; Download</h2>
      <p>
        <button className="btn" type="button" onClick={handleConnect}>
          Connect keyboard
        </button>
      </p>
      <p data-testid="connect-status" className="text-muted">
        {status}
      </p>
    </section>
  );
}
