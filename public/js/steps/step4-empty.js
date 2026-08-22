import { showStep } from '../state.js';

export function initStep4() {
  document.getElementById('empty-done-button').addEventListener('click', () => showStep('flash'));
}
