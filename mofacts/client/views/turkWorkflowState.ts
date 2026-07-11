export type TurkWorkflowExperiment = Readonly<{
  _id: string;
  selectorKey: string;
  fileName: string;
  lessonName: string;
  displayLabel: string;
}>;

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function formatTurkExperimentLabel(fileName: string, tdfId: string): string {
  const shortId = tdfId.slice(0, 8);
  return `${fileName} (${shortId})`;
}

export function normalizeTurkWorkflowExperiments(tdfs: unknown): TurkWorkflowExperiment[] {
  if (!Array.isArray(tdfs)) {
    return [];
  }

  const experiments: TurkWorkflowExperiment[] = [];
  tdfs.forEach((tdf: any) => {
    const tdfObject = tdf?.content;
    const setspec = tdfObject?.tdfs?.tutor?.setspec;
    const name = normalizeOptionalString(setspec?.lessonname);
    const fileName = normalizeOptionalString(tdfObject?.fileName);
    const expTarget = normalizeOptionalString(setspec?.experimentTarget);
    if (!tdfObject || !setspec || !name || !fileName || !expTarget) {
      return;
    }

    const tdfId = normalizeOptionalString(tdf?._id) || fileName;
    experiments.push({
      _id: tdfId,
      selectorKey: tdfId,
      fileName,
      lessonName: name,
      displayLabel: formatTurkExperimentLabel(fileName, tdfId),
    });
  });

  return experiments;
}
