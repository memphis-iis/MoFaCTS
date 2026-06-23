export function createSparcAuthoringControllerAdapters({
  getActiveDisplay,
  getActiveNode,
  getActiveProductionRule,
  setActiveProductionRuleIndex,
  setErrorText,
  markChanged,
  ensureProductionRules,
  getClusterChoices,
  actions,
}) {
  const markIfChanged = (changed) => {
    if (changed) markChanged();
  };

  return {
    materializeBehaviorModelTargetsForNode(node) {
      markIfChanged(actions.materializeBehaviorClusterTargetsForNode(getActiveDisplay(), node, getClusterChoices()));
    },
    toggleNodeCluster(clusterIndex, checked) {
      markIfChanged(actions.toggleNodeCluster(getActiveNode(), clusterIndex, checked));
    },
    addProductionRule() {
      try {
        setActiveProductionRuleIndex(actions.addProductionRule(ensureProductionRules()));
        markChanged();
      } catch (error) {
        setErrorText(error.message || String(error));
      }
    },
    removeProductionRule(index) {
      setActiveProductionRuleIndex(actions.removeProductionRule(ensureProductionRules(), index));
      markChanged();
    },
    moveProductionRule(index, delta) {
      const nextIndex = actions.moveRule(ensureProductionRules(), index, delta);
      if (nextIndex !== index) {
        setActiveProductionRuleIndex(nextIndex);
        markChanged();
      }
    },
    addProductionCondition(kind = 'fact-pattern') {
      markIfChanged(actions.addProductionCondition(getActiveProductionRule(), kind));
    },
    removeProductionCondition(index) {
      markIfChanged(actions.removeProductionCondition(getActiveProductionRule(), index));
    },
    changeProductionConditionKind(index, kind) {
      markIfChanged(actions.changeProductionConditionKind(getActiveProductionRule(), index, kind));
    },
    addProductionTest() {
      markIfChanged(actions.addProductionTest(getActiveProductionRule()));
    },
    removeProductionTest(index) {
      markIfChanged(actions.removeProductionTest(getActiveProductionRule(), index));
    },
    addProductionEffect(type = 'classify') {
      markIfChanged(actions.addProductionEffect(getActiveProductionRule(), type));
    },
    removeProductionEffect(index) {
      markIfChanged(actions.removeProductionEffect(getActiveProductionRule(), index));
    },
    changeProductionEffectType(index, type) {
      markIfChanged(actions.changeProductionEffectType(getActiveProductionRule(), index, type));
    },
  };
}
