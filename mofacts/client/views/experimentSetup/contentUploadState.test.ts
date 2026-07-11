import { expect } from 'chai';
import {
  buildRowSummaryPresentation,
  normalizeContentUploadListResult,
  normalizeContentUploadSummaryMap,
  normalizeUploadQuotaStatus,
} from './contentUploadState';

describe('contentUploadState', function() {
  it('normalizes list method results without inventing has-more state', function() {
    expect(normalizeContentUploadListResult({ ids: [123, 'abc'], totalCount: 3 })).to.deep.equal({
      ids: ['123', 'abc'],
      totalCount: 3,
      hasMore: true,
    });
    expect(normalizeContentUploadListResult({ ids: ['abc'], totalCount: 1, hasMore: false })).to.deep.equal({
      ids: ['abc'],
      totalCount: 1,
      hasMore: false,
    });
  });

  it('indexes summaries by id and ignores invalid rows', function() {
    const map = normalizeContentUploadSummaryMap([
      { _id: 'tdf-a', lessonName: 'A' },
      { lessonName: 'missing id' },
      null,
    ]);
    expect(Object.keys(map)).to.deep.equal(['tdf-a']);
    expect(map['tdf-a'].lessonName).to.equal('A');
  });

  it('keeps quota unresolved distinct from unlimited quota', function() {
    expect(normalizeUploadQuotaStatus({ unlimited: true }).unlimited).to.equal(true);
    expect(normalizeUploadQuotaStatus({ remaining: 2, dailyLimit: 3 })).to.deep.equal({
      unlimited: false,
      remaining: 2,
      dailyLimit: 3,
      maxFileSize: undefined,
    });
  });

  it('does not leave completed summary rows in a loading state', function() {
    expect(buildRowSummaryPresentation({
      summary: null,
      summaryStatus: 'loading',
      loadingText: 'Loading...',
      missingText: 'Summary not found',
      failureText: '',
    })).to.deep.equal({
      lessonName: 'Loading...',
      summaryLoading: true,
      errors: [],
    });

    expect(buildRowSummaryPresentation({
      summary: null,
      summaryStatus: 'ready',
      loadingText: 'Loading...',
      missingText: 'Summary not found',
      failureText: '',
    })).to.deep.equal({
      lessonName: 'Summary not found',
      summaryLoading: false,
      errors: ['Summary not found'],
    });

    expect(buildRowSummaryPresentation({
      summary: null,
      summaryStatus: 'error',
      loadingText: 'Loading...',
      missingText: 'Summary not found',
      failureText: 'Summary failed',
    })).to.deep.equal({
      lessonName: 'Summary not found',
      summaryLoading: false,
      errors: ['Summary failed'],
    });
  });
});
