import type { UploadedPackageFile } from './packageParser';
import type { PackageUploadRuntimeState, ProcessPackageUploadDeps } from './packageUploadShared';
import { resolvePreferredApiKey } from './apiKeyResolution';
import { callOpenRouterEmbeddings } from '../../common/lib/openRouterClient';
import {
  AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL,
  AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL,
} from '../../common/lib/autoTutorRelationshipConstants';
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

function collectGraphNodeClusterKcs(facts: readonly unknown[]): Set<string> {
  return new Set(facts.flatMap((fact) => (
    isRecord(fact)
      && fact.factType === 'kcGraph.node'
      && nonBlankString(fact.slots?.clusterKC)
      ? [nonBlankString(fact.slots.clusterKC)]
      : []
  )));
}

function relationshipKey(sourceClusterKC: string, targetClusterKC: string) {
  return `${sourceClusterKC}\u0000${targetClusterKC}`;
}

function collectGraphRelationshipKeys(facts: readonly unknown[]): Set<string> {
  return new Set(facts.flatMap((fact) => {
    if (!isRecord(fact) || fact.factType !== 'kcGraph.relationship') {
      return [];
    }
    const sourceClusterKC = nonBlankString(fact.slots?.sourceClusterKC);
    const targetClusterKC = nonBlankString(fact.slots?.targetClusterKC);
    return sourceClusterKC && targetClusterKC
      ? [relationshipKey(sourceClusterKC, targetClusterKC)]
      : [];
  }));
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function hasCompleteKcGraphFacts(params: {
  readonly facts: readonly unknown[];
  readonly nodes: readonly ClusterKcRelationshipNode[];
}) {
  const expectedNodeClusterKcs = new Set(params.nodes.map((node) => node.clusterKC));
  if (!sameSet(collectGraphNodeClusterKcs(params.facts), expectedNodeClusterKcs)) {
    return false;
  }
  const expectedRelationshipKeys = new Set<string>();
  for (const source of params.nodes) {
    for (const target of params.nodes) {
      if (source.clusterKC !== target.clusterKC) {
        expectedRelationshipKeys.add(relationshipKey(source.clusterKC, target.clusterKC));
      }
    }
  }
  return sameSet(collectGraphRelationshipKeys(params.facts), expectedRelationshipKeys);
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

  let generatedPageCount = 0;
  for (const page of setspec.sparcPages) {
    const display = isRecord(page) ? page.display : null;
    if (!isRecord(display) || display.unitType !== 'sparc-autotutor-dialogue') {
      continue;
    }
    const facts = getWorkingMemoryFacts(display);
    const nodes = collectClusterKcRelationshipNodesFromExpectations(display);
    if (nodes.length === 0 || hasCompleteKcGraphFacts({ facts, nodes })) {
      continue;
    }

    if (nodes.length === 1) {
      display.workingMemoryFacts = [
        ...facts.filter((fact) => !isRecord(fact) || (fact.factType !== 'kcGraph.node' && fact.factType !== 'kcGraph.relationship')),
        ...createClusterKcGraphFacts({ nodes, relationships: [] }),
      ];
      generatedPageCount += 1;
      continue;
    }

    const keyResolution = await resolvePreferredApiKey(deps.getApiKeyResolutionDeps(), {
      userId: state.uploadActorUserId,
      tdfId: tdf?._id,
      kind: 'openrouter',
    });
    if (!keyResolution.apiKey) {
      throw new Error('AutoTutor SPARC upload requires an OpenRouter key alternative to generate the KC relationship graph.');
    }

    const attemptedModels: string[] = [];
    let embeddingResult: Awaited<ReturnType<typeof callOpenRouterEmbeddings>> | null = null;
    let lastError: unknown;
    for (const candidateModel of [AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL, AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL]) {
      attemptedModels.push(candidateModel);
      try {
        embeddingResult = await (deps.callOpenRouterEmbeddings ?? callOpenRouterEmbeddings)({
          apiKey: keyResolution.apiKey,
          model: candidateModel,
          input: nodes.map((node) => node.description),
          telemetry: {
            surface: 'package-upload',
            operation: 'sparc-kc-relationship-embedding',
          },
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!embeddingResult) {
      throw new Error(`AutoTutor SPARC graph generation failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }

    const relationships = computeClusterKcRelationshipsFromEmbeddings({
      nodes,
      embeddings: embeddingResult.embeddings,
    });
    const graphFacts = createClusterKcGraphFacts({ nodes, relationships });
    display.workingMemoryFacts = [
      ...facts.filter((fact) => !isRecord(fact) || (fact.factType !== 'kcGraph.node' && fact.factType !== 'kcGraph.relationship')),
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
