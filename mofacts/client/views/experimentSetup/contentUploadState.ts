export type ContentUploadListResult = Readonly<{
  ids: string[];
  totalCount: number;
  hasMore: boolean;
}>;

export type ContentUploadSummaryMap = Record<string, any>;

export type UploadQuotaStatus = Readonly<{
  unlimited: boolean;
  remaining?: number;
  dailyLimit?: number;
  maxFileSize?: string;
}>;

export type SummaryLoadStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'refreshing'
  | 'refresh-error'
  | 'error';

export type RowSummaryPresentation = Readonly<{
  lessonName: string;
  summaryLoading: boolean;
  errors: string[];
}>;

export function normalizeContentUploadListResult(result: any): ContentUploadListResult {
  const ids = Array.isArray(result?.ids) ? result.ids.map((id: unknown) => String(id)) : [];
  const totalCount = Number.isFinite(result?.totalCount) ? result.totalCount : ids.length;
  const hasMore = typeof result?.hasMore === 'boolean'
    ? result.hasMore
    : totalCount > ids.length;
  return { ids, totalCount, hasMore };
}

export function normalizeContentUploadSummaryMap(summaries: any): ContentUploadSummaryMap {
  const map: ContentUploadSummaryMap = {};
  if (!Array.isArray(summaries)) {
    return map;
  }
  summaries.forEach((summary: any) => {
    if (summary?._id) {
      map[String(summary._id)] = summary;
    }
  });
  return map;
}

export function normalizeUploadQuotaStatus(status: any): UploadQuotaStatus {
  return {
    unlimited: status?.unlimited === true,
    remaining: status?.remaining,
    dailyLimit: status?.dailyLimit,
    maxFileSize: status?.maxFileSize,
  };
}

export function buildRowSummaryPresentation(options: {
  summary: any;
  summaryStatus: SummaryLoadStatus;
  loadingText: string;
  missingText: string;
  failureText: string;
}): RowSummaryPresentation {
  if (options.summary) {
    return {
      lessonName: options.summary.lessonName || options.missingText,
      summaryLoading: false,
      errors: [],
    };
  }

  const waiting = options.summaryStatus === 'idle'
    || options.summaryStatus === 'loading'
    || options.summaryStatus === 'refreshing';
  if (waiting) {
    return {
      lessonName: options.loadingText,
      summaryLoading: true,
      errors: [],
    };
  }

  const failure = options.summaryStatus === 'error' || options.summaryStatus === 'refresh-error'
    ? options.failureText
    : options.missingText;
  return {
    lessonName: options.missingText,
    summaryLoading: false,
    errors: failure ? [failure] : [],
  };
}
