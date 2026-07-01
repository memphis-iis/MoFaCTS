import type { SparcWorkingMemoryFact } from '../units/sparcsession/sparcSessionContracts';
import {
  cosineSimilarityScore,
  normalizeEmbeddingVector,
  roundUnitSimilarityScore,
} from './vectorSimilarity';

export type ClusterKcRelationship = {
  readonly sourceClusterKC: string;
  readonly targetClusterKC: string;
  readonly strength: number;
  readonly relation?: string;
};

export type ClusterKcRelationshipNode = {
  readonly clusterKC: string;
  readonly description: string;
  readonly sourceId?: string;
};

export type ClusterKcRelationshipMatrix = Record<string, Record<string, number>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeClusterKcEmbeddingVector(vector: readonly number[]): number[] {
  return normalizeEmbeddingVector(vector, 'clusterKC relationship embedding vector');
}

export function cosineClusterKcRelationshipScore(
  normalizedA: readonly number[],
  normalizedB: readonly number[],
): number {
  if (normalizedA.length !== normalizedB.length) {
    throw new Error('clusterKC relationship embedding dimensions do not match');
  }
  return cosineSimilarityScore({
    normalizedA,
    normalizedB,
    label: 'clusterKC relationship embedding',
  });
}

export function computeClusterKcRelationshipsFromEmbeddings(params: {
  readonly nodes: readonly ClusterKcRelationshipNode[];
  readonly embeddings: readonly (readonly number[])[];
}): ClusterKcRelationship[] {
  if (params.nodes.length !== params.embeddings.length) {
    throw new Error('clusterKC relationship embedding count does not match node count');
  }
  const normalizedEmbeddings = params.embeddings.map(normalizeClusterKcEmbeddingVector);
  const relationships: ClusterKcRelationship[] = [];
  for (let sourceIndex = 0; sourceIndex < params.nodes.length; sourceIndex += 1) {
    const source = params.nodes[sourceIndex]!;
    for (let targetIndex = 0; targetIndex < params.nodes.length; targetIndex += 1) {
      if (sourceIndex === targetIndex) {
        continue;
      }
      const target = params.nodes[targetIndex]!;
      relationships.push({
        sourceClusterKC: source.clusterKC,
        targetClusterKC: target.clusterKC,
        relation: 'related',
        strength: cosineClusterKcRelationshipScore(
          normalizedEmbeddings[sourceIndex]!,
          normalizedEmbeddings[targetIndex]!,
        ),
      });
    }
  }
  return relationships;
}

export function normalizeClusterKcRelationshipMatrix(
  matrix: unknown,
  resolveClusterKC: (sourceId: string) => string | undefined,
): ClusterKcRelationship[] {
  if (!isRecord(matrix)) {
    return [];
  }
  const relationships: ClusterKcRelationship[] = [];
  for (const [sourceId, rawTargets] of Object.entries(matrix)) {
    const sourceClusterKC = resolveClusterKC(sourceId);
    if (!sourceClusterKC || !isRecord(rawTargets)) {
      continue;
    }
    for (const [targetId, rawScore] of Object.entries(rawTargets)) {
      const targetClusterKC = resolveClusterKC(targetId);
      if (!targetClusterKC) {
        continue;
      }
      relationships.push({
        sourceClusterKC,
        targetClusterKC,
        strength: Number(rawScore),
        relation: 'related',
      });
    }
  }
  return relationships;
}

export function normalizeClusterKcRelationshipList(
  value: unknown,
): ClusterKcRelationship[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => ({
    sourceClusterKC: nonBlankString((entry as Record<string, unknown> | null)?.sourceClusterKC),
    targetClusterKC: nonBlankString((entry as Record<string, unknown> | null)?.targetClusterKC),
    strength: Number((entry as Record<string, unknown> | null)?.strength),
    relation: nonBlankString((entry as Record<string, unknown> | null)?.relation) || 'related',
  }));
}

export function validateClusterKcRelationships(params: {
  readonly relationships: readonly ClusterKcRelationship[];
  readonly clusterKCs: ReadonlySet<string>;
  readonly label?: string;
}): void {
  const label = params.label || 'clusterKcRelationships';
  for (const [index, relationship] of params.relationships.entries()) {
    if (!relationship.sourceClusterKC) {
      throw new Error(`${label}[${index}].sourceClusterKC is required`);
    }
    if (!relationship.targetClusterKC) {
      throw new Error(`${label}[${index}].targetClusterKC is required`);
    }
    if (!params.clusterKCs.has(relationship.sourceClusterKC)) {
      throw new Error(`${label}[${index}].sourceClusterKC does not resolve to exactly one generated clusterKC`);
    }
    if (!params.clusterKCs.has(relationship.targetClusterKC)) {
      throw new Error(`${label}[${index}].targetClusterKC does not resolve to exactly one generated clusterKC`);
    }
    if (!Number.isFinite(relationship.strength) || relationship.strength < 0 || relationship.strength > 1) {
      throw new Error(`${label}[${index}].strength must be a number from 0 to 1`);
    }
  }
}

export function computeClusterKcCentrality(params: {
  readonly clusterKCs: readonly string[];
  readonly relationships: readonly ClusterKcRelationship[];
}): Map<string, number> {
  const totals = new Map(params.clusterKCs.map((clusterKC) => [clusterKC, 0]));
  const counts = new Map(params.clusterKCs.map((clusterKC) => [clusterKC, 0]));
  for (const relationship of params.relationships) {
    if (!totals.has(relationship.sourceClusterKC) || !totals.has(relationship.targetClusterKC)) {
      continue;
    }
    totals.set(relationship.sourceClusterKC, (totals.get(relationship.sourceClusterKC) ?? 0) + relationship.strength);
    counts.set(relationship.sourceClusterKC, (counts.get(relationship.sourceClusterKC) ?? 0) + 1);
  }
  const centrality = new Map<string, number>();
  for (const clusterKC of params.clusterKCs) {
    const count = counts.get(clusterKC) ?? 0;
    centrality.set(clusterKC, count > 0 ? roundUnitSimilarityScore((totals.get(clusterKC) ?? 0) / count) : 0);
  }
  return centrality;
}

export function createClusterKcGraphFacts(params: {
  readonly nodes: readonly ClusterKcRelationshipNode[];
  readonly relationships: readonly ClusterKcRelationship[];
}): SparcWorkingMemoryFact[] {
  const clusterKCs = params.nodes.map((node) => node.clusterKC);
  const centralityByClusterKC = computeClusterKcCentrality({
    clusterKCs,
    relationships: params.relationships,
  });
  return [
    ...params.nodes.map((node) => ({
      factType: 'kcGraph.node',
      slots: {
        clusterKC: node.clusterKC,
        description: node.description,
        centrality: centralityByClusterKC.get(node.clusterKC) ?? 0,
        ...(node.sourceId ? { sourceId: node.sourceId } : {}),
      },
    })),
    ...params.relationships.map((relationship) => ({
      factType: 'kcGraph.relationship',
      slots: {
        sourceClusterKC: relationship.sourceClusterKC,
        targetClusterKC: relationship.targetClusterKC,
        strength: relationship.strength,
        ...(relationship.relation ? { relation: relationship.relation } : {}),
      },
    })),
  ];
}
