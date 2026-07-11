import { expect } from 'chai';
import {
  filterAssignableTdfs,
  orderedRows,
  rowsFromAssignmentSnapshot,
  validateAssignmentRows,
  type AssignmentEditorRow,
} from './tdfAssignmentEditState';

function message(key: string, values?: Record<string, unknown>): string {
  return `${key}:${String(values?.title || '')}`;
}

function assignmentRow(
  overrides: Partial<AssignmentEditorRow> & Pick<AssignmentEditorRow, 'TDFId'>,
): AssignmentEditorRow {
  const { TDFId, ...rest } = overrides;
  return {
    assignmentId: `assignment-${TDFId}`,
    courseId: 'course-1',
    TDFId,
    title: 'Lesson',
    order: 0,
    releaseAt: null,
    dueAt: null,
    required: true,
    availability: 'available',
    createdAt: null,
    updatedAt: null,
    fileName: '',
    tags: [],
    ...rest,
  };
}

describe('tdfAssignmentEditState', function() {
  it('shapes assignment snapshots into editable rows', function() {
    const rows = rowsFromAssignmentSnapshot({
      course: { courseId: 'course-1', timezone: 'America/Chicago' } as any,
      assignableTdfs: [{ TDFId: 'tdf-1', fileName: 'lesson.xml', tags: ['math'] }] as any,
      assignments: [{
        assignmentId: 'assignment-1',
        courseId: 'course-1',
        TDFId: 'tdf-1',
        title: 'Lesson',
        order: 7,
        releaseAt: '2026-01-02T03:04:00.000Z',
        dueAt: null,
        required: true,
        availability: 'available',
        createdAt: null,
        updatedAt: null,
      }] as any,
    });

    expect(rows[0]).to.include({
      assignmentId: 'assignment-1',
      fileName: 'lesson.xml',
      order: 0,
    });
    expect(rows[0]?.tags).to.deep.equal(['math']);
    expect(rows[0]?.releaseAt).to.be.instanceOf(Date);
  });

  it('filters assignable TDFs by selected rows and query', function() {
    const rows = [assignmentRow({ TDFId: 'tdf-selected' })];
    const result = filterAssignableTdfs([
      { TDFId: 'tdf-selected', displayName: 'Selected', fileName: 'selected.xml', tags: [] },
      { TDFId: 'tdf-match', displayName: 'Algebra', fileName: 'lesson.xml', tags: ['fractions'] },
      { TDFId: 'tdf-miss', displayName: 'Geometry', fileName: 'shape.xml', tags: [] },
    ] as any, rows, 'frac');

    expect(result.map((tdf) => tdf.TDFId)).to.deep.equal(['tdf-match']);
  });

  it('renumbers rows and validates duplicate/date errors', function() {
    const rows = orderedRows([
      assignmentRow({
        TDFId: 'tdf-1',
        title: 'Lesson',
        releaseAt: new Date('2026-01-02T10:00:00.000Z'),
        dueAt: new Date('2026-01-01T10:00:00.000Z'),
      }),
    ]);
    expect(rows[0]?.order).to.equal(0);
    expect(validateAssignmentRows(rows, message)).to.equal('courseAssignments.dueAfterVisibleDate:Lesson');

    const duplicateRows = [
      assignmentRow({ TDFId: 'tdf-1', title: 'A' }),
      assignmentRow({ TDFId: 'tdf-1', title: 'B' }),
    ];
    expect(validateAssignmentRows(duplicateRows, message)).to.equal('courseAssignments.duplicateLesson:B');
  });
});
