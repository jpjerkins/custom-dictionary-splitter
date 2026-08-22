import { useWizard } from '../state/WizardContext.tsx';

// Ported from public/js/steps/step5-flash.js.
export default function Step5Flash() {
  const { goToStep } = useWizard();

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>5. Flash New Firmware</h2>
      <p>
        Open{' '}
        <a href="https://lim.au/#/software/javelin-steno/starboardRp2040" target="_blank" rel="noopener">
          the Starboard RP2040 firmware builder
        </a>{' '}
        and flash the rebuilt firmware. The keyboard will disconnect to enter flashing mode &mdash; that's
        expected, the dictionary was already downloaded in step 1.
      </p>
      <p>
        <button className="btn" type="button" onClick={() => goToStep('test')}>
          Done, continue
        </button>
      </p>
    </section>
  );
}
