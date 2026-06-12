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
  if (resolved.node.modelTarget) {
    return resolved.node.modelTarget;
  }

  return undefined;
}
