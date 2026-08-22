import { showStep } from '../state.js';

export function initStep5() {
  document.getElementById('flash-done-button').addEventListener('click', () => showStep('test'));
}
