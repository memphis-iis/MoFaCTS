import { validateGeneratedPairResponse } from '../../common/aiContentContract';

export function copyablePromptLabPairs(result: unknown): string {
  const parsedContent = result && typeof result === 'object'
    ? (result as { parsedContent?: unknown }).parsedContent
    : undefined;
  return JSON.stringify(validateGeneratedPairResponse(parsedContent), null, 2);
}
