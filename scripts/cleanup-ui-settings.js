const fs = require('fs');
const path = require('path');

// Mirrors svelte-app/mofacts/client/views/experiment/svelte/machine/constants.ts
const DEFAULT_UI_SETTINGS = {
  stimuliPosition: 'top',
  isVideoSession: false,
  videoUrl: '',
  displayCorrectFeedback: true,
  displayIncorrectFeedback: true,
  correctMessage: 'Correct.',
  incorrectMessage: 'Incorrect.',
  correctColor: 'var(--success-color)',
  incorrectColor: 'var(--alert-color)',
  displayUserAnswerInFeedback: 'onIncorrect',
  singleLineFeedback: false,
  onlyShowSimpleFeedback: 'onCorrect',
  displayUserAnswerInCorrectFeedback: false,
  displayUserAnswerInIncorrectFeedback: true,
  displayPerformance: false,
  displayTimeoutBar: false,
  choiceButtonCols: 1,
  displaySubmitButton: false,
  inputPlaceholderText: 'Type your answer here...',
  displayConfirmButton: false,
  continueButtonText: 'Continue',
  skipStudyButtonText: 'Skip',
  caseSensitive: false,
  displayQuestionNumber: false,
};

// Mirrors kept/supported fields in uiSettingsValidator.ts (VALIDATION_RULES)
const SUPPORTED_UI_KEYS = new Set(Object.keys(DEFAULT_UI_SETTINGS));

function coerceByDefaultType(key, value) {
  const defaultValue = DEFAULT_UI_SETTINGS[key];
  if (typeof defaultValue === 'boolean' && typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  if (typeof defaultValue === 'number' && typeof value === 'string') {
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
  }
  return value;
}

function cleanUiSettingsObject(uiSettings) {
  if (!uiSettings || typeof uiSettings !== 'object' || Array.isArray(uiSettings)) {
    return { cleaned: undefined, removedUnsupported: 0, removedDefault: 0, kept: 0 };
  }

  const cleaned = {};
  let removedUnsupported = 0;
  let removedDefault = 0;
  let kept = 0;

  for (const [key, value] of Object.entries(uiSettings)) {
    if (!SUPPORTED_UI_KEYS.has(key)) {
      removedUnsupported += 1;
      continue;
    }

    const coercedValue = coerceByDefaultType(key, value);
    const defaultValue = DEFAULT_UI_SETTINGS[key];
    if (coercedValue === defaultValue) {
      removedDefault += 1;
      continue;
    }

    cleaned[key] = value;
    kept += 1;
  }

  return { cleaned, removedUnsupported, removedDefault, kept };
}

function walkAndClean(node, stats) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) walkAndClean(item, stats);
    return;
  }

  for (const key of Object.keys(node)) {
    const value = node[key];

    if (key === 'uiSettings') {
      stats.uiSettingsBlocks += 1;
      const result = cleanUiSettingsObject(value);
      stats.removedUnsupported += result.removedUnsupported;
      stats.removedDefault += result.removedDefault;
      stats.kept += result.kept;

      if (result.cleaned && Object.keys(result.cleaned).length > 0) {
        node[key] = result.cleaned;
      } else {
        delete node[key];
        stats.removedEmptyUiSettingsBlocks += 1;
      }
      continue;
    }

    walkAndClean(value, stats);
  }
}

function processFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { filePath, skipped: true, reason: `Invalid JSON: ${err.message}` };
  }

  const stats = {
    uiSettingsBlocks: 0,
    removedUnsupported: 0,
    removedDefault: 0,
    kept: 0,
    removedEmptyUiSettingsBlocks: 0,
  };

  walkAndClean(json, stats);

  const newRaw = JSON.stringify(json, null, 4) + '\n';
  if (newRaw !== raw) {
    fs.writeFileSync(filePath, newRaw, 'utf8');
    return { filePath, changed: true, ...stats };
  }

  return { filePath, changed: false, ...stats };
}

function getJsonFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...getJsonFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error('Usage: node svelte-app/scripts/cleanup-ui-settings.js <target-dir>');
    process.exit(1);
  }

  if (!fs.existsSync(targetDir)) {
    console.error(`Target directory not found: ${targetDir}`);
    process.exit(1);
  }

  const files = getJsonFiles(targetDir);
  const results = files.map(processFile);

  const changed = results.filter(r => r.changed);
  const skipped = results.filter(r => r.skipped);

  const totals = changed.reduce((acc, r) => {
    acc.uiSettingsBlocks += r.uiSettingsBlocks;
    acc.removedUnsupported += r.removedUnsupported;
    acc.removedDefault += r.removedDefault;
    acc.kept += r.kept;
    acc.removedEmptyUiSettingsBlocks += r.removedEmptyUiSettingsBlocks;
    return acc;
  }, {
    uiSettingsBlocks: 0,
    removedUnsupported: 0,
    removedDefault: 0,
    kept: 0,
    removedEmptyUiSettingsBlocks: 0,
  });

  console.log(`Processed ${files.length} JSON files`);
  console.log(`Changed ${changed.length} files`);
  console.log(`Skipped ${skipped.length} files`);
  console.log('Totals across changed files:');
  console.log(JSON.stringify(totals, null, 2));

  if (skipped.length > 0) {
    console.log('Skipped files:');
    for (const s of skipped) console.log(`- ${s.filePath}: ${s.reason}`);
  }

  if (changed.length > 0) {
    console.log('Changed files:');
    for (const c of changed) console.log(`- ${c.filePath}`);
  }
}

main();
