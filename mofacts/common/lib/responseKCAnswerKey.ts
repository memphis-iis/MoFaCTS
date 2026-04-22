import { legacyTrim } from '../underscoreCompat';

function stripSpacesAndLowerCase(input: string) {
  if (input == null) return '';
  return String(input).replace(/ /g, '').toLowerCase();
}

function answerIsBranched(answer: unknown) {
  return legacyTrim(answer).indexOf(';') >= 0;
}

function branchingCorrectText(answer: unknown) {
  let result = '';

  const branches = legacyTrim(answer).split(';');
  if (branches.length > 0) {
    const flds = (branches[0] ?? '').split('~');
    if (flds.length == 2) {
      result = flds[0] ?? '';
    }
  }

  const resultParts = result.split('|');
  return resultParts[0] ?? '';
}

export function getResponseKCAnswerKey(answer: unknown) {
  return answerIsBranched(answer)
    ? stripSpacesAndLowerCase(branchingCorrectText(answer))
    : stripSpacesAndLowerCase(String(answer ?? ''));
}
