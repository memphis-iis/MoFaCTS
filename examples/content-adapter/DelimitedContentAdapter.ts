export interface DelimitedContentRow {
  readonly prompt: string;
  readonly answer: string;
}

export interface AdaptedStimulus {
  readonly prompt: string;
  readonly correctResponse: string;
}

export function parseDelimitedContent(source: string, delimiter = ','): AdaptedStimulus[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [prompt, answer, ...extra] = line.split(delimiter).map((value) => value.trim());
      if (!prompt || !answer || extra.length) {
        throw new Error(`Delimited content row ${index + 1} must contain exactly prompt and answer fields`);
      }

      return {
        prompt,
        correctResponse: answer,
      };
    });
}
