export function findSparcTargets(candidatePages) {
  return (candidatePages || []).map((page, pageIndex) => {
    if (!page?.pageId || typeof page.pageId !== 'string') {
      throw new Error(`SPARC page at setspec.sparcPages[${pageIndex}] requires a string pageId.`);
    }
    if (!page.display || typeof page.display !== 'object' || !Array.isArray(page.display.nodes)) {
      throw new Error(`SPARC page "${page.pageId}" requires a display with nodes.`);
    }
    return {
      key: page.pageId,
      pageId: page.pageId,
      pageIndex,
      label: page.pageId,
    };
  });
}

export function clusterChoicesForAuthoring(clusters) {
  return (clusters || []).map((cluster, clusterIndex) => {
    const firstStim = Array.isArray(cluster?.stims) ? cluster.stims[0] : null;
    return {
      clusterIndex,
      label: cluster?.clustername || firstStim?.textStimulus || firstStim?.text || `Cluster ${clusterIndex}`,
      hasFirstStimulus: Boolean(firstStim),
    };
  });
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

export function nodeClusterIndices(node) {
  return Array.isArray(node?.clusterIndices) ? node.clusterIndices : [];
}

export function clusterIndicesForChoices(clusterChoices) {
  return new Set((clusterChoices || []).filter((entry) => entry.hasFirstStimulus).map((entry) => entry.clusterIndex));
}
