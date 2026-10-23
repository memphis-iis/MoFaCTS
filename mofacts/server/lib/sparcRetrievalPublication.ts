import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/alanning:roles';
import { SparcInstructionalLibrary } from './sparcInstructionalLibraryStorage';
import { sparcRetrievalSelector } from './sparcRetrievalSelector';
import { SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION, parseSparcRetrievalCategory, sparcRetrievalCategoryKey } from '../../common/lib/sparcRetrieval';

Meteor.publish('sparcRetrievalEmbeddings', async function(value: unknown) {
  if (!this.userId || !await Roles.userIsInRoleAsync(this.userId, 'admin')) throw new Meteor.Error(403, 'Only admins can access the SPARC retrieval cache');
  const category = parseSparcRetrievalCategory(value);
  const prefix = `${sparcRetrievalCategoryKey(category)}:`;
  let stopped = false;
  let handle: { stop(): void | Promise<void> } | undefined;
  this.onStop(() => { stopped = true; void handle?.stop(); });
  // Intentional complete vector-only cache for this indexed category. Mongo batches transport;
  // practice queries perform no database candidate paging, ranking, or content transfer.
  handle = await SparcInstructionalLibrary.find(sparcRetrievalSelector(category), { fields: { embedding: 1 }, batchSize: 100 }).observeChanges({
    added: (id: string, fields: { embedding?: number[] }) => { if (!stopped) this.added(SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION, prefix + id, fields); },
    changed: (id: string, fields: { embedding?: number[] }) => { if (!stopped) this.changed(SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION, prefix + id, fields); },
    removed: (id: string) => { if (!stopped) this.removed(SPARC_RETRIEVAL_EMBEDDINGS_COLLECTION, prefix + id); },
  });
  if (stopped) await handle!.stop(); else this.ready();
});
