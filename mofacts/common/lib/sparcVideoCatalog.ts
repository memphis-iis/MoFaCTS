import { detectTdfUnitType } from '../fieldApplicability';

/** Small metadata projection shared by catalog eligibility readers. */
export const SPARC_VIDEO_CATALOG_FIELDS = {
  'content.tdfs.tutor.unit.sparcsession': 1,
  'rawStimuliFile.setspec.sparcPages.pageId': 1,
  'rawStimuliFile.setspec.sparcPages.display.unitType': 1,
} as const;

/** Catalogs need an authored AutoTutor page selected by a SPARC session. */
export function supportsSparcVideoCatalog(tdf: Record<string, any> | null | undefined): boolean {
  const units = tdf?.content?.tdfs?.tutor?.unit;
  const pages = tdf?.rawStimuliFile?.setspec?.sparcPages;
  return Array.isArray(units) && Array.isArray(pages) && units.some(unit => {
    if (detectTdfUnitType(unit) !== 'sparc') return false;
    return pages.some(page => page?.display?.unitType === 'sparc-autotutor-dialogue'
      && (!unit.sparcsession.pageId || page?.pageId === unit.sparcsession.pageId));
  });
}
