export interface TrialPrompt {
  readonly prompt: string;
  readonly expectedAnswer: string;
}

export interface TrialResult {
  readonly response: string;
  readonly wasCorrect: boolean;
  readonly practiceTimeMs: number;
}

export interface TrialType {
  readonly type: string;
  start(prompt: TrialPrompt): void;
  submit(response: string, practiceTimeMs: number): TrialResult;
}

export function createMinimalTrialType(): TrialType {
  let activePrompt: TrialPrompt | null = null;

  return {
    type: "minimal-trial",

    start(prompt) {
      activePrompt = prompt;
    },

    submit(response, practiceTimeMs) {
      if (!activePrompt) {
        throw new Error("Cannot submit before start().");
      }

      return {
        response,
        wasCorrect: response.trim() === activePrompt.expectedAnswer.trim(),
        practiceTimeMs,
      };
    },
  };
}
