import { Meteor } from 'meteor/meteor';
import { requireSparcLessonAccess } from './sparcLessonAccess';
import type { MethodAuthorizationDeps } from './methodAuthorization';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { ensureSparcContentUseCatalog } from './sparcContentUse';
import type { SparcContentUseCollection } from './sparcContentUse';
import { ensureSparcContentUseForUser, SparcMoveRequests } from './sparcMoveLibraryStorage';
import { SparcFigureRequests } from './sparcFigureLibraryStorage';
import { createSparcRetrievalPublicationHandler } from './sparcRetrievalPublicationHandler';

export function registerSparcRetrievalPublication(getAuthorization: () => MethodAuthorizationDeps) {
  Meteor.publish('sparcRetrievalEmbeddings', createSparcRetrievalPublicationHandler({
    authorize: (userId, tdfId) => requireSparcLessonAccess(getAuthorization(), userId, tdfId),
    initializeCatalog: () => ensureSparcContentUseCatalog(SparcInstructionalLibrary.rawCollection() as unknown as SparcContentUseCollection),
    initializeUser: ensureSparcContentUseForUser,
    observeMoves: async (selector, options, callbacks) => SparcMoveRequests.find(selector, options).observeChanges(callbacks),
    observeVisuals: async (selector, options, callbacks) => SparcFigureRequests.find(selector, options).observeChanges(callbacks),
    observeEntries: async (selector, options, callbacks) => SparcInstructionalLibrary.find(selector, options).observeChanges(callbacks),
    unavailableError: () => new Meteor.Error('sparc-content-use-unavailable', 'Reopen this lesson: its content eligibility is unavailable.'),
  }));
}
