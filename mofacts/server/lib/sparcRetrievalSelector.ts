import { parseSparcRetrievalCategory } from '../../common/lib/sparcRetrieval';
import { SPARC_EMBEDDING_MODEL } from '../../common/lib/sparcEmbeddingModel';
import { SPARC_FIGURE_LIBRARY_SETTINGS } from '../../common/lib/sparcFigureLibrary';
import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../common/lib/sparcPromptImage';
import { SPARC_INSTRUCTIONAL_NEED_VERSION } from '../../../learning-components/runtime/sparcInstructionalNeed';
import { SPARC_VIDEO_EMBEDDING_VERSION } from '../../../learning-components/runtime/sparcVideo';
import { SPARC_MOVE_LIBRARY_VERSION } from '../../../learning-components/runtime/sparcMoveLibraryContract';

/** Category membership is a database filter; no content or descriptive metadata enters vector search. */
export function sparcRetrievalSelector(value: unknown): Record<string, unknown> {
  const category = parseSparcRetrievalCategory(value);
  if (category.kind === 'visual') return { embeddingModel: SPARC_EMBEDDING_MODEL, $or: [
    { kind: 'image', version: SPARC_FIGURE_LIBRARY_SETTINGS.version, imageModel: SPARC_PROMPT_IMAGE_SETTINGS.model,
      embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION, ready: true },
    ...(category.language ? [{ kind: 'video', embeddingVersion: SPARC_VIDEO_EMBEDDING_VERSION, 'content.video.language': category.language }] : []),
  ] };
  const selector: Record<string, unknown> = { kind: category.kind, version: SPARC_MOVE_LIBRARY_VERSION,
    embeddingModel: SPARC_EMBEDDING_MODEL, embeddingVersion: SPARC_INSTRUCTIONAL_NEED_VERSION };
  if (category.readingLevel === 'unbiased') selector.$or = [
    { 'context.readingLevel': 'unbiased' }, { 'context.readingLevel': { $exists: false } },
  ];
  else selector['context.readingLevel'] = category.readingLevel;
  if (category.kind === 'question') selector['context.responseFormat'] = category.responseFormat;
  if (category.kind === 'instruction') selector['context.supportKind'] = category.supportKind ?? { $exists: false };
  if (category.kind !== 'instruction' && category.supportKind === 'written') {
    selector['content.video'] = { $exists: false }; selector['content.figure'] = { $exists: false };
  }
  return selector;
}
