import type { SparcSupportedPrompt } from '../../../../../../learning-components/units/sparcsession/sparcSupportedPrompt';
import { SPARC_PROMPT_IMAGE_SETTINGS } from '../../../../../common/lib/sparcPromptImage';
import type { OpenRouterUsageSummary } from '../../../../lib/openRouterClient';
import type { SparcInstructionalNeed } from '../../../../../../learning-components/runtime/sparcInstructionalNeed';
import type { SparcSavedImage } from '../../../../../../learning-components/runtime/sparcAdministrativeRemoval';
import type { SparcVideoSegment } from '../../../../../../learning-components/runtime/sparcVideo';

export type CallSparcPromptImage = (params: {
  tdfId: string; sessionId: string; generationId: string;
  tutorMessage: string; imagePrompt: string; figureDescription: string; displayWidth: number;
}) => Promise<SparcSupportedPrompt & { usage?: OpenRouterUsageSummary; embeddingUsage?: OpenRouterUsageSummary;
  libraryMatch?: { source: 'generated' | 'semantic' | 'resume'; similarity: number | null } }>;
export type ReadSparcPromptImage = (assetId: string) => Promise<SparcSavedImage>;
export type CallSparcVisualSupport = (params: Parameters<CallSparcPromptImage>[0] & { situation: SparcInstructionalNeed }) => Promise<
  ({ figure: SparcSupportedPrompt['figure']; video?: never } | { video: SparcVideoSegment; figure?: never }) & {
    usage?: OpenRouterUsageSummary; embeddingUsage?: OpenRouterUsageSummary;
    libraryMatch?: { source: 'generated' | 'semantic' | 'resume'; similarity: number | null };
  }>;

function call(name: string, value: unknown): Promise<unknown> {
  const meteor = (globalThis as typeof globalThis & { Meteor?: { callAsync?: (name: string, ...args: unknown[]) => Promise<unknown> } }).Meteor;
  if (typeof meteor?.callAsync !== 'function') throw new Error('SPARC image access requires Meteor.callAsync');
  return meteor.callAsync(name, value);
}
export const callSparcPromptImage: CallSparcPromptImage = params => call('generateSparcPromptImage', params) as ReturnType<CallSparcPromptImage>;
export const callSparcVisualSupport: CallSparcVisualSupport = params => call('resolveSparcVisualSupport', params) as ReturnType<CallSparcVisualSupport>;
export const readSparcPromptImage: ReadSparcPromptImage = async assetId => {
  const result = await call('getSparcPromptImage', assetId) as { dataUrl?: unknown; administrativeRemoval?: unknown };
  if (result?.administrativeRemoval === true && result.dataUrl === undefined) return { administrativeRemoval: true };
  if (typeof result?.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(result.dataUrl)
    || result.dataUrl.length > Math.ceil(SPARC_PROMPT_IMAGE_SETTINGS.maxBytes / 3) * 4 + 40) {
    throw new Error('Invalid saved SPARC image response');
  }
  return { dataUrl: result.dataUrl };
};
