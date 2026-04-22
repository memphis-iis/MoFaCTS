import { createStarterRow, type ManualCreatorState, type PromptType } from './manualDraftBuilder';

export function structureIncludesInstructions(structure: ManualCreatorState['structure']) {
  return structure === 'instructions-learning' || structure === 'instructions-assessment';
}

export function isPromptTextEnabled(promptType: PromptType) {
  return promptType === 'text' || promptType === 'text-image';
}

export function isMediaPromptEnabled(promptType: PromptType) {
  return promptType === 'image' || promptType === 'audio' || promptType === 'video' || promptType === 'text-image';
}

export function getMediaLabel(promptType: PromptType) {
  if (promptType === 'image' || promptType === 'text-image') return 'Image file';
  if (promptType === 'audio') return 'Audio file';
  if (promptType === 'video') return 'Video file';
  return 'Media file';
}

export function getSeedColumnLabels(state: ManualCreatorState) {
  const columns: string[] = [];
  if (isPromptTextEnabled(state.promptType)) {
    columns.push(state.promptType === 'text-image' ? 'Prompt text' : 'Prompt');
  }
  if (isMediaPromptEnabled(state.promptType)) {
    columns.push(getMediaLabel(state.promptType));
  }
  columns.push('Answer');
  if (state.responseType === 'multiple-choice') {
    columns.push('Choice 2', 'Choice 3', 'Choice 4');
  }
  return columns;
}

function splitSeedLine(rawLine: string) {
  if (rawLine.includes('\t')) {
    return rawLine.split('\t');
  }
  if (rawLine.includes('|')) {
    return rawLine.split('|');
  }
  if (rawLine.includes(',')) {
    return rawLine.split(',');
  }
  return [rawLine];
}

function normalizeSeedCell(cell: string | undefined) {
  return String(cell || '').trim();
}

export function parseSeedTableText(
  state: ManualCreatorState,
  createId: () => string,
) {
  const raw = String(state.seedTableText || '').trim();
  if (!raw) {
    return [];
  }

  const expectedColumns = getSeedColumnLabels(state);
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const normalizedExpected = expectedColumns.map((label) => label.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  const parsedLines = lines.map((line) => splitSeedLine(line).map(normalizeSeedCell));
  const firstParsedLine = parsedLines[0] || [];
  const firstLineNormalized = firstParsedLine.map((cell) => cell.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  const hasHeader = firstLineNormalized.length >= normalizedExpected.length &&
    normalizedExpected.every((expected, index) => firstLineNormalized[index] === expected);

  const dataLines = hasHeader ? parsedLines.slice(1) : parsedLines;

  return dataLines.map((cells) => {
    let offset = 0;
    const row = createStarterRow(createId());

    if (isPromptTextEnabled(state.promptType)) {
      row.promptText = normalizeSeedCell(cells[offset]);
      offset += 1;
    }

    if (isMediaPromptEnabled(state.promptType)) {
      row.mediaRef = normalizeSeedCell(cells[offset]);
      offset += 1;
    }

    row.answer = normalizeSeedCell(cells[offset]);
    offset += 1;

    if (state.responseType === 'multiple-choice') {
      row.choice2 = normalizeSeedCell(cells[offset]);
      row.choice3 = normalizeSeedCell(cells[offset + 1]);
      row.choice4 = normalizeSeedCell(cells[offset + 2]);
    }

    return row;
  });
}
