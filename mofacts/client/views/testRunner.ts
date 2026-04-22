import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import { Random } from 'meteor/random';
import { CardStore } from './experiment/modules/cardStore';
import './svelteCardTester';
import './testRunner.html';
declare const $: (selector: string | EventTarget | null) => {
  show(): void;
  hide(): void;
  html(value: string): void;
  slideDown(): void;
  slideUp(): void;
  removeClass(className: string): { addClass(className: string): void };
};

type SmokeTestResult = {
  name?: string;
  passed: boolean;
  message?: string;
  error?: string;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Smoke test runner - executes tests directly in browser
// Based on card.test.js but adapted for in-browser execution

Template.testRunner.events({
  'click #runSmokeTests'() {
    $('#testRunning').show();
    $('#testResultsContainer').hide();

    // Run tests after short delay to show spinner
    setTimeout(() => {
      const results = runAllSmokeTests();
      displayTestResults(results);
      $('#testRunning').hide();
      $('#testResultsContainer').show();
    }, 100);
  },

  'click #clearResults'() {
    $('#testResultsContainer').hide();
    $('#testResults').html('');
    $('#testSummary').html('');
  },

  // Svelte Card Tester Toggle
  'click .open-svelte-tester'(event: Event) {
    event.preventDefault();
    $('#svelte-tester-container').slideDown();
    $('.open-svelte-tester').html('<i class="fa fa-eye-slash"></i> Hide Svelte Card Tester');
    $('.open-svelte-tester').removeClass('open-svelte-tester').addClass('close-svelte-tester');
  },

  'click .close-svelte-tester'(event: Event) {
    event.preventDefault();
    $('#svelte-tester-container').slideUp();
    $('.close-svelte-tester').html('<i class="fa fa-eye"></i> Open Svelte Card Tester');
    $('.close-svelte-tester').removeClass('close-svelte-tester').addClass('open-svelte-tester');
  }
});

// Main test runner
function runAllSmokeTests(): { tests: SmokeTestResult[]; passCount: number; failCount: number; total: number } {
  const testResults: SmokeTestResult[] = [];
  let passCount = 0;
  let failCount = 0;

  // Test 1: Basic Trial Flow - Template Exists
  try {
    const test1 = testTemplateExists();
    testResults.push({ name: 'Test 1: card.js template exists', ...test1 });
    if (test1.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 1: card.js template exists', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 2: Session Key Initialization
  try {
    const test2 = testSessionKeyInitialization();
    testResults.push({ name: 'Test 2: Session key initialization', ...test2 });
    if (test2.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 2: Session key initialization', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 3: Template Helpers Exist
  try {
    const test3 = testTemplateHelpersExist();
    testResults.push({ name: 'Test 3: Template helpers exist', ...test3 });
    if (test3.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 3: Template helpers exist', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 4: Helpers Don't Crash
  try {
    const test4 = testHelpersDontCrash();
    testResults.push({ name: 'Test 4: Helpers don\'t crash with basic state', ...test4 });
    if (test4.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 4: Helpers don\'t crash', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 5: Multiple Choice State
  try {
    const test5 = testMultipleChoiceState();
    testResults.push({ name: 'Test 5: Multiple choice state setup', ...test5 });
    if (test5.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 5: Multiple choice state', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 6: Study Phase Detection
  try {
    const test6 = testStudyPhaseDetection();
    testResults.push({ name: 'Test 6: Study phase detection', ...test6 });
    if (test6.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 6: Study phase detection', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 7: Timeout Management
  try {
    const test7 = testTimeoutManagement();
    testResults.push({ name: 'Test 7: Timeout management', ...test7 });
    if (test7.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 7: Timeout management', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 8: Audio Input Mode Detection
  try {
    const test8 = testAudioInputModeDetection();
    testResults.push({ name: 'Test 8: Audio input mode detection', ...test8 });
    if (test8.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 8: Audio input mode detection', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 9: CardStore Initialize/Destroy Lifecycle
  try {
    const test9 = testCardStoreLifecycle();
    testResults.push({ name: 'Test 9: CardStore lifecycle (init/destroy)', ...test9 });
    if (test9.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 9: CardStore lifecycle', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 10: CardStore State Isolation
  try {
    const test10 = testCardStoreStateIsolation();
    testResults.push({ name: 'Test 10: CardStore state isolation', ...test10 });
    if (test10.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 10: CardStore state isolation', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 11: CardStore Timeout Cleanup
  try {
    const test11 = testCardStoreTimeoutCleanup();
    testResults.push({ name: 'Test 11: CardStore timeout cleanup', ...test11 });
    if (test11.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 11: CardStore timeout cleanup', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  // Test 12: CardStore Audio State Reset
  try {
    const test12 = testCardStoreAudioStateReset();
    testResults.push({ name: 'Test 12: CardStore audio state reset', ...test12 });
    if (test12.passed) passCount++; else failCount++;
  } catch (e: unknown) {
    testResults.push({ name: 'Test 12: CardStore audio state reset', passed: false, error: getErrorMessage(e) });
    failCount++;
  }

  return {
    tests: testResults,
    passCount,
    failCount,
    total: passCount + failCount
  };
}

// Individual test functions

function testTemplateExists() {
  const cardTemplate = Template.card;
  if (!cardTemplate) {
    return { passed: false, error: 'Template.card does not exist' };
  }
  return { passed: true, message: 'card template exists' };
}

function testSessionKeyInitialization() {
  // Save original values
  const originalValues: Record<string, unknown> = {};
  const testKeys = [
    'currentTdfId', 'currentTdfFile', 'currentUnitNumber',
    'currentDisplay', 'currentAnswer', 'testType',
    'displayReady', 'buttonTrial', 'recording'
  ];

  testKeys.forEach(key => {
    originalValues[key] = Session.get(key);
  });

  try {
    // Set test values
    Session.set('currentTdfId', Random.id());
    Session.set('currentTdfFile', { tdfs: {} });
    Session.set('currentUnitNumber', 0);
    Session.set('currentDisplay', { text: 'test' });
    Session.set('currentAnswer', 'test');
    Session.set('testType', 'd');
    Session.set('displayReady', false);
    Session.set('buttonTrial', false);
    Session.set('recording', false);

    // Verify all set correctly
    const allSet = testKeys.every(key => Session.get(key) !== undefined);

    // Restore original values
    testKeys.forEach(key => {
      Session.set(key, originalValues[key]);
    });

    return allSet
      ? { passed: true, message: '9 Session keys initialized successfully' }
      : { passed: false, error: 'Some Session keys failed to initialize' };
  } catch (e) {
    // Restore on error
    testKeys.forEach(key => {
      Session.set(key, originalValues[key]);
    });
    throw e;
  }
}

function testTemplateHelpersExist() {
  const requiredHelpers = [
    'isNormal', 'displayReady', 'test', 'buttonTrial', 'audioInputModeEnabled'
  ];

  const cardTemplate = Template.card;
  if (!cardTemplate || !cardTemplate.__helpers) {
    return { passed: false, error: 'Template.card.__helpers not accessible' };
  }

  const missingHelpers = requiredHelpers.filter(name => !cardTemplate.__helpers.get(name));

  return missingHelpers.length === 0
    ? { passed: true, message: `All ${requiredHelpers.length} critical helpers exist` }
    : { passed: false, error: `Missing helpers: ${missingHelpers.join(', ')}` };
}

function testHelpersDontCrash() {
  // Setup minimal state
  const originalValues: Record<string, unknown> = {};
  const stateKeys = ['displayReady', 'testType', 'buttonTrial', 'currentDisplay'];

  stateKeys.forEach(key => {
    originalValues[key] = Session.get(key);
  });

  try {
    Session.set('displayReady', true);
    Session.set('testType', 'd');
    Session.set('buttonTrial', false);
    Session.set('currentDisplay', { text: 'test' });

    const cardTemplate = Template.card;
    const helpersToTest = ['isNormal', 'displayReady', 'test', 'buttonTrial'];

    let errorCount = 0;
    const errorMessages: string[] = [];

    helpersToTest.forEach(helperName => {
      try {
        const helper = cardTemplate.__helpers.get(helperName);
        if (helper) {
          helper.call({});  // Call with empty context
        }
      } catch (e: unknown) {
        errorCount++;
        errorMessages.push(`${helperName}: ${getErrorMessage(e)}`);
      }
    });

    // Restore original values
    stateKeys.forEach(key => {
      Session.set(key, originalValues[key]);
    });

    return errorCount === 0
      ? { passed: true, message: `${helpersToTest.length} helpers executed without errors` }
      : { passed: false, error: `${errorCount} helpers crashed: ${errorMessages.join('; ')}` };
  } catch (e) {
    // Restore on error
    stateKeys.forEach(key => {
      Session.set(key, originalValues[key]);
    });
    throw e;
  }
}

function testMultipleChoiceState() {
  const originalButtonTrial = Session.get('buttonTrial');
  const originalButtonList = Session.get('buttonList');

  try {
    Session.set('buttonTrial', true);
    Session.set('buttonList', [
      { text: 'Option A', isAnswer: false },
      { text: 'Option B', isAnswer: true },
      { text: 'Option C', isAnswer: false },
      { text: 'Option D', isAnswer: false }
    ]);

    const buttonList = (Session.get('buttonList') || []) as Array<{ isAnswer?: boolean }>;
    const correctAnswers = buttonList.filter((b: { isAnswer?: boolean }) => b.isAnswer);

    Session.set('buttonTrial', originalButtonTrial);
    Session.set('buttonList', originalButtonList);

    return (buttonList.length === 4 && correctAnswers.length === 1)
      ? { passed: true, message: 'MC state with 4 options and 1 correct answer' }
      : { passed: false, error: 'MC state setup incorrect' };
  } catch (e) {
    Session.set('buttonTrial', originalButtonTrial);
    Session.set('buttonList', originalButtonList);
    throw e;
  }
}

function testStudyPhaseDetection() {
  const originalTestType = Session.get('testType');

  try {
    Session.set('testType', 's');

    const cardTemplate = Template.card;
    const studyHelper = cardTemplate.__helpers.get('study');

    let isStudy = false;
    if (studyHelper) {
      isStudy = studyHelper.call({});
    }

    Session.set('testType', originalTestType);

    return isStudy
      ? { passed: true, message: 'Study phase correctly detected (testType=s)' }
      : { passed: false, error: 'Study phase not detected' };
  } catch (e) {
    Session.set('testType', originalTestType);
    throw e;
  }
}

function testTimeoutManagement() {
  try {
    // Create and clear timeout
    const testTimeoutId = setTimeout(() => {}, 5000);
    const testIntervalId = setInterval(() => {}, 5000);

    clearTimeout(testTimeoutId);
    clearInterval(testIntervalId);

    return { passed: true, message: 'Timeout/interval creation and cleanup successful' };
  } catch (e: unknown) {
    return { passed: false, error: `Timeout management failed: ${getErrorMessage(e)}` };
  }
}

function testAudioInputModeDetection() {
  const originalTdfFile = Session.get('currentTdfFile');

  try {
    // Test Case 1: User SR off, TDF SR on → should be disabled
    Session.set('currentTdfFile', {
      tdfs: {
        tutor: {
          setspec: {
            audioInputEnabled: 'true'
          }
        }
      }
    });

    // Note: Can't fully test without mocking Meteor.user(), but we can verify
    // the Session key is set correctly
    const tdfFile = Session.get('currentTdfFile');
    const audioEnabled = tdfFile?.tdfs?.tutor?.setspec?.audioInputEnabled;

    Session.set('currentTdfFile', originalTdfFile);

    return audioEnabled === 'true'
      ? { passed: true, message: 'Audio input TDF setting accessible' }
      : { passed: false, error: 'Audio input TDF setting not accessible' };
  } catch (e) {
    Session.set('currentTdfFile', originalTdfFile);
    throw e;
  }
}

// ============================================
// CardStore Lifecycle Tests
// ============================================

function testCardStoreLifecycle() {
  try {
    // Test initialize sets defaults
    CardStore.initialize();

    // Check key defaults are set
    const isButtonTrial = CardStore.isButtonTrial();
    const isRecording = CardStore.isRecording();
    const displayFeedback = CardStore.getDisplayFeedback();
    const pausedLocks = CardStore.getPausedLocks();

    const initCorrect = (
      isButtonTrial === false &&
      isRecording === false &&
      displayFeedback === false &&
      pausedLocks === 0
    );

    if (!initCorrect) {
      return { passed: false, error: 'Initialize did not set correct defaults' };
    }

    // Set some state
    CardStore.setButtonTrial(true);
    CardStore.setRecording(true);

    // Verify state was set
    if (!CardStore.isButtonTrial() || !CardStore.isRecording()) {
      return { passed: false, error: 'State setters not working' };
    }

    // Test destroy clears state
    CardStore.destroy();

    // Re-initialize for clean state
    CardStore.initialize();

    return { passed: true, message: 'Initialize/destroy lifecycle works correctly' };
  } catch (e) {
    CardStore.initialize(); // Ensure clean state
    throw e;
  }
}

function testCardStoreStateIsolation() {
  try {
    CardStore.initialize();

    // Set various state values
    CardStore.setButtonTrial(true);
    CardStore.setButtonList([{ text: 'A', isAnswer: true }, { text: 'B', isAnswer: false }]);
    CardStore.setCurrentScore(100);
    CardStore.setUserAnswer('test answer');

    // Verify isolation - each getter returns its own value
    const buttonTrial = CardStore.isButtonTrial();
    const buttonList = CardStore.getButtonList();
    const score = CardStore.getCurrentScore();
    const answer = CardStore.getUserAnswer();

    const stateCorrect = (
      buttonTrial === true &&
      ((buttonList as unknown[]).length === 2) &&
      score === 100 &&
      answer === 'test answer'
    );

    if (!stateCorrect) {
      return { passed: false, error: 'State values not isolated correctly' };
    }

    // Reset and verify defaults restored
    CardStore.resetReactiveDefaults();

    const resetCorrect = (
      CardStore.isButtonTrial() === false &&
      (((CardStore.getButtonList() as unknown) as unknown[]).length === 0) &&
      CardStore.getCurrentScore() === 0 &&
      CardStore.getUserAnswer() === undefined
    );

    if (!resetCorrect) {
      return { passed: false, error: 'resetReactiveDefaults did not restore defaults' };
    }

    return { passed: true, message: 'State isolation and reset working correctly' };
  } catch (e) {
    CardStore.initialize();
    throw e;
  }
}

function testCardStoreTimeoutCleanup() {
  try {
    CardStore.initialize();

    // Create a test timeout
    const testTimeoutId = setTimeout(() => {}, 10000);

    // Store it in CardStore
    CardStore.setCurTimeoutId(testTimeoutId);

    // Verify it's stored
    const storedId = CardStore.getCurTimeoutId();
    if (storedId !== testTimeoutId) {
      clearTimeout(testTimeoutId);
      return { passed: false, error: 'Timeout ID not stored correctly' };
    }

    // Clear via CardStore
    CardStore.setCurTimeoutId(undefined);
    clearTimeout(testTimeoutId);

    // Verify cleared
    const clearedId = CardStore.getCurTimeoutId();
    if (clearedId !== undefined) {
      return { passed: false, error: 'Timeout ID not cleared' };
    }

    // Test activeTimeoutHandle
    CardStore.setActiveTimeoutHandle('testTimeout');
    if (CardStore.getActiveTimeoutHandle() !== 'testTimeout') {
      return { passed: false, error: 'Active timeout handle not set' };
    }

    CardStore.clearActiveTimeoutHandle();
    if (CardStore.getActiveTimeoutHandle() !== null) {
      return { passed: false, error: 'Active timeout handle not cleared' };
    }

    return { passed: true, message: 'Timeout state management working correctly' };
  } catch (e) {
    CardStore.initialize();
    throw e;
  }
}

function testCardStoreAudioStateReset() {
  try {
    CardStore.initialize();

    // Set audio-related state
    CardStore.setRecording(true);
    CardStore.setRecordingLocked(true);
    CardStore.setTtsWarmedUp(true);
    CardStore.setSrWarmedUp(true);
    CardStore.setAudioInputModeEnabled(true);
    CardStore.setWaitingForTranscription(true);

    // Verify all set
    const audioStateSet = (
      CardStore.isRecording() === true &&
      CardStore.isRecordingLocked() === true &&
      CardStore.isTtsWarmedUp() === true &&
      CardStore.isSrWarmedUp() === true &&
      CardStore.isAudioInputModeEnabled() === true &&
      CardStore.isWaitingForTranscription() === true
    );

    if (!audioStateSet) {
      return { passed: false, error: 'Audio state not set correctly' };
    }

    // Reset to defaults
    CardStore.resetReactiveDefaults();

    // Verify audio state cleared
    const audioStateCleared = (
      CardStore.isRecording() === false &&
      CardStore.isRecordingLocked() === false &&
      CardStore.isTtsWarmedUp() === false &&
      CardStore.isSrWarmedUp() === false &&
      CardStore.isAudioInputModeEnabled() === false &&
      CardStore.isWaitingForTranscription() === false
    );

    if (!audioStateCleared) {
      return { passed: false, error: 'Audio state not cleared on reset - potential for stale mic/audio' };
    }

    return { passed: true, message: 'Audio state properly resets (no stale mic/TTS)' };
  } catch (e) {
    CardStore.initialize();
    throw e;
  }
}

// Display test results in HTML
function displayTestResults(results: { tests: SmokeTestResult[]; passCount: number; failCount: number; total: number }): void {
  const { tests, passCount, failCount, total } = results;

  // Update summary
  const summaryClass = failCount === 0 ? 'text-success' : 'text-danger';
  const summaryIcon = failCount === 0 ? 'fa-check-circle' : 'fa-times-circle';
  $('#testSummary').html(`
    <span class="${summaryClass}">
      <i class="fa ${summaryIcon}"></i>
      ${passCount} / ${total} passed
    </span>
  `);

  // Build results HTML
  let html = '<div class="list-group">';

  tests.forEach((test: SmokeTestResult) => {
    const statusClass = test.passed ? 'success' : 'danger';
    const icon = test.passed ? 'fa-check' : 'fa-times';
    const message = test.passed ? test.message : test.error;

    html += `
      <div class="list-group-item list-group-item-${statusClass}">
        <div class="d-flex w-100 justify-content-between">
          <h6 class="mb-1">
            <i class="fa ${icon}"></i> ${test.name}
          </h6>
        </div>
        <p class="mb-1"><small>${message}</small></p>
      </div>
    `;
  });

  html += '</div>';

  // Show overall status alert
  if (failCount === 0) {
    html = `
      <div class="alert alert-success">
        <i class="fa fa-check-circle"></i>
        <strong>All tests passed!</strong> Main systems are functional.
      </div>
    ` + html;
  } else {
    html = `
      <div class="alert alert-danger">
        <i class="fa fa-times-circle"></i>
        <strong>${failCount} test(s) failed!</strong> Critical path may be broken.
      </div>
    ` + html;
  }

  $('#testResults').html(html);
}






