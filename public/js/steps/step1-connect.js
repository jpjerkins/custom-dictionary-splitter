import { connectToKeyboard, listDictionaries, downloadUserDictionary } from '../serial.js';
import { state, showStep } from '../state.js';

const USER_DICTIONARY_CANDIDATES = ['user_dictionary', 'user'];

export function initStep1() {
  const connectButton = document.getElementById('connect-button');
  const statusEl = document.getElementById('connect-status');

  connectButton.addEventListener('click', async () => {
    statusEl.textContent = 'Connecting...';
    try {
      state.port = await connectToKeyboard();
      const names = await listDictionaries(state.port);
      const userDictName = USER_DICTIONARY_CANDIDATES.find((c) => names.includes(c)) || names[names.length - 1];
      statusEl.textContent = `Downloading "${userDictName}"...`;
      state.downloadedDictionary = await downloadUserDictionary(state.port, userDictName);
      statusEl.textContent = `Downloaded ${Object.keys(state.downloadedDictionary).length} entries.`;
      // Steps 4-5 hand the same keyboard to lim.au, which cannot open a port this tab still holds.
      try {
        await state.port.close();
      } catch (err) {
        console.warn('Failed to close serial port', err);
      }
      state.port = null;
      showStep('diff');
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    }
  });
}
