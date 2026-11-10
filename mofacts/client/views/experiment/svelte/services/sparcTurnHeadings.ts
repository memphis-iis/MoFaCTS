import type { SparcReplayState } from '../../../../../../learning-components/units/sparcsession/sparcStateReplay';
import type { SparcOrientationRequest } from '../../../../../../learning-components/units/sparcsession/sparcTurnOrientation';
import { SPARC_FEEDBACK_MOVE_DEFINITION } from '../../../../../../learning-components/units/sparcsession/sparcMoveDefinitions';

export const SPARC_TURN_ORIENTATIONS_VALUE_KEY = '__sparcTurnOrientations';
type HeadingOrientation = Pick<SparcOrientationRequest, 'current' | 'progress' | 'reason'>;
type DialogueNode = {
  id: string; action?: string; turnEventId?: string; groupType?: string;
  children?: readonly unknown[]; completionOrientation?: boolean;
};
export type SparcTurnHeading = { count: number; orientation?: HeadingOrientation };

/** Preserve the progress snapshot accepted for each turn, rather than current progress. */
export function projectSparcTurnOrientations(replayState: SparcReplayState): Record<string, HeadingOrientation> {
  const result: Record<string, HeadingOrientation> = {};
  for (const transition of replayState.transitions) {
    for (const write of transition.writes) {
      if (write.key !== 'instructionalOrientation') continue;
      const { request } = write.value as { request: SparcOrientationRequest };
      result[transition.event.eventId] = {
        reason: request.reason, ...(request.current ? { current: request.current } : {}), progress: request.progress,
      };
    }
  }
  return result;
}

/** Feedback closes a visual turn. A menu and its accepted instruction share one heading. */
export function buildSparcTurnHeadings(
  messages: readonly DialogueNode[],
  orientations: Readonly<Record<string, HeadingOrientation>> = {},
): Map<string, SparcTurnHeading> {
  const starts = new Map<string, SparcTurnHeading>();
  let group: DialogueNode[] = [];
  let count = 0;
  const commit = () => {
    if (!group.length) return;
    const orientation = group.map(node => node.turnEventId && orientations[node.turnEventId])
      .find((entry): entry is HeadingOrientation => typeof entry === 'object' && entry !== null && entry.reason !== 'completion');
    starts.set(group[0]!.id, { count: ++count, ...(orientation ? { orientation } : {}) });
    group = [];
  };
  for (const node of messages) {
    if (node.completionOrientation || (node.turnEventId && orientations[node.turnEventId]?.reason === 'completion')) continue;
    if (node.groupType === 'button-group' && !node.children?.length) continue;
    group.push(node);
    if (node.action === SPARC_FEEDBACK_MOVE_DEFINITION.moveId) commit();
  }
  commit();
  return starts;
}
