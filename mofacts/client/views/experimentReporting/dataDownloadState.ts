export type DataDownloadRow = Readonly<{
  _id: string;
  content: any;
  disp: string;
  hasConditionChildren: boolean;
  conditionCount: number;
}>;

function conditionRefs(tdf: any): string[] {
  const raw = tdf?.content?.tdfs?.tutor?.setspec?.condition;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry: unknown) => String(entry || '').trim())
    .filter((entry) => entry.length > 0);
}

export function normalizeDataDownloadRows(value: unknown): DataDownloadRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((tdf: any) => {
    const refs = conditionRefs(tdf);
    return {
      ...tdf,
      _id: String(tdf?._id || ''),
      content: tdf?.content || {},
      disp: tdf?.content?.tdfs?.tutor?.setspec?.lessonname || 'NO NAME',
      hasConditionChildren: refs.length > 0,
      conditionCount: refs.length,
    };
  });
}
