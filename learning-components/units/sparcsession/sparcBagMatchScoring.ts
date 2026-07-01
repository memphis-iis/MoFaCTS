import { cosineSimilarityFromEmbeddings } from '../../runtime/vectorSimilarity';
import { bandSparcBagMatch, type SparcMatchBand } from './sparcSelectorSignals';

export type SparcBagMatchKind = 'goodAnswer' | 'badAnswer';

export type SparcBagMatchScore = {
  readonly kind: SparcBagMatchKind;
  readonly score: number;
  readonly band: SparcMatchBand;
  readonly bagText: string;
  readonly model?: string;
  readonly metric: 'cosine_similarity_normalized_vectors';
};

function nonBlankLines(values: readonly unknown[]): string[] {
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}

export function buildSparcGoodAnswerBagText(targets: readonly Readonly<Record<string, unknown>>[]): string {
  const lines = targets.flatMap((target) => nonBlankLines([
    target.label,
    target.proposition,
    target.assertion,
  ]));
  return [...new Set(lines)].join('\n');
}

export function buildSparcBadAnswerBagText(misconceptions: readonly Readonly<Record<string, unknown>>[]): string {
  const lines = misconceptions.flatMap((misconception) => {
    const authoredContent = Array.isArray(misconception.authoredContent)
      ? misconception.authoredContent
      : [];
    return nonBlankLines([
      misconception.label,
      misconception.description,
      misconception.repair,
      ...authoredContent,
    ]);
  });
  return [...new Set(lines)].join('\n');
}

export function scoreSparcBagMatch(params: {
  readonly kind: SparcBagMatchKind;
  readonly bagText: string;
  readonly bagEmbedding: readonly number[];
  readonly learnerEmbedding: readonly number[];
  readonly model?: string;
}): SparcBagMatchScore {
  const score = cosineSimilarityFromEmbeddings({
    a: params.learnerEmbedding,
    b: params.bagEmbedding,
    label: `SPARC ${params.kind} bag match`,
  });
  return {
    kind: params.kind,
    score,
    band: bandSparcBagMatch(score),
    bagText: params.bagText,
    ...(params.model ? { model: params.model } : {}),
    metric: 'cosine_similarity_normalized_vectors',
  };
}
