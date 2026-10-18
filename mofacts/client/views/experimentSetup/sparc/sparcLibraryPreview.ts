import { projectSparcInstructionMessages } from '../../../../../learning-components/units/sparcsession/sparcInstructionalPrimitives';
import type { SparcPrimitiveContent, SparcPrimitiveKind } from '../../../../../learning-components/runtime/sparcMoveLibraryContract';

/** Adapt a saved library primitive to the learner's existing display contract.
 * Inspection cannot submit responses or write learner history.
 */
export function sparcLibraryPreviewNode(entry: {
  id: string; kind: SparcPrimitiveKind | 'video'; move: string; content: SparcPrimitiveContent;
}, scope: 'inspection' | 'thumbnail' = 'inspection') {
  const turnEventId = `library:${scope}:${entry.id}`;
  return projectSparcInstructionMessages([{
    id: `${turnEventId}:${entry.kind}`, turnEventId,
    nodeType: 'atomic', atomType: 'dialogue-utterance', speaker: 'tutor',
    action: entry.move, component: entry.kind, value: entry.content.text,
    ...(entry.content.video ? { video: entry.content.video } : {}),
    ...(entry.content.figure ? { figure: entry.content.figure } : {}),
    ...(entry.content.supportHeading ? { supportHeading: entry.content.supportHeading } : {}),
    ...(entry.content.choices ? { choices: entry.content.choices } : {}),
    readOnly: true,
  }])[0];
}
