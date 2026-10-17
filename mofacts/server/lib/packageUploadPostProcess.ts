import type { UploadedPackageFile } from './packageParser';
import type { PackageUploadRuntimeState, ProcessPackageUploadDeps } from './packageUploadShared';
import { resolvePreferredApiKey } from './apiKeyResolution';
import { callOpenRouterEmbeddings } from '../../common/lib/openRouterClient';
import { SPARC_EMBEDDING_MODEL } from '../../common/lib/sparcEmbeddingModel';
import { generateMaximumKcChain } from './clusterKcChainSolver';
import { resolveKcChainWorkerLoader } from './clusterKcChainWorkerRuntime';
import {
  computeClusterKcRelationshipsFromEmbeddings,
  createClusterKcGraphFacts,
  type ClusterKcRelationshipNode,
} from '../../../learning-components/runtime/clusterKcRelationshipEngine';

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getWorkingMemoryFacts(display: unknown) {
  return isRecord(display) && Array.isArray(display.workingMemoryFacts)
    ? display.workingMemoryFacts
    : [];
}

function collectClusterKcRelationshipNodesFromExpectations(display: unknown): ClusterKcRelationshipNode[] {
  const nodes: ClusterKcRelationshipNode[] = [];
  const seen = new Set<string>();
  const targets = isRecord(display) && isRecord(display.autoTutorTargets)
    ? display.autoTutorTargets
    : null;
  const expectations = Array.isArray(targets?.expectations)
    ? targets.expectations
    : [];
  for (const expectation of expectations) {
    if (!isRecord(expectation)) {
      continue;
    }
    const clusterKC = nonBlankString(expectation.clusterKC);
    if (!clusterKC || seen.has(clusterKC)) {
      continue;
    }
    const text = nonBlankString(expectation.text);
    if (!text) {
      continue;
    }
    nodes.push({
      clusterKC,
      description: text,
    });
    seen.add(clusterKC);
  }
  return nodes;
}

async function ensureAutoTutorSparcGraph(args: {
  tdf: any;
  deps: ProcessPackageUploadDeps;
  state: PackageUploadRuntimeState;
}) {
  const { tdf, deps, state } = args;
  const stimuli = tdf?.rawStimuliFile;
  const setspec = isRecord(stimuli?.setspec) ? stimuli.setspec : null;
  if (!Array.isArray(setspec?.sparcPages)) {
    return;
  }

  const startsByPage = new Map<string, Set<string>>();
  for (const unit of tdf.content?.tdfs?.tutor?.unit ?? []) {
    const config = unit?.sparcsession;
    if (config?.startingKC === undefined) continue;
    if (typeof config.startingKC !== 'string' || !config.startingKC.trim()) {
      throw new Error('sparcsession.startingKC must be a nonempty clusterKC identity');
    }
    const pages = config.pageId ? setspec.sparcPages.filter((p: any) => p.pageId === config.pageId) : setspec.sparcPages;
    if (pages.length !== 1 || pages[0]?.display?.unitType !== 'sparc-autotutor-dialogue') {
      throw new Error('sparcsession.startingKC requires one selected AutoTutor page');
    }
    const page = pages[0];
    const ids = collectClusterKcRelationshipNodesFromExpectations(page.display).map(n => n.clusterKC);
    if (!ids.includes(config.startingKC.trim())) throw new Error('sparcsession.startingKC is not an expectation on the selected page');
    const starts = startsByPage.get(page.pageId) ?? new Set<string>();
    starts.add(config.startingKC.trim());
    startsByPage.set(page.pageId, starts);
  }

  let generatedPageCount = 0;
  for (const page of setspec.sparcPages) {
    const display = isRecord(page) ? page.display : null;
    if (!isRecord(display) || display.unitType !== 'sparc-autotutor-dialogue') {
      continue;
    }
    const facts = getWorkingMemoryFacts(display);
    if (facts.some((fact: any) => fact?.factType === 'controller.targetSelectionPolicy' && fact.slots?.policy === 'kc-chain')
      && !startsByPage.get(page.pageId)?.size) {
      throw new Error('KC chain progression requires sparcsession.startingKC on the unit');
    }
    const nodes = collectClusterKcRelationshipNodesFromExpectations(display);
    if (nodes.length === 0) {
      continue;
    }

    let relationships: ReturnType<typeof computeClusterKcRelationshipsFromEmbeddings> = [];
    if (nodes.length > 1) {
      const keyResolution = await resolvePreferredApiKey(deps.getApiKeyResolutionDeps(), {
        userId: state.uploadActorUserId,
        tdfId: tdf?._id,
        kind: 'openrouter',
      });
      if (!keyResolution.apiKey) {
        throw new Error('AutoTutor SPARC upload requires an OpenRouter key alternative to generate the KC relationship graph.');
      }

      const embeddingResult = await (deps.callOpenRouterEmbeddings ?? callOpenRouterEmbeddings)({
        apiKey: keyResolution.apiKey,
        model: SPARC_EMBEDDING_MODEL,
        input: nodes.map((node) => node.description),
        telemetry: {
          surface: 'package-upload',
          operation: 'sparc-kc-relationship-embedding',
        },
      });

      relationships = computeClusterKcRelationshipsFromEmbeddings({
        nodes,
        embeddings: embeddingResult.embeddings,
      });
    }
    const graphFacts = createClusterKcGraphFacts({ nodes, relationships });
    for (const startingKC of startsByPage.get(page.pageId) ?? []) {
      const chain = await generateMaximumKcChain({ ids: nodes.map(n => n.clusterKC), startingKC, relationships }, resolveKcChainWorkerLoader());
      graphFacts.push({ factType: 'kcGraph.chain', slots: { startingKC, ...chain } });
    }
    display.workingMemoryFacts = [
      ...facts.filter((fact) => !isRecord(fact) || !String(fact.factType).startsWith('kcGraph.')),
      ...graphFacts,
    ];
    generatedPageCount += 1;
  }

  if (generatedPageCount > 0) {
    deps.serverConsole('Generated SPARC KC relationship graph facts for AutoTutor SPARC package:', tdf.tdfFileName || tdf.fileName || tdf._id, 'pages=', generatedPageCount);
  }
}

export async function postProcessUploadedTdfs(args: {
  unzippedFiles: UploadedPackageFile[];
  deps: ProcessPackageUploadDeps;
  state: PackageUploadRuntimeState;
}) {
  const { unzippedFiles, deps, state } = args;
  const identityByFileName = new Map(
    (state.identityPlan?.entries || []).map((entry) => [entry.fileName, entry])
  );
  for (const tdfFile of unzippedFiles.filter((file) => file.type === 'tdf')) {
    const identity = identityByFileName.get(tdfFile.name);
    if (!identity) {
      throw new Error(`Package identity preflight did not assign an id to TDF "${tdfFile.name}".`);
    }
    const tdf = await deps.Tdfs.findOneAsync({ _id: identity.tdfId });
    const setspec = tdf?.content?.tdfs?.tutor?.setspec;
    if (setspec && Array.isArray(setspec.condition) && setspec.condition.length > 0) {
      const conditionTdfIds = Array.isArray(setspec.conditionTdfIds) ? setspec.conditionTdfIds : [];
      if (conditionTdfIds.length !== setspec.condition.length || conditionTdfIds.some((id: unknown) => !id)) {
        throw new Error(`TDF "${tdfFile.name}" references condition TDFs that were not found after package upload.`);
      }
    }
    if (tdf && tdf.content && tdf.content.tdfs && tdf.content.tdfs.tutor && tdf.content.tdfs.tutor.unit) {
      const responseKCMap = tdf._id ? await deps.getResponseKCMapForTdf(tdf._id) : {};
      const scopedStimuliSetId = tdf.stimuliSetId ?? state.stimSetId;
      const uploadedMediaPathMap = state.uploadedMediaPathMapsByStimSetId.get(String(scopedStimuliSetId ?? '').trim());
      await ensureAutoTutorSparcGraph({ tdf, deps, state });
      const processedTdf = await deps.processAudioFilesForTDF(tdf.content.tdfs, scopedStimuliSetId, {
        rejectUnresolved: true,
        allowFilenameLookup: false,
        uploadedMediaPathMap,
        requireUploadedMediaMatch: true
      });
      tdf.content.tdfs.tutor.unit = processedTdf.tutor.unit;

      if (tdf.rawStimuliFile && scopedStimuliSetId !== undefined && scopedStimuliSetId !== null) {
        await deps.canonicalizeStimDisplayMediaRefs(tdf.rawStimuliFile, scopedStimuliSetId, {
          rejectUnresolved: true,
          allowFilenameLookup: false,
          uploadedMediaPathMap,
          requireUploadedMediaMatch: true
        });
        const oldStimFormat = {
          fileName: tdf.stimulusFileName || tdf.content?.tdfs?.tutor?.setspec?.stimulusfile || 'unknown',
          stimuli: tdf.rawStimuliFile,
          owner: tdf.ownerId,
          source: 'upload'
        };
        const canonicalStimuli = deps.getNewItemFormat(
          oldStimFormat,
          String(oldStimFormat.fileName),
          scopedStimuliSetId,
          responseKCMap
        );
        await deps.canonicalizeFlatStimuliMediaRefs(canonicalStimuli, scopedStimuliSetId, {
          rejectUnresolved: true,
          allowFilenameLookup: false,
          uploadedMediaPathMap,
          requireUploadedMediaMatch: true
        });
        tdf.stimuli = canonicalStimuli;
      }
    }
    if (tdf) {
      const updated = await deps.Tdfs.updateAsync(
        { _id: tdf._id, tdfRevision: identity.targetRevision + 1 },
        { $set: { content: tdf.content, rawStimuliFile: tdf.rawStimuliFile, stimuli: tdf.stimuli } },
      );
      if (updated !== 1) {
        throw new Error(`TDF "${tdfFile.name}" changed during package post-processing.`);
      }
    }
  }
}
