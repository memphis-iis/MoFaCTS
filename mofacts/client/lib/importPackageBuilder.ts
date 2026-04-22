import JSZip from 'jszip';
import type { BuiltImportPackage, ImportDraftLesson } from './normalizedImportTypes';
import { getImportFileNames } from './importCompositionBuilder';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export async function buildImportPackageFromDraftLessons(lessons: ImportDraftLesson[]): Promise<BuiltImportPackage> {
  const zip = new JSZip();
  const manifest: Array<Record<string, unknown>> = [];
  let totalCards = 0;
  let totalSkipped = 0;
  let totalMedia = 0;

  for (const lesson of lessons) {
    // lesson.workingCopy.tutor is the inner object (the value of the "tutor" key),
    // not the wrapped { tutor: ... } document. buildImportLessonDraft stores it
    // that way and tdfDraftEditor.getValue() also returns the unwrapped inner
    // object. We wrap it here once to produce the { tutor: ... } JSON that the
    // server's processPackageUpload expects. Do not store the wrapped form in
    // workingCopy or this will double-wrap and break server-side TDF lookup.
    const lessonName = (lesson.workingCopy.tutor as any)?.setspec?.lessonname || lesson.title;
    const { stimFileName, tdfFileName, safeName } = getImportFileNames(lessonName);
    const tutorDoc = { tutor: clone(lesson.workingCopy.tutor) };
    const stimuliDoc = clone(lesson.workingCopy.stimuli);

    if ((tutorDoc.tutor as any)?.setspec) {
      (tutorDoc.tutor as any).setspec.stimulusfile = stimFileName;
      (tutorDoc.tutor as any).setspec.lessonname = safeName;
    }

    zip.file(tdfFileName, JSON.stringify(tutorDoc, null, 2));
    zip.file(stimFileName, JSON.stringify(stimuliDoc, null, 2));

    const mediaFiles = lesson.generatedBaseline.mediaFiles || {};
    for (const [filename, content] of Object.entries(mediaFiles)) {
      if (zip.file(filename)) {
        continue;
      }
      if (typeof content === 'string') {
        zip.file(filename, content, { base64: true });
      } else {
        zip.file(filename, content);
      }
    }

    const cardCount = lesson.workingCopy.stimuli?.setspec?.clusters?.length || 0;
    const skippedCount = lesson.stats?.skippedItems || 0;
    const mediaCount = Object.keys(mediaFiles).length;

    manifest.push({
      ...((lesson.generatedBaseline.manifestMeta || {}) as Record<string, unknown>),
      tdfName: safeName,
      tdfFile: tdfFileName,
      stimFile: stimFileName,
      cardCount,
      skippedCount,
      mediaCount
    });

    totalCards += cardCount;
    totalSkipped += skippedCount;
    totalMedia += mediaCount;
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    mode: lessons.length === 1 ? 'single' : 'multiple',
    zipBlob,
    manifest,
    totalCards,
    totalSkipped,
    totalMedia,
    lessons
  };
}
