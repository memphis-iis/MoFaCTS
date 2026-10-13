import type { SparcFigureLibraryEntry } from './sparcFigureLibraryService';

export type SparcFigureVersion = {
  _id: string; libraryId: string; revision: number; createdAt: Date;
  previousAssetId?: string; createdBy?: string; replacementIdentity?: string;
};
export type SparcFigureVersionStore = {
  find: (assetId: string) => Promise<SparcFigureVersion | undefined>;
  history: (libraryId: string, beforeRevision: number) => Promise<SparcFigureVersion[]>;
  publish: (params: { libraryId: string; expectedAssetId: string; assetId: string; identity: string; userId: string }) => Promise<SparcFigureLibraryEntry>;
};
