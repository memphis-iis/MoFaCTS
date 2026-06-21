export function behaviorModelTargetIdsForNode(display, nodeId) {
  const indices = new Set();
  if (!nodeId) {
    return indices;
  }
  const behavior = display?.behavior;
  for (const step of behavior?.steps || []) {
    for (const response of step?.responses || []) {
      if (response?.nodeRef === nodeId && Number.isInteger(Number(response.clusterIndex))) {
        indices.add(Number(response.clusterIndex));
      }
    }
  }
  for (const path of behavior?.paths || []) {
    for (const response of path?.responses || []) {
      if (response?.nodeRef === nodeId && Number.isInteger(Number(response.clusterIndex))) {
        indices.add(Number(response.clusterIndex));
      }
    }
  }
  return indices;
}

export function materializeBehaviorClusterTargetsForNode(display, node, clusterChoices) {
  if (!node?.id || !display) {
    return false;
  }
  const behaviorTargetIndices = behaviorModelTargetIdsForNode(display, node.id);
  if (behaviorTargetIndices.size === 0) {
    return false;
  }
  const validIndices = new Set((clusterChoices || []).filter((entry) => entry.hasFirstStimulus).map((entry) => entry.clusterIndex));
  const existingIndices = new Set(Array.isArray(node.clusterIndices) ? node.clusterIndices : []);
  let changed = false;
  for (const clusterIndex of behaviorTargetIndices) {
    if (validIndices.has(clusterIndex) && !existingIndices.has(clusterIndex)) {
      existingIndices.add(clusterIndex);
      changed = true;
    }
  }
  if (changed) {
    node.clusterIndices = [...existingIndices];
  }
  return changed;
}

export function toggleNodeCluster(node, clusterIndex, checked) {
  if (!node) return false;
  const normalizedClusterIndex = Number(clusterIndex);
  if (!Number.isInteger(normalizedClusterIndex) || normalizedClusterIndex < 0) {
    throw new Error(`Invalid SPARC clusterIndex ${String(clusterIndex)}.`);
  }
  const indices = new Set(Array.isArray(node.clusterIndices) ? node.clusterIndices : []);
  if (checked) indices.add(normalizedClusterIndex);
  else indices.delete(normalizedClusterIndex);
  node.clusterIndices = [...indices].sort((left, right) => left - right);
  return true;
}
