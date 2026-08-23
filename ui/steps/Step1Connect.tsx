import { useState } from 'react';
import { connectToKeyboard, downloadUserDictionary, listDictionaries } from '../serial/serial.ts';
import { useWizard } from '../state/WizardContext.tsx';

// Ported from public/js/steps/step1-connect.js. Preserve the candidate list
// and last-dictionary fallback exactly.
const USER_DICTIONARY_CANDIDATES = ['user_dictionary', 'user'];

// 1-indexed labels matching the step headings, for the resume prompt.
const STEP_LABELS: Record<string, string> = {
  connect: '1 (Connect)',
  diff: '2 (Diff)',
  sort: '3 (Sort)',
  empty: '4 (Empty)',
  flash: '5 (Flash)',
  test: '6 (Test)',
  commit: '7 (Commit)',
};

export default function Step1Connect() {
  const { setState, goToStep, pendingResume, resume, discardResume } = useWizard();
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
      {pendingResume && (
        // Offered, not applied automatically: from Step 4 on, the keyboard's
        // user dictionary has been emptied, so a reload used to strand
        // entries that exist only on disk with no device left to
        // re-download them from. Resuming is usually right — but it must
        // still be possible to start a clean run.
        <div className="resume-prompt" role="alertdialog" aria-label="Resume previous session?">
          <p>
            Resume where you left off? {(pendingResume.state.movedEntries as unknown[]).length} entries saved,
            was on Step {STEP_LABELS[pendingResume.currentStep] ?? pendingResume.currentStep}.
          </p>
          <button type="button" className="btn" onClick={resume}>
            Resume
          </button>
          <button type="button" className="btn btn-secondary" onClick={discardResume}>
            Start fresh
          </button>
        </div>
      )}
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
