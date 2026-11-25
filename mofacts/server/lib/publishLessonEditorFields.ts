import type { Meteor } from 'meteor/meteor';
import { Tdfs } from '../../common/Collections';
import { collectionMongoName } from '../../common/collectionOwnership';
import { LESSON_PROVIDER_KEY_FIELDS } from '../../common/lessonProviderKeys';

// observeChanges supplies whole top-level values on change, including content.
export async function publishLessonEditorFields(publication: ThisParameterType<Parameters<typeof Meteor.publish>[1]>, selector: Record<string, any>,
  fields: Record<string, number>, editor: boolean) {
  const name = collectionMongoName('Tdfs');
  function project(values: Record<string, any>) {
    if (!Object.hasOwn(values, 'content')) return values;
    const tutor = values.content?.tdfs?.tutor;
    const settings = tutor?.setspec;
    const configured = LESSON_PROVIDER_KEY_FIELDS.filter(field => Boolean(settings?.[field]));
    const projected = { ...values };
    if (settings) {
      const setspec = { ...settings };
      for (const field of LESSON_PROVIDER_KEY_FIELDS) delete setspec[field];
      projected.content = { ...values.content, tdfs: { ...values.content.tdfs, tutor: { ...tutor, setspec } } };
    }
    if (editor) projected.configuredProviderKeyFields = configured;
    return projected;
  }
  let stopped = false;
  let handle: { stop(): unknown } | undefined;
  publication.onStop(() => { stopped = true; return handle?.stop(); });
  const cursor = Tdfs.find(selector, { fields }) as unknown as { observeChangesAsync(callbacks: {
    added(id: string, values: Record<string, unknown>): void;
    changed(id: string, values: Record<string, unknown>): void;
    removed(id: string): void;
  }): Promise<{ stop(): Promise<void> }> };
  handle = await cursor.observeChangesAsync({
    added(id, values) { publication.added(name, id, project(values)); },
    changed(id, values) { publication.changed(name, id, project(values)); },
    removed(id) { publication.removed(name, id); },
  });
  if (stopped) await handle.stop();
  else publication.ready();
}
