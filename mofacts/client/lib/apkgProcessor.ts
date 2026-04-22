/**
 * Client-side APKG processing
 * Analyzes and converts Anki .apkg files entirely in the browser
 * Uses JSZip and sql.js (WebAssembly SQLite)
 */

import JSZip from 'jszip';
import { clientConsole } from './clientLogger';
import { buildImportLessonDraft } from './importCompositionBuilder';
import { parseImportIndexSpec } from './importRangeUtils';
import { buildImportPackageFromDraftLessons } from './importPackageBuilder';
import type { ImportDraftLesson } from './normalizedImportTypes';
const initSqlJs: any = require('sql.js');

const US = '\x1f'; // Anki field separator

// sql.js needs to load the WASM file
let SQL: any = null;

/**
 * Initialize sql.js (loads WASM)
 */
async function initSQL(): Promise<any> {
  if (!SQL) {
    SQL = await initSqlJs({
      // Load sql.js WASM from CDN
      locateFile: (file: any) => `https://sql.js.org/dist/${file}`
    });
  }
  return SQL;
}

/**
 * Query all rows from SQLite database
 */
function queryAll(db: any, sql: any) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Split Anki note fields (US-separated)
 */
function splitFields(fldsRaw: any) {
  return (fldsRaw || '').split(US);
}

/**
 * Strip HTML tags from text
 */
function stripHtml(s: any) {
  return (s || '').replace(/<[^>]+>/g, '').trim();
}

/**
 * Detect if a field value contains images
 */
function hasImages(value: any) {
  return /<img[^>]+src=/i.test(value);
}

/**
 * Detect if a field value contains audio
 */
function hasAudio(value: any) {
  return /\[sound:[^\]]+\]/i.test(value);
}

/**
 * Extract first image reference from HTML
 */
function extractFirstImageRef(html: any) {
  if (!html) return null;
  const imgRegex = /<img[^>]+src=['"]([^'"]+)['"]/i;
  const match = html.match(imgRegex);
  return match ? match[1] : null;
}

/**
 * Extract media references from HTML
 */
function extractMediaRefs(html: any) {
  const refs = new Set();
  if (!html) return [];

  // Image tags: <img src="filename">
  const imgRegex = /<img[^>]+src=['"]([^'"]+)['"]/g;
  for (const match of html.matchAll(imgRegex)) {
    refs.add(match[1]);
  }

  // Sound tags: [sound:filename]
  const soundRegex = /\[sound:([^\]]+)\]/g;
  for (const match of html.matchAll(soundRegex)) {
    refs.add(match[1]);
  }

  return [...refs];
}

function isExternalMediaRef(ref: any) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref);
}

function resolveMediaRef(ref: any, mediaIndex: any, mediaIndexByName: any, zip: any) {
  if (!ref || typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  if (!trimmed || isExternalMediaRef(trimmed)) return null;

  if (Object.prototype.hasOwnProperty.call(mediaIndex, trimmed)) {
    if (zip.file(trimmed)) {
      return { filename: mediaIndex[trimmed] || trimmed, zipKey: trimmed };
    }
    return null;
  }

  const numericKey = mediaIndexByName[trimmed];
  if (numericKey && zip.file(numericKey)) {
    return { filename: trimmed, zipKey: numericKey };
  }

  if (zip.file(trimmed)) {
    return { filename: trimmed, zipKey: trimmed };
  }

  return null;
}

function buildFieldContent(fieldValue: any, fieldType: any, mediaIndex: any, mediaIndexByName: any, zip: any) {
  const refs = extractMediaRefs(fieldValue);
  const resolvedRefs: any[] = [];
  const missingRefs: any[] = [];

  refs.forEach(ref => {
    const resolved = resolveMediaRef(ref, mediaIndex, mediaIndexByName, zip);
    if (resolved) {
      resolvedRefs.push(resolved);
    } else {
      missingRefs.push(ref);
    }
  });

  const stripped = stripHtml(fieldValue);
  let text = '';
  let image = null;

  if (resolvedRefs.length > 0) {
    image = resolvedRefs[0].filename;
    if ((fieldType === 'mixed' || fieldType === 'both') && stripped) {
      text = stripped;
    } else if (fieldType !== 'image' && fieldType !== 'audio' && stripped) {
      text = stripped;
    }
  } else {
    text = stripped;
  }

  return { text, image, resolvedRefs, missingRefs };
}

function isFieldComplete(fieldContent: any, fieldType: any) {
  const hasText = !!(fieldContent.text && fieldContent.text.trim());
  const hasImage = !!fieldContent.image;

  if (fieldType === 'text') return hasText;
  if (fieldType === 'image' || fieldType === 'audio') return hasImage;
  return hasText || hasImage;
}

function getImportableNoteCount(metadata: any) {
  return Number(metadata?._primaryModelNoteCount || metadata?.importableNoteCount || metadata?.noteCount || 0);
}

/**
 * Analyze .apkg file and return metadata
 * @param {File} file - The .apkg file
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Object} Deck metadata
 */
export async function analyzeApkg(file: any, onProgress: any = () => {}) {
  onProgress(5);

  // 1. Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();
  onProgress(10);

  // 2. Unzip .apkg
  const zip = await JSZip.loadAsync(buffer);
  onProgress(20);

  // 3. Find and load SQLite database
  let sqliteBytes;
  const c21 = zip.file('collection.anki21');
  const c2 = zip.file('collection.anki2');

  if (c21) {
    sqliteBytes = await c21.async('uint8array');
  } else if (c2) {
    sqliteBytes = await c2.async('uint8array');
  } else {
    throw new Error('No collection database found in .apkg file');
  }
  onProgress(30);

  // 4. Open SQLite database
  await initSQL();
  const db = new SQL.Database(new Uint8Array(sqliteBytes));
  onProgress(40);

  // 5. Extract models and decks
  const colRows = queryAll(db, 'SELECT models, decks FROM col');
  if (colRows.length === 0) {
    db.close();
    throw new Error('Invalid collection: no metadata found');
  }

  const models = JSON.parse(colRows[0].models || '{}');
  const decks = JSON.parse(colRows[0].decks || '{}');

  // 6. Get primary deck name (skip "Default" if there's another)
  const deckValues = Object.values(decks) as any[];
  const primaryDeck: any = deckValues.find((d: any) => d.name !== 'Default') || deckValues[0];
  const deckName = primaryDeck ? primaryDeck.name : 'Unknown Deck';

  // 7. Count notes and cards
  const noteCount = queryAll(db, 'SELECT COUNT(*) as count FROM notes')[0].count;
  const cardCount = queryAll(db, 'SELECT COUNT(*) as count FROM cards')[0].count;
  onProgress(50);

  // 8. Get the model (note type) that has the most notes
  const modelValues = Object.values(models) as any[];
  if (modelValues.length === 0) {
    db.close();
    throw new Error('No note types found in deck');
  }

  // Count notes per model
  const modelUsage: Record<string, any> = {};
  for (const [modelId] of Object.entries(models)) {
    const count = queryAll(db, `SELECT COUNT(*) as count FROM notes WHERE mid = ${modelId}`)[0].count;
    modelUsage[modelId] = count;
  }

  // Find the most-used model
  const primaryModelId = Object.keys(modelUsage).reduce((a, b) =>
    modelUsage[a] > modelUsage[b] ? a : b
  );
  const primaryModel: any = (models as any)[primaryModelId];
  const modelName = primaryModel.name || 'Unknown Model';
  const isClozeModel = (primaryModel.type === 1) ||
                       (modelName.toLowerCase().includes('cloze'));
  onProgress(60);

  // 9. Load media index (needed for image previews)
  let mediaIndex: Record<string, any> = {};
  let mediaCount = 0;
  const mediaJson = zip.file('media');
  if (mediaJson) {
    const txt = await mediaJson.async('string');
    mediaIndex = JSON.parse(txt || '{}');
    mediaCount = Object.keys(mediaIndex).length;
  }

  // 10. Build field list with metadata
  const fields = primaryModel.flds.map((fld: any, index: any) => {
    return {
      index: index,
      name: fld.name,
      type: 'unknown',
      samples: [],
      hasImages: false,
      hasAudio: false,
      sampleImage: null
    };
  });

  // 11. Get sample notes to determine field types
  const SAMPLE_SIZE = 5;
  const sampleNotes = queryAll(db, `SELECT flds FROM notes WHERE mid = ${primaryModelId} LIMIT ${SAMPLE_SIZE}`);
  onProgress(70);

  // Analyze each field across samples
  for (const field of fields) {
    let textCount = 0;
    let imageCount = 0;
    let audioCount = 0;
    const samples: any[] = [];
    let firstImageRef: any = null;

    sampleNotes.forEach(note => {
      const fieldValues = splitFields(note.flds);
      const value = fieldValues[field.index] || '';

      if (value.trim()) {
        samples.push(value);

        if (hasImages(value)) {
          imageCount++;
          if (!firstImageRef) {
            firstImageRef = extractFirstImageRef(value);
          }
        }
        if (hasAudio(value)) {
          audioCount++;
        }
        if (value.replace(/<[^>]+>/g, '').trim()) {
          textCount++;
        }
      }
    });

    // Determine field type
    if (imageCount > 0 && textCount === 0) {
      field.type = 'image';
    } else if (imageCount > 0 && textCount > 0) {
      field.type = 'mixed';
    } else if (audioCount > 0) {
      field.type = 'audio';
    } else {
      field.type = 'text';
    }

    field.samples = samples.slice(0, 3);
    field.hasImages = imageCount > 0;
    field.hasAudio = audioCount > 0;

    // Extract sample image preview
    if (firstImageRef && (field.type === 'image' || field.type === 'mixed')) {
      const filename = mediaIndex[firstImageRef] || firstImageRef;

      // Find numeric key for this filename
      let numericKey = null;
      for (const [key, value] of Object.entries(mediaIndex)) {
        if (value === filename) {
          numericKey = key;
          break;
        }
      }

      const zipKey = numericKey || firstImageRef;
      const zipFile = zip.file(zipKey);
      if (zipFile) {
        try {
          const data = await zipFile.async('base64');
          const ext = (filename.split('.').pop() || '').toLowerCase();
          const mimeTypes: Record<string, string> = {
            'svg': 'image/svg+xml',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp'
          };
          const mimeType = mimeTypes[ext] || 'image/png';
          field.sampleImage = `data:${mimeType};base64,${data}`;
        } catch (e) {
          // Sample image extraction is optional for this field type.
        }
      }
    }
  }
  onProgress(80);

  // 12. Extract card templates
  const templates = primaryModel.tmpls.map((tmpl: any, index: number) => {
    return {
      index: index,
      name: tmpl.name,
      qfmt: tmpl.qfmt,
      afmt: tmpl.afmt
    };
  });

  // 13. Close database
  db.close();
  onProgress(100);

  // 14. Return metadata (include zip for later conversion)
  return {
    deckName,
    modelName,
    isClozeModel,
    noteCount,
    importableNoteCount: modelUsage[primaryModelId],
    cardCount,
    mediaCount,
    fields,
    templates,
    // Store these for conversion phase
    _zip: zip,
    _primaryModelId: primaryModelId,
    _primaryModelNoteCount: modelUsage[primaryModelId],
    _mediaIndex: mediaIndex
  };
}

/**
 * Convert analyzed APKG to MoFaCTS TDF using configuration
 * @param {Object} metadata - Result from analyzeApkg (includes _zip, _primaryModelId, _mediaIndex)
 * @param {Object} config - TDF configuration
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Object} { tdf, stims, mediaFiles, cardCount }
 */
export async function convertApkgWithConfig(metadata: any, config: any, onProgress: any = () => {}) {
  const draft = await buildDraftLessonFromApkg(metadata, config, onProgress);
  return {
    tdf: { tutor: draft.workingCopy.tutor },
    stims: draft.workingCopy.stimuli,
    mediaFiles: draft.generatedBaseline.mediaFiles,
    cardCount: draft.stats?.totalItems || 0,
    skippedCards: draft.stats?.skippedItems || 0,
    skippedReasons: (draft.generatedBaseline.manifestMeta as any)?.skippedReasons || {
      emptyPrompt: 0,
      emptyResponse: 0,
      missingPromptMedia: 0,
      missingResponseMedia: 0
    }
  };
}

export async function buildDraftLessonsFromApkg(metadata: any, configs: any, onProgress: any = () => {}) {
  const drafts: ImportDraftLesson[] = [];
  for (let i = 0; i < configs.length; i += 1) {
    const config = configs[i];
    const progressBase = (i / configs.length) * 100;
    const draft = await buildDraftLessonFromApkg(metadata, config, (p: number) => {
      onProgress(progressBase + (p / configs.length));
    });
    drafts.push(draft);
  }
  onProgress(100);
  return drafts;
}

async function buildDraftLessonFromApkg(metadata: any, config: any, onProgress: any = () => {}) {
  onProgress(5);

  // Validate config
  if (!config.name) {
    throw new Error('Config must have a name');
  }
  if (config.prompt.field === undefined || config.response.field === undefined) {
    throw new Error('Config must specify prompt.field and response.field');
  }
  if (config.prompt.field === config.response.field) {
    throw new Error('Prompt and response fields must be different');
  }

  const rangeSelection = parseImportIndexSpec(config.sourceRange, getImportableNoteCount(metadata));
  if (!rangeSelection.valid) {
    throw new Error(rangeSelection.errorMessage || 'Invalid note range');
  }

  const { _zip: zip, _primaryModelId: primaryModelId, _mediaIndex: mediaIndex } = metadata;

  if (!zip) {
    throw new Error('Metadata missing zip data - run analyzeApkg first');
  }

  const mediaIndexByName: Record<string, any> = {};
  for (const [key, value] of Object.entries(mediaIndex as Record<string, any>)) {
    if (value && !mediaIndexByName[value]) {
      mediaIndexByName[value] = key;
    }
  }

  // Initialize SQL if needed
  await initSQL();

  // Re-open database from zip
  let sqliteBytes;
  const c21 = zip.file('collection.anki21');
  const c2 = zip.file('collection.anki2');

  if (c21) {
    sqliteBytes = await c21.async('uint8array');
  } else if (c2) {
    sqliteBytes = await c2.async('uint8array');
  }

  const db = new SQL.Database(new Uint8Array(sqliteBytes));
  onProgress(20);

  // Load all notes from primary model
  const selectedIndexes = rangeSelection.indexes ? new Set(rangeSelection.indexes) : null;
  const notes: any[] = [];
  const allPrimaryModelNotes = queryAll(
    db,
    `SELECT id, guid, mid, flds, tags FROM notes WHERE mid = ${primaryModelId} ORDER BY id ASC`
  );
  allPrimaryModelNotes.forEach((row: any, ordinal: number) => {
    if (selectedIndexes && !selectedIndexes.has(ordinal)) {
      return;
    }
    notes.push({
      id: row.id,
      guid: row.guid,
      mid: row.mid,
      fields: splitFields(row.flds),
      tags: row.tags || ''
    });
  });
  onProgress(40);

  // Process notes into cards
  const cards: any[] = [];
  const referencedMedia = new Set<string>();
  const skipped = {
    emptyPrompt: 0,
    emptyResponse: 0,
    missingPromptMedia: 0,
    missingResponseMedia: 0
  };

  for (const note of notes) {
    const promptFieldValue = note.fields[config.prompt.field] || '';
    const responseFieldValue = note.fields[config.response.field] || '';

    const promptContent = buildFieldContent(
      promptFieldValue,
      config.prompt.type,
      mediaIndex,
      mediaIndexByName,
      zip
    );
    if (promptContent.missingRefs.length > 0) {
      skipped.missingPromptMedia += 1;
      continue;
    }

    const responseContent = buildFieldContent(
      responseFieldValue,
      config.response.type,
      mediaIndex,
      mediaIndexByName,
      zip
    );
    if (responseContent.missingRefs.length > 0) {
      skipped.missingResponseMedia += 1;
      continue;
    }

    if (!isFieldComplete(promptContent, config.prompt.type)) {
      skipped.emptyPrompt += 1;
      continue;
    }

    if (!isFieldComplete(responseContent, config.response.type)) {
      skipped.emptyResponse += 1;
      continue;
    }

    const cardMediaRefs = new Set<string>();
    promptContent.resolvedRefs.forEach((ref: any) => cardMediaRefs.add(ref.filename));
    responseContent.resolvedRefs.forEach((ref: any) => cardMediaRefs.add(ref.filename));

    cards.push({
      promptText: promptContent.text,
      promptImage: promptContent.image,
      responseText: responseContent.text,
      responseImage: responseContent.image,
      tags: note.tags
    });

    cardMediaRefs.forEach((filename: string) => referencedMedia.add(filename));
  }
  onProgress(60);

  const items = cards.map((card: any) => ({
    prompt: {
      ...(card.promptText ? { text: card.promptText } : {}),
      ...(card.promptImage ? { imgSrc: card.promptImage } : {})
    },
    response: {
      correctResponse: card.responseText || card.responseImage
    },
    sourceType: 'freeResponse' as const
  }));
  onProgress(80);

  // Extract referenced media files
  const mediaFiles: Record<string, any> = {};
  for (const filename of referencedMedia) {
    const numericKey = mediaIndexByName[filename];
    if (numericKey && zip.file(numericKey)) {
      const data = await zip.file(numericKey).async('base64');
      mediaFiles[filename] = data;
    } else if (zip.file(filename)) {
      const data = await zip.file(filename).async('base64');
      mediaFiles[filename] = data;
    } else {
      clientConsole(1, `[APKG] Media file not found: ${filename}`);
    }
  }

  // Close database
  db.close();
  onProgress(100);

  return buildImportLessonDraft({
    id: config.name,
    sourceKind: 'apkg',
    lessonName: config.name,
    instructions: config.instructions ||
      `<p>This lesson was imported from an Anki deck.</p><p>Study each card and type your answer when prompted.</p>`,
    items,
    mediaFiles,
    sourceConfig: {
      sourceRange: config.sourceRange || '',
      prompt: config.prompt,
      response: config.response
    },
    skippedItems: skipped.emptyPrompt + skipped.emptyResponse + skipped.missingPromptMedia + skipped.missingResponseMedia,
    manifestMeta: {
      skippedReasons: skipped
    }
  });
}

/**
 * Generate multiple TDFs from configs and package as ZIP
 * @param {Object} metadata - Result from analyzeApkg
 * @param {Array} configs - Array of TDF configurations
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Object} { mode, tdf?, stims?, mediaFiles?, zipBlob?, manifest? }
 */
export async function generateTdfsFromApkg(metadata: any, configs: any, onProgress: any = () => {}) {
  const lessons = await buildDraftLessonsFromApkg(metadata, configs, onProgress);
  const lesson = lessons[0];
  if (lessons.length === 1 && lesson) {
    return {
      mode: 'single',
      tdf: { tutor: lesson.workingCopy.tutor },
      stims: lesson.workingCopy.stimuli,
      mediaFiles: lesson.generatedBaseline.mediaFiles,
      cardCount: lesson.stats?.totalItems || 0,
      skippedCards: lesson.stats?.skippedItems || 0,
      skippedReasons: (lesson.generatedBaseline.manifestMeta as any)?.skippedReasons || {
        emptyPrompt: 0,
        emptyResponse: 0,
        missingPromptMedia: 0,
        missingResponseMedia: 0
      }
    };
  }

  const packaged = await buildImportPackageFromDraftLessons(lessons);
  const skippedReasons = {
    emptyPrompt: 0,
    emptyResponse: 0,
    missingPromptMedia: 0,
    missingResponseMedia: 0
  };

  lessons.forEach((lesson) => {
    const reasons = (lesson.generatedBaseline.manifestMeta as any)?.skippedReasons;
    if (!reasons) {
      return;
    }
    skippedReasons.emptyPrompt += reasons.emptyPrompt || 0;
    skippedReasons.emptyResponse += reasons.emptyResponse || 0;
    skippedReasons.missingPromptMedia += reasons.missingPromptMedia || 0;
    skippedReasons.missingResponseMedia += reasons.missingResponseMedia || 0;
  });

  return {
    mode: packaged.mode,
    zipBlob: packaged.zipBlob,
    manifest: packaged.manifest.map((item) => ({
      ...item,
      skippedCards: (item as any).skippedCount || 0
    })),
    totalCards: packaged.totalCards,
    totalMedia: packaged.totalMedia,
    totalSkipped: packaged.totalSkipped,
    skippedReasons
  };
}





