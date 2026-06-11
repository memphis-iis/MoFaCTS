import { resolveSparcDocumentAddress } from './sparcDocumentAddressing';
import type {
  SparcAuthoredDocument,
  SparcDocumentAddress,
  SparcModelTargetIdentity,
} from './sparcSessionContracts';

export function resolveSparcAuthoredModelTarget(
  document: SparcAuthoredDocument,
  address: SparcDocumentAddress,
): SparcModelTargetIdentity | undefined {
  const resolved = resolveSparcDocumentAddress(document, address);
  const addressedNodes = [
    resolved.node,
    ...resolved.pathNodes,
  ];

  for (const node of addressedNodes.slice().reverse()) {
    if (node.modelTarget) {
      return node.modelTarget;
    }
  }

  return undefined;
}
