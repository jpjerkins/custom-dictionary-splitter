import { showStep } from './js/state.js';
import { initStep1 } from './js/steps/step1-connect.js';
import { initStep2 } from './js/steps/step2-diff.js';
import { initStep3 } from './js/steps/step3-sort.js';

initStep1();
initStep2();
initStep3();
showStep('connect');
