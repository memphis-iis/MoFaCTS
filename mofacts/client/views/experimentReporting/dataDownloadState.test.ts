import { expect } from 'chai';
import { normalizeDataDownloadRows } from './dataDownloadState';

describe('dataDownloadState', function() {
  it('normalizes downloadable TDF rows with condition metadata', function() {
    const rows = normalizeDataDownloadRows([{
      _id: 123,
      content: {
        fileName: 'lesson.xml',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Lesson',
              condition: ['a.xml', '', ' b.xml '],
            },
          },
        },
      },
    }]);

    expect(rows).to.deep.equal([{
      _id: '123',
      content: {
        fileName: 'lesson.xml',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Lesson',
              condition: ['a.xml', '', ' b.xml '],
            },
          },
        },
      },
      disp: 'Lesson',
      hasConditionChildren: true,
      conditionCount: 2,
    }]);
  });

  it('returns an empty list for invalid method results', function() {
    expect(normalizeDataDownloadRows(null)).to.deep.equal([]);
  });
});
