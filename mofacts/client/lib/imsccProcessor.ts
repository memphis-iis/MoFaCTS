/**
 * Client-side IMSCC processing
 * Analyzes and converts Canvas .imscc exports entirely in the browser.
 *
 * This module is intentionally isolated from APKG processing.
 */

import JSZip from 'jszip';
import { buildImportLessonDraft, sanitizeImportName } from './importCompositionBuilder';
import { buildImportPackageFromDraftLessons } from './importPackageBuilder';
import type { NormalizedImportItem } from './normalizedImportTypes';

const QTI_NS = 'http://www.imsglobal.org/xsd/ims_qtiasiv1p2';
const CANVAS_NS = 'http://canvas.instructure.com/xsd/cccv1p0';

const SUPPORTED_TYPES = new Set([
  'multiple_choice_question',
  'true_false_question',
  'multiple_answers_question',
  'short_answer_question'
]);

type ImportStimShape = {
  display?: {
    text?: string;
    imgSrc?: string;
  };
  response?: {
    correctResponse?: string;
    incorrectResponses?: string[];
  };
};

function createXmlDocument(xmlText: any, contextLabel = 'XML') {
  const tryParse = (text: any) => {
    const parser = new DOMParser();
    return parser.parseFromString(text, 'text/xml');
  };

  const extractParseError = (doc: any) => {
    const parserError = doc.querySelector('parsererror');
    return parserError ? (parserError.textContent || 'parse error') : null;
  };

  const repairKnownCanvasNamespaceIssue = (text: any) => {
    if (!text || typeof text !== 'string') {
      return text;
    }

    // Some Canvas exports incorrectly place schemaLocation content into xmlns:xsi.
    // Example bad value:
    // xmlns:xsi="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd"
    const malformedNsPattern = /xmlns:xsi=(["'])\s*http:\/\/canvas\.instructure\.com\/xsd\/cccv1p0\s+https:\/\/canvas\.instructure\.com\/xsd\/cccv1p0\.xsd\s*\1/i;
    if (!malformedNsPattern.test(text)) {
      return text;
    }

    let repaired = text.replace(
      malformedNsPattern,
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
    );

    // Insert xsi:schemaLocation only if missing after replacement.
    if (!/\bxsi:schemaLocation\s*=/.test(repaired)) {
      repaired = repaired.replace(
        /<quiz\b/i,
        '<quiz xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd"'
      );
    }

    return repaired;
  };

  const firstDoc = tryParse(xmlText);
  const firstError = extractParseError(firstDoc);
  if (!firstError) {
    return firstDoc;
  }

  const repairedText = repairKnownCanvasNamespaceIssue(xmlText);
  if (repairedText !== xmlText) {
    const secondDoc = tryParse(repairedText);
    const secondError = extractParseError(secondDoc);
    if (!secondError) {
      return secondDoc;
    }
    throw new Error(`Invalid ${contextLabel}: ${secondError}`);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`Invalid ${contextLabel}: ${parserError.textContent || 'parse error'}`);
  }
  return doc;
}

function xpathText(contextNode: any, xpath: any, nsResolver: any) {
  const doc = contextNode.nodeType === Node.DOCUMENT_NODE
    ? contextNode
    : contextNode.ownerDocument;
  const node = doc.evaluate(
    xpath,
    contextNode,
    nsResolver,
    XPathResult.STRING_TYPE,
    null
  );
  return (node.stringValue || '').trim();
}

function xpathNodes(contextNode: any, xpath: any, nsResolver: any) {
  const doc = contextNode.nodeType === Node.DOCUMENT_NODE
    ? contextNode
    : contextNode.ownerDocument;
  const result = doc.evaluate(
    xpath,
    contextNode,
    nsResolver,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  );
  const nodes: any[] = [];
  for (let i = 0; i < result.snapshotLength; i += 1) {
    nodes.push(result.snapshotItem(i));
  }
  return nodes;
}

function decodeHtmlToText(htmlString: any) {
  if (!htmlString || typeof htmlString !== 'string') {
    return '';
  }
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const text = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  return text;
}

function decodeAttributeValue(value: any) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return doc.documentElement?.textContent || '';
}

function normalizePath(path: any) {
  return decodeURIComponent(path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\?.*$/, '')
    .trim();
}

function resolveMediaPath(rawSrc: any, zipPathMap: any) {
  if (!rawSrc || typeof rawSrc !== 'string') {
    return null;
  }

  const decoded = decodeAttributeValue(rawSrc);
  const noPrefix = decoded.replace('$IMS-CC-FILEBASE$/', '').replace('$IMS_CC_FILEBASE$/', '');
  const cleaned = normalizePath(noPrefix);
  if (!cleaned) {
    return null;
  }

  const candidates = [
    cleaned,
    `web_resources/${cleaned}`,
    cleaned.replace(/\+/g, ' '),
    `web_resources/${cleaned.replace(/\+/g, ' ')}`,
    cleaned.replace(/^Uploaded Media/i, 'Uploaded Media'),
    `web_resources/${cleaned.replace(/^Uploaded Media/i, 'Uploaded Media')}`
  ];

  for (const candidate of candidates) {
    const key = normalizePath(candidate).toLowerCase();
    if (zipPathMap.has(key)) {
      return zipPathMap.get(key);
    }
  }

  return null;
}

function extractFirstImageRef(htmlString: any) {
  if (!htmlString || typeof htmlString !== 'string') {
    return null;
  }
  const imgMatch = htmlString.match(/<img[^>]+src\s*=\s*['"]([^'"]+)['"]/i);
  return imgMatch ? imgMatch[1] : null;
}

function parseAssessmentMeta(xmlText: any) {
  const doc = createXmlDocument(xmlText, 'assessment_meta.xml');
  const ns = (prefix: any) => (prefix === 'c' ? CANVAS_NS : null);

  const ident = xpathText(doc, 'string(/c:quiz/@identifier)', ns);
  const title = xpathText(doc, 'string(/c:quiz/c:title)', ns);
  const dueAt = xpathText(doc, 'string(/c:quiz/c:due_at)', ns);
  const assignmentTitle = xpathText(doc, 'string(/c:quiz/c:assignment/c:title)', ns);
  const pointsPossible = xpathText(doc, 'string(/c:quiz/c:points_possible)', ns);

  return {
    ident,
    title,
    dueAt,
    assignmentTitle,
    pointsPossible
  };
}

function parseQtiItems(xmlText: any) {
  const doc = createXmlDocument(xmlText, 'QTI assessment');
  const ns = (prefix: any) => (prefix === 'q' ? QTI_NS : null);

  const itemNodes = xpathNodes(doc, '//q:item', ns);
  const items = itemNodes.map((itemNode: any) => {
    const questionType = xpathText(
      itemNode,
      'string(.//q:itemmetadata/q:qtimetadata/q:qtimetadatafield[q:fieldlabel="question_type"]/q:fieldentry)',
      ns
    );
    const title = itemNode.getAttribute('title') || '';
    const itemIdent = itemNode.getAttribute('ident') || '';
    const promptHtml = xpathText(
      itemNode,
      'string(.//q:presentation/q:material/q:mattext)',
      ns
    );

    const choiceNodes = xpathNodes(
      itemNode,
      './/q:response_label',
      ns
    );
    const choices = choiceNodes.map((choiceNode: any) => {
      const choiceIdent = choiceNode.getAttribute('ident') || '';
      const choiceHtml = xpathText(choiceNode, 'string(.//q:mattext)', ns);
      return {
        id: choiceIdent,
        text: decodeHtmlToText(choiceHtml),
        html: choiceHtml
      };
    });

    const correctIdNodes = xpathNodes(
      itemNode,
      './/q:resprocessing/q:respcondition/q:conditionvar/q:varequal',
      ns
    );
    const correctIds = correctIdNodes
      .map((node: any) => (node.textContent || '').trim())
      .filter(Boolean);

    const firstImageRef = extractFirstImageRef(promptHtml);

    return {
      ident: itemIdent,
      title,
      questionType,
      promptHtml,
      promptText: decodeHtmlToText(promptHtml),
      choices,
      correctIds,
      firstImageRef
    };
  });

  return items;
}

function buildStimFromItem(item: any, zipPathMap: any, mediaAliasMap: any, usedMediaNames: any, mediaFileSet: any, unsupportedReasons: any) {
  const type = (item.questionType || '').trim();
  if (!SUPPORTED_TYPES.has(type)) {
    unsupportedReasons.push(`Unsupported question_type "${type || 'unknown'}"`);
    return null;
  }

  const display: any = {};
  if (item.promptText) {
    display.text = item.promptText;
  }

  if (item.firstImageRef) {
    const mediaPath = resolveMediaPath(item.firstImageRef, zipPathMap);
    if (mediaPath) {
      if (!mediaAliasMap.has(mediaPath)) {
        const baseName = mediaPath.split('/').pop() || 'image.png';
        let candidate = baseName;
        let suffix = 1;
        while (usedMediaNames.has(candidate)) {
          const dot = baseName.lastIndexOf('.');
          const namePart = dot >= 0 ? baseName.slice(0, dot) : baseName;
          const extPart = dot >= 0 ? baseName.slice(dot) : '';
          candidate = `${namePart}_${suffix}${extPart}`;
          suffix += 1;
        }
        mediaAliasMap.set(mediaPath, candidate);
        usedMediaNames.add(candidate);
      }
      const alias = mediaAliasMap.get(mediaPath);
      display.imgSrc = alias;
      mediaFileSet.add(mediaPath);
    } else {
      unsupportedReasons.push(`Missing media reference "${item.firstImageRef}"`);
      return null;
    }
  }

  const response: any = {};

  if (type === 'multiple_choice_question' || type === 'true_false_question' || type === 'multiple_answers_question') {
    if (!item.choices.length) {
      unsupportedReasons.push('No choices found');
      return null;
    }
    if (!item.correctIds.length) {
      unsupportedReasons.push('No correct choice id found');
      return null;
    }

    const correctChoices = item.choices.filter((choice: any) => item.correctIds.includes(choice.id));
    if (!correctChoices.length) {
      unsupportedReasons.push('Correct choice ids did not match available choices');
      return null;
    }

    const correctTexts = correctChoices.map((choice: any) => choice.text).filter(Boolean);
    if (!correctTexts.length) {
      unsupportedReasons.push('Correct choices have empty text');
      return null;
    }

    response.correctResponse = correctTexts.join(';');
    response.incorrectResponses = item.choices
      .filter((choice: any) => !item.correctIds.includes(choice.id))
      .map((choice: any) => choice.text)
      .filter(Boolean);
  } else if (type === 'short_answer_question') {
    if (!item.correctIds.length) {
      unsupportedReasons.push('No accepted answer found');
      return null;
    }
    response.correctResponse = item.correctIds.join(';');
  } else {
    unsupportedReasons.push(`Unsupported question_type "${type}"`);
    return null;
  }

  if (!response.correctResponse) {
    unsupportedReasons.push('Missing correctResponse after mapping');
    return null;
  }

  return {
    stims: [
      {
        display,
        response
      }
    ]
  };
}

export async function analyzeImscc(file: any, onProgress: any = () => {}) {
  onProgress(5);
  const buffer = await file.arrayBuffer();
  onProgress(15);
  const zip = await JSZip.loadAsync(buffer);
  onProgress(30);

  const entries = Object.keys(zip.files);
  const zipPathMap = new Map();
  entries.forEach((entryName) => {
    zipPathMap.set(normalizePath(entryName).toLowerCase(), entryName);
  });

  const metaPaths = entries.filter((name) => /^g[^/]+\/assessment_meta\.xml$/i.test(name));
  const qtiPaths = entries.filter((name) => /^non_cc_assessments\/.+\.xml\.qti$/i.test(name));

  if (!metaPaths.length || !qtiPaths.length) {
    throw new Error('IMSCC package does not contain expected Canvas quiz assessment files.');
  }

  const qtiByIdent: Record<string, any> = {};
  for (const qtiPath of qtiPaths) {
    const match = qtiPath.match(/^non_cc_assessments\/(.+)\.xml\.qti$/i);
    if (match && match[1]) {
      qtiByIdent[match[1]] = qtiPath;
    }
  }

  const quizzes: any[] = [];
  let processedMetaCount = 0;
  for (const metaPath of metaPaths) {
    const metaFile = zip.file(metaPath);
    if (!metaFile) continue;
    const xml = await metaFile.async('string');
    const meta = parseAssessmentMeta(xml);
    const qtiPath = qtiByIdent[meta.ident];
    if (!qtiPath) {
      continue;
    }
    const qtiFile = zip.file(qtiPath);
    if (!qtiFile) continue;
    const qtiXml = await qtiFile.async('string');
    const items = parseQtiItems(qtiXml);
    const supportedCount = items.filter((item) => SUPPORTED_TYPES.has((item.questionType || '').trim())).length;
    const unsupportedTypes = [...new Set(
      items
        .map((item) => (item.questionType || '').trim())
        .filter((type) => type && !SUPPORTED_TYPES.has(type))
    )];

    quizzes.push({
      ident: meta.ident,
      title: meta.title || meta.assignmentTitle || meta.ident,
      dueAt: meta.dueAt,
      pointsPossible: meta.pointsPossible,
      questionCount: items.length,
      supportedCount,
      unsupportedCount: items.length - supportedCount,
      unsupportedTypes,
      qtiPath
    });

    processedMetaCount += 1;
    const progress = 30 + Math.round((processedMetaCount / metaPaths.length) * 65);
    onProgress(Math.min(progress, 95));
  }

  quizzes.sort((a: any, b: any) => a.title.localeCompare(b.title));
  onProgress(100);

  return {
    fileName: file.name,
    quizCount: quizzes.length,
    quizzes,
    _zip: zip,
    _zipPathMap: zipPathMap
  };
}

export async function generateTdfsFromImscc(metadata: any, configs: any, onProgress: any = () => {}) {
  const lessons = await buildDraftLessonsFromImscc(metadata, configs, onProgress);
  return buildImportPackageFromDraftLessons(lessons);
}

export async function buildDraftLessonsFromImscc(metadata: any, configs: any, onProgress: any = () => {}) {
  if (!metadata?._zip || !metadata?._zipPathMap) {
    throw new Error('IMSCC metadata is missing zip data. Run analyzeImscc first.');
  }
  if (!Array.isArray(configs) || !configs.length) {
    throw new Error('At least one quiz configuration is required.');
  }

  const zip = metadata._zip;
  const zipPathMap = metadata._zipPathMap;

  const mediaAliasMap = new Map();
  const usedMediaNames = new Set();
  const lessons = [];

  for (let i = 0; i < configs.length; i += 1) {
    const config = configs[i];
    if (!config?.ident || !config?.name) {
      throw new Error(`Invalid config at index ${i}.`);
    }

    const qtiPath = config.qtiPath || (metadata.quizzes || []).find((q: any) => q.ident === config.ident)?.qtiPath;
    if (!qtiPath) {
      throw new Error(`Could not find QTI payload for quiz "${config.ident}".`);
    }

    const qtiFile = zip.file(qtiPath);
    if (!qtiFile) {
      throw new Error(`Could not load QTI payload for quiz "${config.ident}".`);
    }
    const qtiXml = await qtiFile.async('string');
    const items = parseQtiItems(qtiXml);

    const mediaFileSet = new Set();
    const clusters: any[] = [];
    const skipped: any[] = [];

    items.forEach((item: any, itemIndex: any) => {
      const unsupportedReasons: any[] = [];
      const cluster = buildStimFromItem(
        item,
        zipPathMap,
        mediaAliasMap,
        usedMediaNames,
        mediaFileSet,
        unsupportedReasons
      );
      if (cluster) {
        clusters.push(cluster);
      } else {
        skipped.push({
          itemIdent: item.ident || `item_${itemIndex}`,
          itemTitle: item.title || '',
          questionType: item.questionType || '',
          reasons: unsupportedReasons
        });
      }
    });

    if (!clusters.length) {
      throw new Error(`Quiz "${config.name}" has no supported questions after mapping.`);
    }

    const instructionsText = config.instructions || '<p>This lesson was imported from a Canvas IMSCC package.</p>';
    const safeName = sanitizeImportName(config.name, 'Canvas_Quiz');

    const mediaFiles: Record<string, Uint8Array> = {};
    for (const originalPath of mediaFileSet) {
      const alias = mediaAliasMap.get(originalPath);
      if (!alias) {
        continue;
      }
      const fileEntry = zip.file(originalPath);
      if (!fileEntry) {
        continue;
      }
      mediaFiles[alias] = await fileEntry.async('uint8array');
    }

    lessons.push(buildImportLessonDraft({
      id: config.ident,
      sourceKind: 'imscc',
      lessonName: safeName,
      instructions: instructionsText,
      items: clusters.map((cluster: any) => {
        const stim = cluster.stims?.[0] || {};
        return {
          prompt: {
            ...(stim.display?.text ? { text: stim.display.text } : {}),
            ...(stim.display?.imgSrc ? { imgSrc: stim.display.imgSrc } : {})
          },
          response: {
            correctResponse: stim.response?.correctResponse,
            ...(Array.isArray(stim.response?.incorrectResponses) && stim.response.incorrectResponses.length > 0
              ? { incorrectResponses: stim.response.incorrectResponses }
              : {})
          },
          sourceType: Array.isArray(stim.response?.incorrectResponses) && stim.response.incorrectResponses.length > 0
            ? 'choice'
            : 'freeResponse'
        };
      }),
      mediaFiles,
      sourceConfig: {
        ident: config.ident,
        qtiPath,
        title: config.title
      },
      skippedItems: skipped.length,
      manifestMeta: {
        ident: config.ident,
        quizTitle: config.title,
        skipped
      }
    }));

    const progress = 5 + Math.round(((i + 1) / configs.length) * 90);
    onProgress(Math.min(progress, 95));
  }

  onProgress(100);
  return lessons;
}

export async function generateJoinedTdfFromImscc(metadata: any, configs: any, joinedConfig: any, onProgress: any = () => {}) {
  const lessons = await buildJoinedDraftLessonFromImscc(metadata, configs, joinedConfig, onProgress);
  return buildImportPackageFromDraftLessons(lessons);
}

export async function buildJoinedDraftLessonFromImscc(metadata: any, configs: any, joinedConfig: any, onProgress: any = () => {}) {
  if (!metadata?._zip || !metadata?._zipPathMap) {
    throw new Error('IMSCC metadata is missing zip data. Run analyzeImscc first.');
  }
  if (!Array.isArray(configs) || !configs.length) {
    throw new Error('At least one quiz configuration is required.');
  }
  if (!joinedConfig?.name?.trim()) {
    throw new Error('Joined TDF name is required.');
  }

  const zip = metadata._zip;
  const zipPathMap = metadata._zipPathMap;

  const mediaAliasMap = new Map();
  const usedMediaNames = new Set();
  const allItems: NormalizedImportItem[] = [];
  const allSkipped: any[] = [];
  const allMediaFiles = new Set<string>();

  for (let i = 0; i < configs.length; i += 1) {
    const config = configs[i];
    if (!config?.ident) {
      throw new Error(`Invalid config at index ${i}.`);
    }

    const qtiPath = config.qtiPath || (metadata.quizzes || []).find((q: any) => q.ident === config.ident)?.qtiPath;
    if (!qtiPath) {
      throw new Error(`Could not find QTI payload for quiz "${config.ident}".`);
    }

    const qtiFile = zip.file(qtiPath);
    if (!qtiFile) {
      throw new Error(`Could not load QTI payload for quiz "${config.ident}".`);
    }
    const qtiXml = await qtiFile.async('string');
    const items = parseQtiItems(qtiXml);

    const mediaFileSet = new Set<string>();
    items.forEach((item: any, itemIndex: any) => {
      const unsupportedReasons: any[] = [];
      const cluster = buildStimFromItem(item, zipPathMap, mediaAliasMap, usedMediaNames, mediaFileSet as any, unsupportedReasons);
      if (cluster) {
        const stim: ImportStimShape | undefined = cluster.stims?.[0];
        const correctResponse = stim?.response?.correctResponse;
        if (!correctResponse) {
          allSkipped.push({
            itemIdent: item.ident || `item_${itemIndex}`,
            itemTitle: item.title || '',
            questionType: item.questionType || '',
            quizIdent: config.ident,
            reasons: [...unsupportedReasons, 'Missing correctResponse after mapping']
          });
          return;
        }

        const incorrectResponses = Array.isArray(stim.response?.incorrectResponses)
          ? stim.response.incorrectResponses
          : undefined;
        allItems.push({
          prompt: {
            ...(stim.display?.text ? { text: stim.display.text } : {}),
            ...(stim.display?.imgSrc ? { imgSrc: stim.display.imgSrc } : {})
          },
          response: {
            correctResponse,
            ...(incorrectResponses && incorrectResponses.length > 0
              ? { incorrectResponses }
              : {})
          },
          sourceType: incorrectResponses && incorrectResponses.length > 0
            ? 'choice'
            : 'freeResponse'
        });
      } else {
        allSkipped.push({
          itemIdent: item.ident || `item_${itemIndex}`,
          itemTitle: item.title || '',
          questionType: item.questionType || '',
          quizIdent: config.ident,
          reasons: unsupportedReasons
        });
      }
    });

    for (const p of mediaFileSet) {
      allMediaFiles.add(p);
    }

    const progress = 5 + Math.round(((i + 1) / configs.length) * 70);
    onProgress(Math.min(progress, 75));
  }

  if (!allItems.length) {
    throw new Error('No supported questions found across all selected quizzes.');
  }

  const instructionsText = joinedConfig.instructions || '<p>This lesson was imported from a Canvas IMSCC package.</p>';
  const safeName = sanitizeImportName(joinedConfig.name, 'Canvas_Quiz');

  onProgress(80);

  const mediaFiles: Record<string, Uint8Array> = {};
  for (const originalPath of allMediaFiles) {
    const alias = mediaAliasMap.get(originalPath);
    if (!alias) {
      continue;
    }
    const fileEntry = zip.file(originalPath);
    if (!fileEntry) {
      continue;
    }
    mediaFiles[alias] = await fileEntry.async('uint8array');
  }

  onProgress(90);
  onProgress(100);
  return [
    buildImportLessonDraft({
      id: safeName,
      sourceKind: 'imscc',
      lessonName: safeName,
      instructions: instructionsText,
      items: allItems,
      mediaFiles,
      sourceConfig: {
        joinedQuizIdents: configs.map((config: any) => config.ident)
      },
      skippedItems: allSkipped.length,
      manifestMeta: {
        quizCount: configs.length,
        skipped: allSkipped
      }
    })
  ];
}

export function buildInitialImsccConfigs(metadata: any) {
  if (!metadata?.quizzes) {
    return [];
  }
  return metadata.quizzes.map((quiz: any) => ({
    ident: quiz.ident,
    qtiPath: quiz.qtiPath,
    title: quiz.title,
    selected: quiz.supportedCount > 0,
    name: sanitizeImportName(quiz.title, 'Canvas_Quiz'),
    instructions: '<p>This lesson was imported from a Canvas IMSCC package.</p>',
    isValid: quiz.supportedCount > 0,
    validationError: quiz.supportedCount > 0
      ? null
      : 'Quiz has no v1-supported question types.'
  }));
}



