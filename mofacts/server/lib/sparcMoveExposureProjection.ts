import { moveDigest, type MoveExposure } from './sparcMoveLibraryService';

/** Pure projection of durable tutor output; assessment/learner rows create no exposures. */
export function moveExposuresFromHistory(record: Record<string, unknown>): MoveExposure[] {
  const extension = record.sparc as { stateTransition?: { event?: { eventId?: string }; writes?: { value?: { node?: Record<string, unknown>; nodes?: Record<string, unknown>[] } }[] } } | undefined;
  const transition = extension?.stateTransition;
  const result: MoveExposure[] = [];
  for (const write of transition?.writes ?? []) {
    const nodes = write.value?.node ? [write.value.node] : write.value?.nodes ?? [];
    for (const node of nodes) {
      if (typeof node.id !== 'string' || typeof node.value !== 'string' || node.speaker === 'learner') continue;
      const ref = node.primitiveReference as { entryId?: string; priorNodeId?: string } | undefined;
      const kind = node.component ?? (node.id.endsWith(':question') ? 'question' : ref?.entryId ? 'feedback' : undefined);
      if (kind !== 'question' && !ref?.entryId) continue;
      const eventId = transition?.event?.eventId;
      if (!eventId || typeof record.sessionID !== 'string' || typeof record.userId !== 'string' || typeof record.TDFId !== 'string') throw new Error('Historical primitive has no resume identity');
      result.push({ _id: moveDigest([record.userId, record.TDFId, record.sessionID, eventId, kind]), userId: record.userId,
        tdfId: record.TDFId, sessionId: record.sessionID, eventId, kind: String(kind), nodeId: node.id,
        entryId: ref?.entryId ?? `historical:${moveDigest(node.value)}`,
        ...(ref?.priorNodeId ? { priorNodeId: ref.priorNodeId } : {}),
        content: { text: node.value } });
    }
  }
  return result;
}
