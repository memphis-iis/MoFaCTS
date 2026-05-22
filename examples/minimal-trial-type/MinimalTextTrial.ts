export interface MinimalTrialPrompt {
  readonly prompt: string;
  readonly expectedAnswer: string;
}

export interface MinimalTrialResult {
  readonly response: string;
  readonly correct: boolean;
}

export function scoreMinimalTextTrial(prompt: MinimalTrialPrompt, response: string): MinimalTrialResult {
  const normalizedExpected = prompt.expectedAnswer.trim().toLowerCase();
  const normalizedResponse = response.trim().toLowerCase();

  return {
    response,
    correct: normalizedResponse === normalizedExpected,
  };
}
