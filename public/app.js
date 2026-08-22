import { showStep } from './js/state.js';
import { initStep1 } from './js/steps/step1-connect.js';
import { initStep2 } from './js/steps/step2-diff.js';
import { initStep3 } from './js/steps/step3-sort.js';
import { initStep4 } from './js/steps/step4-empty.js';
import { initStep5 } from './js/steps/step5-flash.js';
import { initStep6 } from './js/steps/step6-test.js';

initStep1();
initStep2();
initStep3();
initStep4();
initStep5();
initStep6();
showStep('connect');
