export interface ExternalItem {
  readonly prompt: string;
  readonly answer: string;
}

export interface LearningStimulus {
  readonly stimulusText: string;
  readonly expectedResponse: string;
}

export interface ContentAdapter {
  readonly sourceType: string;
  convert(items: readonly ExternalItem[]): LearningStimulus[];
}

export function createMinimalContentAdapter(): ContentAdapter {
  return {
    sourceType: "minimal-content",

    convert(items) {
      if (items.length === 0) {
        throw new Error("Cannot convert an empty content item set.");
      }

      return items.map((item) => ({
        stimulusText: item.prompt,
        expectedResponse: item.answer,
      }));
    },
  };
}
