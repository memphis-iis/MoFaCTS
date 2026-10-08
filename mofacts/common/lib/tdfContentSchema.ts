import { createTdfSchemaFromRegistry } from '../fieldRegistrySections';

const documentSchema = createTdfSchemaFromRegistry();

/** Field lifecycle metadata for both uploaded { tutor } and stored { tdfs } envelopes. */
export const TDF_CONTENT_SCHEMA = {
  ...documentSchema,
  properties: { ...(documentSchema.properties as Record<string, unknown>), tdfs: documentSchema },
};
