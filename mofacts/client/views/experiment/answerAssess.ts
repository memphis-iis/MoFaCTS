/* eslint-disable no-useless-escape */
import {getAllCurrentStimAnswers} from '../../lib/currentTestingHelpers';
import {doubleMetaphone} from 'double-metaphone'
import { deliverySettingsStore } from '../../lib/state/deliverySettingsStore';

import { legacyTrim } from '../../../common/underscoreCompat';

export {Answers};

/*
Copyright (c) 2011 Andrei Mackenzie

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/


// Compute the edit distance between the two given strings
function getEditDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: b.length + 1 }, () =>
    new Array<number>(a.length + 1).fill(0),
  );

  // increment along the first column of each row
  let i;
  for (i = 0; i <= b.length; i++) {
    matrix[i]![0] = i;
  }

  // increment each column in the first row
  let j;
  for (j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  // Fill in the rest of the matrix
  for (i = 1; i <= b.length; i++) {
    for (j = 1; j <= a.length; j++) {
      if (b.charAt(i-1) == a.charAt(j-1)) {
        matrix[i]![j] = matrix[i-1]![j-1]!;
      } else {
        matrix[i]![j] = Math.min(matrix[i-1]![j-1]! + 1, // substitution
            Math.min(matrix[i]![j-1]! + 1, // insertion
                matrix[i-1]![j]! + 1)); // deletion
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/* answerAssess.js
 *
 * Provide support assessing user answers
 *
 * Note that this module makes no assumptions about session variables.
 *
 * This functionality is separated out mainly to support "branched" answers.
 * They are semi-colon delimited branches which each consist of a regex for
 * matching the answer and a customized response:
 *
 *     regex~message;regex~message;regex~message
 *
 * The first branch is assumed to be the "correct answer" match, while the
 * rest are matches for potential incorrect answers.
 * */
// Return true if the answer is a "branched answer"
function answerIsBranched(answer: string): boolean {
  const delParams = deliverySettingsStore.get() as { branchingEnabled?: unknown };
  const branchingEnabled = Boolean(delParams?.branchingEnabled);
  return legacyTrim(answer).indexOf(';') >= 0 && branchingEnabled;
}

function normalizeAnswerValue(value: string, caseSensitive = false): string {
  const trimmed = legacyTrim(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function checkIfUserAnswerMatchesOtherAnswers(
  userAnswer: string,
  correctAnswer: string,
  caseSensitive = false
): boolean {
  const normalizedUserAnswer = normalizeAnswerValue(userAnswer, caseSensitive);
  const allCurrentAnswers = (getAllCurrentStimAnswers as () => unknown[])();
  const otherQuestionAnswers = Array.from(allCurrentAnswers)
    .filter((x): x is string => typeof x === 'string' && x !== correctAnswer);
  for (const stimStr of otherQuestionAnswers) {
    // split on ; and take first value because the first value is the correct branch in an answer
    const [firstBranch = ''] = legacyTrim(stimStr).split(';');
    const checks = legacyTrim(firstBranch).split('|');
    for (const check of checks) {
      if (check.length < 1) {
        continue;
      } // No blank checks
      const checkValue = normalizeAnswerValue(check, caseSensitive);
      if (normalizedUserAnswer.localeCompare(checkValue) === 0) {
        return true;
      }
    }
  }
  return false;
}

async function simpleStringMatch(
  userAnswer: string,
  correctAnswer: string,
  lfparameter: unknown,
  fullAnswerStr: string,
  caseSensitive = false
): Promise<number> {
  const s1 = normalizeAnswerValue(userAnswer, caseSensitive);
  const s2 = normalizeAnswerValue(correctAnswer, caseSensitive);
  const fullAnswerText = normalizeAnswerValue(fullAnswerStr, caseSensitive);
  const deliverySettings = deliverySettingsStore.get();
  const allowPhoneticMatching = deliverySettings.allowPhoneticMatching || false;

  if (s1.localeCompare(s2) === 0) {
    // Exact match!
    return 1;
  } 
  else {
    // See if they were close enough
    if (lfparameter) {
      const checkOtherAnswers = deliverySettings.checkOtherAnswers;
      // Check to see if the user answer is an exact match for other answers in the stim file,
      // If not we'll do an edit distance calculation to determine if they were close enough to the correct answer
      let matchOther;
      if (checkOtherAnswers) {
        matchOther = checkIfUserAnswerMatchesOtherAnswers(s1, fullAnswerText, caseSensitive);
      }
      if (checkOtherAnswers && matchOther) {
        return 0;
      }
    }
    if (lfparameter) {
      const editDistance = getEditDistance(s1, s2);
      const editDistScore = 1.0 - (
        editDistance /
                Math.max(s1.length, s2.length)
      );
      const lfThreshold = Number(lfparameter || 0);
      if (editDistScore >= lfThreshold) {
        return 2; // Close enough
      } 
      else if(allowPhoneticMatching) {//enable phonetic encoding
        const metaphone1 = doubleMetaphone(s1);
        const metaphone2 = doubleMetaphone(s2);
        if(compareMetaphones(metaphone1, metaphone2))
          return 3; // Metaphone match
        return 0; // No metaphone match
      } 
      else {
      return 0; // No match
      }
    } 
    else {
      // Nope - must compare exactly
      return 0;
    }
  }
}

//compares metaphones generated by doubleMetaphone.
//If m1 or m2 have one metaphone in common return true.
function compareMetaphones(m1: string[], m2: string[]): boolean {
  // Fixed: Use equality checks instead of includes() to avoid substring false positives
  // Check whether phonetic codes match exactly
  return m1[0] === m2[0] ||
         m1[0] === m2[1] ||
         (!!m1[1] && (m1[1] === m2[0] || m1[1] === m2[1]));
}

// Perform string comparison - possibly with edit distance considered.
// We return a "truthy" value if there is a match and 0 other wise. If the
// match was exact, we return 1. If we matched on edit distance, we return 2.
// We also support a |-only regex(-ish) format (which is also honored by our
// regex search)
async function stringMatch(
  stimStr: string,
  userAnswer: string,
  lfparameter: unknown,
  userInput?: string,
  caseSensitive = false
): Promise<number> {
  if (userInput === '' || userAnswer === ''){
    //user didnt enter a response.
    return 0;
  } else if (/^[\|A-Za-z0-9 \.\%]+$/i.test(stimStr)) {
    // They have the regex matching our special condition - check it manually
    const checks = legacyTrim(stimStr).split('|');
    for (const check of checks) {
      if (check.length < 1) {
        continue;
      } // No blank checks
      const matched = await simpleStringMatch(userAnswer, check, lfparameter, stimStr, caseSensitive);
      if (matched !== 0) {
        return matched; // Match!
      }
    }
    return 0; // Nothing found
  } else {
    return await simpleStringMatch(userAnswer, stimStr, lfparameter, stimStr, caseSensitive);
  }
}

// We perform regex matching, which is special in Mofacts. If the regex is
// "complicated", then we just match. However, if the regex is nothing but
// pipe-delimited (disjunction) strings that contain only letters, numbers,
// or underscores, then we manually match the pipe-delimited strings using
// the current levenshtein distance.
// ALSO notice that we use the same return values as stringMatch: 0 for no
// match, 1 for exact match, 2 for edit distance match
async function regExMatch(
  regExStr: string,
  userAnswer: string,
  lfparameter: unknown,
  fullAnswer: string,
  caseSensitive = false
): Promise<number> {
  if (lfparameter && /^[\|A-Za-z0-9 ]+$/i.test(regExStr)) {
    // They have an edit distance parameter and the regex matching our
    // special condition - check it manually
    const checks = legacyTrim(regExStr).split('|');
    for (const check of checks) {
      if (check.length < 1) {
        continue;
      } // No blank checks
      const matched = await simpleStringMatch(userAnswer, check, lfparameter, fullAnswer, caseSensitive);
      if (matched !== 0) {
        return matched; // Match!
      }
    }
    return 0; // Nothing found
  } else {
    // Just use the regex as given
    return (new RegExp(regExStr)).test(userAnswer) ? 1 : 0;
  }
}

// Return [isCorrect, matchText] where isCorrect is true if the user-supplied
// answer matches the first branch and matchText is the text response from a
// matching branch
async function matchBranching(
  answer: string,
  userAnswer: string,
  lfparameter: unknown,
  caseSensitive = false
): Promise<[boolean, string]> {
  let isCorrect = false;
  let matchText = '';
  const userAnswerCheck = normalizeAnswerValue(userAnswer, caseSensitive);

  const branches = legacyTrim(answer).split(';');
  for (const [index, branch] of branches.entries()) {
    const flds = legacyTrim(branch).split('~');
    if (flds.length != 2) {
      continue;
    }
    const [rawRegEx = '', rawMatchText = ''] = flds;
    const regExPart = normalizeAnswerValue(rawRegEx, caseSensitive);
    const matched = await regExMatch(regExPart, userAnswerCheck, lfparameter, answer, caseSensitive);
    if (matched !== 0) {
      matchText = legacyTrim(rawMatchText);
      if (matched === 2) {
        matchText = matchText + ' (you were close enough)';
      }
      isCorrect = (index === 0);
      break;
    }
  }

  return [isCorrect, matchText];
}

// Return the text of the "correct" (the first) branch
function _branchingCorrectText(answer: string): string {
  let result = '';

  const branches = legacyTrim(answer).split(';');
  if (branches.length > 0) {
    const [firstBranch = ''] = branches;
    const flds = firstBranch.split('~');
    if (flds.length == 2) {
      const [firstResult = ''] = flds;
      result = firstResult;
    }
  }

  const resultParts = result.split('|');
  return resultParts[0] ?? '';
}

async function checkAnswer(
  userAnswer: string,
  correctAnswer: string,
  originalAnswer: string,
  lfparameter: unknown,
  userInput?: string,
  caseSensitive = false
): Promise<{ isCorrect: boolean; matchText: string }> {
  const answerDisplay = originalAnswer;
  let match = 0;
  let isCorrect = false;
  let matchText = '';
  if (answerIsBranched(correctAnswer)) {
    [isCorrect, matchText] = await matchBranching(correctAnswer, userAnswer, lfparameter, caseSensitive);
  } else {
    let dispAnswer = legacyTrim(answerDisplay);
    if (dispAnswer.indexOf('|') >= 0) {
      // Take first answer if it's a bar-delimited string
      const [firstDisplayPart = ''] = dispAnswer.split('|');
      dispAnswer = legacyTrim(firstDisplayPart);
    }

    //check for answer repetition 
    const answerWordsCount = correctAnswer.split(" ").length;
    const userAnswerWords = userAnswer.split(" ");
    const userFirstAnswer =  userAnswerWords.slice(0,answerWordsCount).join(" ");
    const userSecondAnswer = userAnswerWords.slice(answerWordsCount).join(" ");
    match = await stringMatch(originalAnswer, userAnswer, lfparameter, userInput, caseSensitive);
    if(match == 0){
      match = await stringMatch(originalAnswer, userFirstAnswer, lfparameter, userInput, caseSensitive);
    }
    if(match == 0){
      match = await stringMatch(originalAnswer, userSecondAnswer, lfparameter, userInput, caseSensitive);
    }
    if (match === 0) {
      isCorrect = false;
      matchText = '';
    } else if (match === 1) {
      isCorrect = true;
      matchText = 'Correct.';
    } else if (match === 2) {
      isCorrect = true;
      matchText = 'Close enough to the correct answer \''+ dispAnswer + '\'.';
    } else if (match === 3) {
      isCorrect = true;
      matchText = 'That sounds like the answer but you\'re writing it the wrong way, the correct answer is \''+ dispAnswer + '\'.';
    } else {
      
      isCorrect = false;
      matchText = '';
    }
    
    if (!matchText) {
      matchText = isCorrect ? 'Correct' : 'Incorrect.';
    }
  }
  return {isCorrect, matchText};
}

const Answers = {
  branchingCorrectText: _branchingCorrectText,

  // Given the "raw" answer text from a cluster (in the response tag), return
  // an answer suitable for display (including on a button). Note that this
  // may be an empty string (for instance, if it's a branched answer)
  getDisplayAnswerText: function(answer: string) {
    return answerIsBranched(answer) ? _branchingCorrectText(answer) : answer;
  },

  // Returns the close study question. For a branched response, we take the
  // correct text - but for a "normal" response, we construct the study by
  // "filling in the blanks"
  clozeStudy: function(question: string, answer: string) {
    let result = question; // Always succeed

    if (answerIsBranched(answer)) {
      // Branched = use first entry's text
      answer = _branchingCorrectText(answer);
    }

    // Fill in the blank
    result = question.replace(/___+/g, answer);
    return result;
  },

  // Return [isCorrect, matchText] if userInput correctly matches answer -
  // taking into account both branching answers and edit distance
  answerIsCorrect: async function(
    userInput: string,
    answer: string,
    originalAnswer: string,
    displayedAnswer: string,
    setspec: Record<string, unknown>,
    options: { caseSensitive?: boolean } | boolean = {}
  ) {
    // Note that a missing or invalid lfparameter will result in a null value
    const setspecLf = setspec ? (setspec as { lfparameter?: unknown }).lfparameter : 0;
    const lfparameter = parseFloat(String(setspecLf || 0));

    const caseSensitive = typeof options === 'boolean'
      ? options === true
      : options?.caseSensitive === true;

    let fullTextIsCorrect = await checkAnswer(userInput, answer, originalAnswer, lfparameter, undefined, caseSensitive);

    // Try again with original answer in case we did a syllable answer and they input the full response
    if (!fullTextIsCorrect.isCorrect && !!originalAnswer) {
      let userInputWithAddedSylls = displayedAnswer + userInput;
      fullTextIsCorrect = await checkAnswer(userInputWithAddedSylls, originalAnswer, originalAnswer, lfparameter, userInput, caseSensitive);
      if ((!fullTextIsCorrect.isCorrect && !!originalAnswer) || (fullTextIsCorrect.matchText.split(' ')[0] ?? '') == 'Close') {
        let userInputWithDelimitingSpace = displayedAnswer + ' ' + userInput;
        fullTextIsCorrect = await checkAnswer(userInputWithDelimitingSpace, originalAnswer, originalAnswer, lfparameter, userInput, caseSensitive);
      }
    }

    return fullTextIsCorrect;
  },
};







