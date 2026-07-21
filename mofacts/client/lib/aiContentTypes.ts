export type CreationModuleId = 'learningSession' | 'assessmentSession';

export type CreatedOutput = {
  moduleId: CreationModuleId;
  title: string;
  artifactKindLabel: string;
  tdfId?: string;
  packageAssetId?: string;
  route?: string;
  editRoute?: string;
  tdfEditRoute?: string;
  itemCount: number;
  summary?: string;
};
