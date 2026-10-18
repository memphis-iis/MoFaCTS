/** Presentation of deliberately removed shared content; never a learner assessment. */
export const SPARC_ADMINISTRATIVE_REMOVAL_TEXT = 'Administrative removal';
export type SparcSavedImage = { dataUrl: string; administrativeRemoval?: never }
  | { administrativeRemoval: true; dataUrl?: never };

type ContentNode = Record<string, any>;
export function sparcContentReferenceIds(nodes: readonly ContentNode[]): string[] {
  const ids = new Set<string>();
  const visit = (node: ContentNode) => {
    for (const id of [node.primitiveReference?.entryId, node.figure?.assetId, node.video?.segmentId]) {
      if (typeof id === 'string') ids.add(id);
    }
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return [...ids].sort();
}

/** Render copies only. Journaled content, response keys, and model state are untouched. */
export function projectSparcAdministrativeRemovals<T extends ContentNode>(nodes: readonly T[], removed: ReadonlySet<string>): T[] {
  return nodes.map(node => {
    // Standalone figures have their own reader and placeholder; preserve surrounding tutor text.
    const ids = [node.primitiveReference?.entryId, node.video?.segmentId].filter((id): id is string => typeof id === 'string');
    if (!node.children?.length && (node.administrativeRemoval || ids.some(id => removed.has(id)))) {
      const copy: ContentNode = { ...node, value: SPARC_ADMINISTRATIVE_REMOVAL_TEXT, administrativeRemoval: true, readOnly: true };
      for (const key of ['figure', 'video', 'choices', 'supportHeading', 'children']) delete copy[key];
      if (copy.primitiveReference) copy.primitiveReference = { ...copy.primitiveReference, priorNodeId: undefined };
      return copy as T;
    }
    return { ...node, ...(node.children ? { children: projectSparcAdministrativeRemovals(node.children, removed) } : {}) };
  });
}
