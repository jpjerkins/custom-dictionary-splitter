import { useWizard } from '../state/WizardContext.tsx';

// Ported from public/js/steps/step4-empty.js.
export default function Step4Empty() {
  const { goToStep } = useWizard();

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>4. Empty On-Device Dictionary</h2>
      <p>
        Open{' '}
        <a
          href="https://lim.au/#/software/javelin-steno-tools/dictionary-management"
          target="_blank"
          rel="noopener"
        >
          the Javelin dictionary management tool
        </a>{' '}
        and clear the user dictionary on the keyboard.
      </p>
      <p>
        <button className="btn" type="button" onClick={() => goToStep('flash')}>
          Done, continue
        </button>
      </p>
    </section>
  );
}
