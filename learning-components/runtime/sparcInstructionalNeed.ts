import { SPARC_TARGET_CATEGORIES, type SparcTargetCategory } from './sparcTargetCategories';

/** Representation identity is metadata, never part of the embedded instructional meaning. */
export const SPARC_INSTRUCTIONAL_NEED_VERSION = 'sparc-instructional-need-v1';
// The browser search and server acceptance share the requested 0.95 reuse boundary.
export const SPARC_LIBRARY_SIMILARITY = Object.freeze({ minimumSimilarity: 0.95 });

export type SparcInstructionalNeed = {
  target: { texts: string[]; category?: SparcTargetCategory };
  assistance: number;
  evidence: Array<{ demonstrated?: string[]; incorrect?: string[]; unresolved?: string[] }>;
  currentValue?: number;
  case?: { explanation?: string; support?: string; figureDescription?: string };
  feedback?: { precedingQuestion: string; learnerResponse: string };
  illustrationBrief?: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid instructional need object');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 8000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid instructional need text');
  return value.trim();
}
function exactKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unexpected instructional need field');
}

/** One canonical serializer for every component. No IDs, generation policies, or nested JSON. */
export function sparcInstructionalNeedText(value: unknown): string {
  const data = record(value);
  exactKeys(data, ['target', 'assistance', 'evidence', 'currentValue', 'case', 'feedback', 'illustrationBrief']);
  const target = record(data.target);
  exactKeys(target, ['texts', 'category']);
  if (!Array.isArray(target.texts) || !target.texts.length || target.texts.length > 20) throw new Error('Instructional need requires target texts');
  if (target.category !== undefined && !(SPARC_TARGET_CATEGORIES as readonly unknown[]).includes(target.category)) throw new Error('Invalid instructional need category');
  if (typeof data.assistance !== 'number' || !Number.isFinite(data.assistance)) throw new Error('Invalid instructional need assistance');
  if (!Array.isArray(data.evidence) || data.evidence.length > 20) throw new Error('Invalid instructional need evidence');
  const need: SparcInstructionalNeed = {
    target: { texts: target.texts.map(t => text(t, 2048)), ...(target.category === undefined ? {} : { category: target.category as SparcTargetCategory }) },
    assistance: data.assistance,
    evidence: data.evidence.map(item => {
      const e = record(item); exactKeys(e, ['demonstrated', 'incorrect', 'unresolved']);
      const result: SparcInstructionalNeed['evidence'][number] = {};
      for (const key of ['demonstrated', 'incorrect', 'unresolved'] as const) {
        if (e[key] !== undefined) {
          if (!Array.isArray(e[key]) || e[key].length > 100) throw new Error('Invalid instructional need evidence claims');
          result[key] = (e[key] as unknown[]).map(t => text(t, 2048));
        }
      }
      return result;
    }),
  };
  if (data.currentValue !== undefined) {
    if (typeof data.currentValue !== 'number' || !Number.isFinite(data.currentValue)) throw new Error('Invalid instructional need coverage');
    need.currentValue = data.currentValue;
  }
  if (data.case !== undefined) {
    const context = record(data.case); exactKeys(context, ['explanation', 'support', 'figureDescription']);
    need.case = {};
    for (const key of ['explanation', 'support', 'figureDescription'] as const) if (context[key] !== undefined) need.case[key] = text(context[key]);
  }
  if (data.feedback !== undefined) {
    const feedback = record(data.feedback); exactKeys(feedback, ['precedingQuestion', 'learnerResponse']);
    need.feedback = { precedingQuestion: text(feedback.precedingQuestion), learnerResponse: text(feedback.learnerResponse) };
  }
  if (data.illustrationBrief !== undefined) need.illustrationBrief = text(data.illustrationBrief);
  const serialized = JSON.stringify(need);
  if (serialized.length > 30000) throw new Error('Instructional need exceeds its embedding input budget');
  return serialized;
}

/** Shared projection of the selected authored target and the actual realized case. */
export function buildSparcInstructionalNeed(params: {
  targetContent: unknown; targetTexts: readonly string[]; assistance: number; evidence: readonly unknown[];
  currentValue?: number; dependencies?: unknown; feedback?: SparcInstructionalNeed['feedback']; illustrationBrief?: string;
}): SparcInstructionalNeed {
  const authored = params.targetContent && typeof params.targetContent === 'object' && !Array.isArray(params.targetContent) ? record(params.targetContent) : {};
  const selected = authored.selectedMisconception ? record(authored.selectedMisconception) : authored;
  const dependencies = params.dependencies && typeof params.dependencies === 'object' ? record(params.dependencies) : {};
  const figure = dependencies.figure && typeof dependencies.figure === 'object' ? record(dependencies.figure) : {};
  const context = {
    ...(typeof dependencies.explanation === 'string' && dependencies.explanation.trim() ? { explanation: dependencies.explanation } : {}),
    ...(typeof dependencies.richContent === 'string' && dependencies.richContent.trim() ? { support: dependencies.richContent } : {}),
    ...(typeof figure.description === 'string' && figure.description.trim() ? { figureDescription: figure.description } : {}),
  };
  return JSON.parse(sparcInstructionalNeedText({
    target: { texts: typeof selected.text === 'string' && selected.text.trim() ? [selected.text]
      : Array.isArray(params.targetContent) ? params.targetContent : [...params.targetTexts],
      ...(selected.category === undefined ? {} : { category: selected.category }) },
    assistance: params.assistance,
    evidence: params.evidence.map(item => {
      const evidence = record(item);
      return Object.fromEntries(['demonstrated', 'incorrect', 'unresolved'].filter(key => evidence[key] !== undefined).map(key => [key, evidence[key]]));
    }),
    ...(params.currentValue === undefined ? {} : { currentValue: params.currentValue }),
    ...(Object.keys(context).length ? { case: context } : {}),
    ...(params.feedback ? { feedback: params.feedback } : {}),
    ...(params.illustrationBrief ? { illustrationBrief: params.illustrationBrief } : {}),
  })) as SparcInstructionalNeed;
}
