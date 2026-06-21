export function findSparcTargets(candidateClusters) {
  const targets = [];
  (candidateClusters || []).forEach((cluster, clusterIndex) => {
    (cluster?.stims || []).forEach((stim, stimIndex) => {
      if (stim?.display?.type === 'sparc' && Array.isArray(stim.display.nodes)) {
        targets.push({
          key: `${clusterIndex}:${stimIndex}`,
          clusterIndex,
          stimIndex,
          label: stim.display.documentId || cluster.clustername || `Cluster ${clusterIndex + 1}, Stim ${stimIndex + 1}`,
        });
      }
    });
  });
  return targets;
}

export function flattenNodes(nodes, depth = 0, parent = null) {
  const results = [];
  for (const node of nodes || []) {
    if (!node || typeof node !== 'object') continue;
    results.push({ node, depth, parent });
    if (node.nodeType === 'group') {
      results.push(...flattenNodes(node.children || [], depth + 1, node.id));
    }
    if (node.atomType === 'panel-selector') {
      for (const panel of node.panels || []) {
        results.push(...flattenNodes(panel.children || [], depth + 1, panel.id));
      }
    }
  }
  return results;
}

export function nodeStimulusIds(node) {
  return Array.isArray(node?.stimulusIds) ? node.stimulusIds : [];
}

export function stimulusRegistryIdsForDisplay(display) {
  return new Set((display?.stimulusRegistry || []).map((entry) => entry?.stimulusId).filter(Boolean));
}
