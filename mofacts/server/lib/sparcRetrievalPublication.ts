import { NAMED_PUBLICATION_VERIFICATIONS } from '../../common/securityAudit/verificationCatalog.ts';
import { registerNamedPublication } from '../securitySurfaces/registerNamedPublication.ts';
import { Meteor } from 'meteor/meteor';
import { requireSparcLessonAccess } from './sparcLessonAccess';
import type { MethodAuthorizationDeps } from './methodAuthorization';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { createSparcRetrievalPublicationHandler } from './sparcRetrievalPublicationHandler';

export function registerSparcRetrievalPublication(getAuthorization: () => MethodAuthorizationDeps) {
  registerNamedPublication(Meteor, 'sparcRetrievalEmbeddings', {
    policy: { kind: 'sparc-lesson', authorize: (userId, tdfId) => requireSparcLessonAccess(getAuthorization(), userId, tdfId) },
    dataEgress: 'eligible-entry-embeddings',
    verification: NAMED_PUBLICATION_VERIFICATIONS.sparcRetrievalEmbeddings,
  }, createSparcRetrievalPublicationHandler({
    observeEntries: async (selector, options, callbacks) => SparcInstructionalLibrary.find(selector, options).observeChanges(callbacks),
    unavailableError: () => new Meteor.Error('sparc-content-use-unavailable', 'Reopen this lesson: its content eligibility is unavailable.'),
  }));
}
