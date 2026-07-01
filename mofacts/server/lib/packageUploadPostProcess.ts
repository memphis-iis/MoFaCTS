import type { UploadedPackageFile } from './packageParser';
import type { PackageUploadRuntimeState, ProcessPackageUploadDeps } from './packageUploadShared';
import { resolvePreferredApiKey } from './apiKeyResolution';
import { callOpenRouterEmbeddings } from '../../client/lib/openRouterClient';
import {
  AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL,
  AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL,
} from '../../client/lib/autoTutorRelationshipEngine';
import {
  computeClusterKcRelationshipsFromEmbeddings,
  createClusterKcGraphFacts,
  type ClusterKcRelationshipNode,
} from '../../../learning-components/runtime/clusterKcRelationshipEngine';
import {
  extractH5PContentReferences,
  getMissingH5PLibraryFolders,
  storeH5PLibrariesFromPackage,
  storeH5PPackageFile,
} from './h5pPackage';

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonBlankString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getWorkingMemoryFacts(display: unknown) {
  return isRecord(display) && Array.isArray(display.workingMemoryFacts)
    ? display.workingMemoryFacts
    : null;
}

function hasKcGraphRelationships(facts: readonly unknown[]) {
  return facts.some((fact) => isRecord(fact) && fact.factType === 'kcGraph.relationship');
}

function collectClusterKcRelationshipNodes(facts: readonly unknown[]): ClusterKcRelationshipNode[] {
  const nodes: ClusterKcRelationshipNode[] = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    if (!isRecord(fact) || fact.factType !== 'learningTarget.source' || !isRecord(fact.slots)) {
      continue;
    }
    const clusterKC = nonBlankString(fact.slots.clusterKC);
    if (!clusterKC || seen.has(clusterKC)) {
      continue;
    }
    const proposition = nonBlankString(fact.slots.proposition);
    const assertion = nonBlankString(fact.slots.assertion);
    const label = nonBlankString(fact.slots.label);
    const description = [
      label ? `Label: ${label}` : '',
      proposition ? `Proposition: ${proposition}` : '',
      assertion ? `Assertion: ${assertion}` : '',
    ].filter(Boolean).join('\n') || clusterKC;
    const node: ClusterKcRelationshipNode = {
      clusterKC,
      description,
    };
    const sourceId = nonBlankString(fact.slots.sourceId);
    if (sourceId) {
      nodes.push({ ...node, sourceId });
    } else {
      nodes.push(node);
    }
    seen.add(clusterKC);
  }
  return nodes;
}

async function ensureConvertedAutoTutorSparcGraph(args: {
  tdf: any;
  deps: ProcessPackageUploadDeps;
  state: PackageUploadRuntimeState;
}) {
  const { tdf, deps, state } = args;
  const stimuli = tdf?.rawStimuliFile;
  const setspec = isRecord(stimuli?.setspec) ? stimuli.setspec : null;
  const conversion = isRecord(setspec?.sourceAutoTutorConversion)
    ? setspec.sourceAutoTutorConversion
    : null;
  if (!conversion || !Array.isArray(setspec?.sparcPages)) {
    return;
  }

  let generatedPageCount = 0;
  for (const page of setspec.sparcPages) {
    const display = isRecord(page) ? page.display : null;
    const facts = getWorkingMemoryFacts(display);
    if (!facts || hasKcGraphRelationships(facts)) {
      continue;
    }
    const nodes = collectClusterKcRelationshipNodes(facts);
    if (nodes.length < 2) {
      continue;
    }

    const keyResolution = await resolvePreferredApiKey(deps.getApiKeyResolutionDeps(), {
      userId: state.uploadActorUserId,
      tdfId: tdf?._id,
      kind: 'openrouter',
    });
    if (!keyResolution.apiKey) {
      throw new Error('Converted AutoTutor SPARC upload requires an OpenRouter key alternative to generate the KC relationship graph.');
    }

    const attemptedModels: string[] = [];
    let embeddingResult: Awaited<ReturnType<typeof callOpenRouterEmbeddings>> | null = null;
    let model = '';
    let lastError: unknown;
    for (const candidateModel of [AUTO_TUTOR_PRIMARY_EMBEDDING_MODEL, AUTO_TUTOR_SECONDARY_EMBEDDING_MODEL]) {
      model = candidateModel;
      attemptedModels.push(candidateModel);
      try {
        embeddingResult = await callOpenRouterEmbeddings({
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
      throw new Error(`Converted AutoTutor SPARC graph generation failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
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
    conversion.relationshipValidation = {
      ...(isRecord(conversion.relationshipValidation) ? conversion.relationshipValidation : {}),
      valid: true,
      sourceShape: 'generated-at-upload',
      relationshipGenerationRequired: false,
      resolvedRelationshipCount: relationships.length,
      generatedClusterCount: nodes.length,
      generatedRelationships: true,
      relationshipProvenance: {
        graphVersion: 'sparc-kc-relationships-v1',
        generatedAt: new Date().toISOString(),
        model,
        attemptedModels,
        metric: 'cosine_similarity_normalized_vectors',
        scoreTransform: 'clamp_negative_to_zero',
        sourceKeyType: keyResolution.source,
      },
      ...(embeddingResult.costUsd !== undefined ? { generationResult: { model, attemptedModels, costUsd: embeddingResult.costUsd } } : { generationResult: { model, attemptedModels } }),
    };
  }

  if (generatedPageCount > 0) {
    deps.serverConsole('Generated SPARC KC relationship graph facts for converted AutoTutor package:', tdf.tdfFileName || tdf.fileName || tdf._id, 'pages=', generatedPageCount);
  }
}

async function upsertReferencedH5PContent(args: {
  tdf: any;
  h5pFilesByName: Map<string, UploadedPackageFile>;
  deps: ProcessPackageUploadDeps;
  scopedStimuliSetId: string | number | null | undefined;
}) {
  const { tdf, h5pFilesByName, deps, scopedStimuliSetId } = args;
  const h5pStore = deps.H5PContents;
  if (!h5pStore || !tdf?.rawStimuliFile) {
    return;
  }

  const references = extractH5PContentReferences(tdf.rawStimuliFile);
  for (const reference of references) {
    const file = h5pFilesByName.get(reference.packageAssetId.toLowerCase());
    if (!file) {
      throw new Error(`H5P package "${reference.packageAssetId}" referenced by "${reference.contentId}" was not found in the uploaded package.`);
    }
    const parsed = await storeH5PPackageFile(file, reference.contentId);
    if (parsed.library !== reference.library) {
      throw new Error(`H5P package "${reference.packageAssetId}" declares "${parsed.library}", but stimulus "${reference.contentId}" expects "${reference.library}".`);
    }
    const missingLibraryFolders = await getMissingH5PLibraryFolders(parsed.requiredLibraryFolders);
    if (missingLibraryFolders.length > 0) {
      throw new Error(
        `H5P package "${reference.packageAssetId}" requires H5P libraries that are not installed: ${missingLibraryFolders.join(', ')}. ` +
        'Upload a package that contains those library folders once, then upload this content package again.'
      );
    }

    const asset = typeof deps.DynamicAssets.findOneAsync === 'function'
      ? await deps.DynamicAssets.findOneAsync({
          name: reference.packageAssetId,
          'meta.stimuliSetId': scopedStimuliSetId
        }, { fields: { _id: 1, name: 1, fileName: 1, path: 1, meta: 1 } })
      : await deps.DynamicAssets.collection.findOneAsync({
          name: reference.packageAssetId,
          'meta.stimuliSetId': scopedStimuliSetId
        });
    if (!asset?._id) {
      throw new Error(`Uploaded H5P asset "${reference.packageAssetId}" was not saved for stimuli set ${scopedStimuliSetId}.`);
    }

    await h5pStore.upsertAsync(
      { contentId: reference.contentId },
      {
        $set: {
          contentId: reference.contentId,
          packageAssetId: reference.packageAssetId,
          assetId: asset._id,
          stimuliSetId: scopedStimuliSetId,
          tdfId: tdf._id,
          library: parsed.library,
          mainLibrary: parsed.mainLibrary,
          title: parsed.title,
          packageHash: parsed.hash,
          contentParams: parsed.contentParams,
          storagePath: parsed.storagePath,
          storageBackend: parsed.storageBackend,
          storageKey: parsed.storageKey,
          requiredLibraryFolders: parsed.requiredLibraryFolders,
          bundledLibraryFolders: parsed.bundledLibraryFolders,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      }
    );
  }
}

export async function postProcessUploadedTdfs(args: {
  unzippedFiles: UploadedPackageFile[];
  deps: ProcessPackageUploadDeps;
  state: PackageUploadRuntimeState;
}) {
  const { unzippedFiles, deps, state } = args;
  const h5pFilesByName = new Map(
    unzippedFiles
      .filter((file) => file.extension.toLowerCase() === 'h5p')
      .map((file) => [file.name.toLowerCase(), file])
  );
  for (const h5pFile of h5pFilesByName.values()) {
    await storeH5PLibrariesFromPackage(h5pFile);
  }

  for (const tdfFile of unzippedFiles.filter((file) => file.type === 'tdf')) {
    const tdf = await deps.Tdfs.findOneAsync({ tdfFileName: tdfFile.name });
    const setspec = tdf?.content?.tdfs?.tutor?.setspec;
    if (setspec && Array.isArray(setspec.condition) && setspec.condition.length > 0) {
      const conditionTdfIds = await deps.resolveConditionTdfIds(setspec);
      if (conditionTdfIds.some((id) => !id)) {
        throw new Error(`TDF "${tdfFile.name}" references condition TDFs that were not found after package upload.`);
      }
      setspec.conditionTdfIds = conditionTdfIds;
    }
    if (tdf && tdf.content && tdf.content.tdfs && tdf.content.tdfs.tutor && tdf.content.tdfs.tutor.unit) {
      const responseKCMap = tdf._id ? await deps.getResponseKCMapForTdf(tdf._id) : {};
      const scopedStimuliSetId = tdf.stimuliSetId ?? state.stimSetId;
      const uploadedMediaPathMap = state.uploadedMediaPathMapsByStimSetId.get(String(scopedStimuliSetId ?? '').trim());
      await upsertReferencedH5PContent({ tdf, h5pFilesByName, deps, scopedStimuliSetId });
      await ensureConvertedAutoTutorSparcGraph({ tdf, deps, state });
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
      await deps.Tdfs.upsertAsync({ _id: tdf._id }, tdf);
    }
  }
}
