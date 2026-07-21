import {
  buildManualDraftLesson,
  createDefaultManualCreatorState,
  type ManualCreatorState,
  type StarterRow,
} from './manualDraftBuilder';
import type { ImportDraftLesson } from './normalizedImportTypes';
import type { PreparedAiImageAsset } from './aiContentImageAssets';
import type { AiContentSaveContract } from '../../common/aiContentContract';

export const AI_LEARNING_INSTRUCTIONS = 'Study each item, then type the correct answer.';
export const AI_TEST_INSTRUCTIONS = 'Type the correct answer for each item.';

function promptType(contract: AiContentSaveContract): ManualCreatorState['promptType'] {
  const kinds = new Set(contract.pairs.map((pair) => pair.kind));
  if (kinds.size > 1) return 'text-image';
  return kinds.has('image') ? 'image' : 'text';
}

function buildState(contract: AiContentSaveContract): ManualCreatorState {
  const state = createDefaultManualCreatorState();
  const rows: StarterRow[] = contract.pairs.map((pair) => ({
    id: pair.id,
    promptText: pair.kind === 'text' ? pair.stimulus : '',
    mediaRef: pair.kind === 'image' ? String(pair.image?.fileName || '').trim() : '',
    answer: pair.response.trim(),
    choice2: '',
    choice3: '',
    choice4: '',
    ...(pair.kind === 'image' && pair.image?.attribution
      ? { attribution: pair.image.attribution }
      : {}),
  }));
  return {
    ...state,
    lessonName: contract.title.trim(),
    structure: contract.mode === 'test' ? 'instructions-assessment' : 'instructions-learning',
    instructionText: contract.mode === 'test' ? AI_TEST_INSTRUCTIONS : AI_LEARNING_INSTRUCTIONS,
    promptType: promptType(contract),
    responseType: 'typed',
    cardCount: rows.length,
    rows,
  };
}

function attachMedia(
  draft: ImportDraftLesson,
  contract: AiContentSaveContract,
  assets: PreparedAiImageAsset[],
): ImportDraftLesson {
  const assetsByName = new Map(assets.map((asset) => [asset.packageFileName, asset]));
  const requiredNames = contract.pairs
    .filter((pair) => pair.kind === 'image')
    .map((pair) => String(pair.image?.fileName || '').trim());
  for (const name of requiredNames) {
    if (!assetsByName.has(name)) throw new Error(`The reviewed image asset "${name}" is unavailable.`);
  }
  draft.generatedBaseline.mediaFiles = Object.fromEntries(
    requiredNames.map((name) => [name, assetsByName.get(name)!.bytes]),
  );
  if (draft.stats) draft.stats.mediaCount = requiredNames.length;
  return draft;
}

export function buildAiContentDraft(
  contract: AiContentSaveContract,
  assets: PreparedAiImageAsset[] = [],
): ImportDraftLesson {
  const draft = attachMedia(buildManualDraftLesson(buildState(contract)), contract, assets);
  draft.sourceConfig = {
    ...(draft.sourceConfig || {}),
    moduleId: contract.mode === 'test' ? 'assessmentSession' : 'learningSession',
  } as ImportDraftLesson['sourceConfig'];
  return draft;
}
