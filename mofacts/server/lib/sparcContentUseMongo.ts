import { MongoInternals } from 'meteor/mongo';
import { Histories } from '../../common/Collections';
import { HistoryCommitState } from './historyCommitMongo';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { SparcMoveRequests } from './sparcMoveLibraryStorage';
import { SparcFigureRequests } from './sparcFigureLibraryStorage';
import { createSparcContentUseStorage, type SparcContentUseCollection } from './sparcContentUse';
import { serverConsole } from '../serverComposition';

let storage: ReturnType<typeof createSparcContentUseStorage> | undefined;

/** Lazy wiring keeps the two existing decision adapters on one transactional owner. */
export function getSparcContentUseStorage() {
  storage ??= createSparcContentUseStorage({
    requests: SparcMoveRequests.rawCollection() as unknown as SparcContentUseCollection,
    figures: SparcFigureRequests.rawCollection() as unknown as SparcContentUseCollection,
    entries: SparcInstructionalLibrary.rawCollection() as unknown as SparcContentUseCollection,
    histories: Histories.rawCollection() as unknown as SparcContentUseCollection,
    states: HistoryCommitState.rawCollection() as unknown as SparcContentUseCollection,
    startSession: () => MongoInternals.defaultRemoteCollectionDriver().mongo.client.startSession(),
    log: (message, progress) => serverConsole(message, progress),
  });
  return storage;
}
