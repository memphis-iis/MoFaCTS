import { defaultSparcStimulusRegistryEntry } from '../../../../../learning-components/units/sparcsession/sparcAuthoringEditorModel.ts';
import { parseLooseValue } from './sparcAuthoringEditPrimitives';
import { nodeStimulusIds, stimulusRegistryIdsForDisplay } from './sparcAuthoringTargets';

export function addStimulusRegistryEntry(registry) {
  registry.push(defaultSparcStimulusRegistryEntry(registry.length));
  return registry.length - 1;
}

export function removeStimulusRegistryEntry({ registry, index, flatNodes }) {
  const removed = registry[index]?.stimulusId;
  registry.splice(index, 1);
  if (removed) {
    for (const entry of flatNodes) {
      const ids = Array.isArray(entry.node.stimulusIds) ? entry.node.stimulusIds : [];
      entry.node.stimulusIds = ids.filter((id) => id !== removed);
    }
  }
}

export function updateStimulusField(stimulus, fieldName, value) {
  if (!stimulus) return false;
  stimulus[fieldName] = fieldName === 'stimulusId' || fieldName === 'label'
    ? String(value)
    : parseLooseValue(value);
  if (fieldName === 'stimulusKC') {
    stimulus.KCId = stimulus.KCId || stimulus.stimulusKC;
    stimulus.KCDefault = stimulus.KCDefault || stimulus.stimulusKC;
  }
  if (fieldName === 'clusterKC') {
    stimulus.KCCluster = stimulus.KCCluster || stimulus.clusterKC;
  }
  return true;
}

export function updateStimulusResponseField(stimulus, fieldName, value) {
  if (!stimulus) return false;
  if (!value && fieldName === 'responseKC' && !stimulus.response?.responseKey) {
    delete stimulus.response;
    return true;
  }
  stimulus.response = stimulus.response && typeof stimulus.response === 'object'
    ? stimulus.response
    : { responseKC: '', responseKey: '' };
  stimulus.response[fieldName] = fieldName === 'responseKey' ? String(value) : parseLooseValue(value);
  if (!stimulus.response.responseKC && !stimulus.response.responseKey) {
    delete stimulus.response;
  }
  return true;
}

export function behaviorModelTargetIdsForNode(display, nodeId) {
  const ids = new Set();
  if (!nodeId) {
    return ids;
  }
  const behavior = display?.behavior;
  for (const step of behavior?.steps || []) {
    for (const response of step?.responses || []) {
      if (response?.nodeRef === nodeId && typeof response.modelTarget === 'string' && response.modelTarget.trim()) {
        ids.add(response.modelTarget.trim());
      }
    }
  }
  for (const path of behavior?.paths || []) {
    for (const response of path?.responses || []) {
      if (response?.nodeRef === nodeId && typeof response.modelTarget === 'string' && response.modelTarget.trim()) {
        ids.add(response.modelTarget.trim());
      }
    }
  }
  return ids;
}

export function materializeBehaviorModelTargetsForNode(display, node) {
  if (!node?.id || !display) {
    return false;
  }
  const behaviorTargetIds = behaviorModelTargetIdsForNode(display, node.id);
  if (behaviorTargetIds.size === 0) {
    return false;
  }
  const registryIds = stimulusRegistryIdsForDisplay(display);
  const existingIds = new Set(nodeStimulusIds(node));
  let changed = false;
  for (const id of behaviorTargetIds) {
    if (registryIds.has(id) && !existingIds.has(id)) {
      existingIds.add(id);
      changed = true;
    }
  }
  if (changed) {
    node.stimulusIds = [...existingIds];
  }
  return changed;
}

export function toggleNodeStimulus(node, stimulusId, checked) {
  if (!node) return false;
  const ids = new Set(nodeStimulusIds(node));
  if (checked) ids.add(stimulusId);
  else ids.delete(stimulusId);
  node.stimulusIds = [...ids];
  return true;
}
