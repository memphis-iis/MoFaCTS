export type ModelProgressItem = {
  readonly id: string;
  readonly stimulusKC: string | number;
  readonly clusterKC?: string | number;
  readonly probability: number;
  readonly introduced: boolean;
  readonly current: boolean;
  readonly canUse: boolean;
};

export type ModelProgressProvider = {
  readonly getModelProgressItems: () => readonly ModelProgressItem[];
};

