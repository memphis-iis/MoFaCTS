import { expect } from 'chai';
import {
  classSelectionSnapshotIsEmpty,
  normalizeClassSelectionSnapshot,
  sectionsForTeacher,
  selectionForCurrentSection,
} from './classSelectionState';

describe('class selection state', function() {
  it('rejects invalid method responses instead of treating them as empty', function() {
    expect(() => normalizeClassSelectionSnapshot({}, [], () => true))
      .to.throw('invalid response');
  });

  it('filters invalid and unavailable options before classifying true empty', function() {
    const snapshot = normalizeClassSelectionSnapshot(
      [{ _id: 'teacher-1' }, { displayIdentifier: 'missing id' }],
      [
        { sectionId: 'section-1', teacherUserId: 'teacher-1', visibility: 'public' },
        { sectionId: 'section-2', teacherUserId: 'teacher-2', visibility: 'private' },
        { teacherUserId: 'teacher-1' },
      ],
      (section) => section.visibility === 'public',
    );
    expect(snapshot.teachers).to.have.length(1);
    expect(snapshot.sections).to.have.length(1);
    expect(classSelectionSnapshotIsEmpty(snapshot)).to.equal(false);
    expect(sectionsForTeacher(snapshot, 'teacher-1')).to.deep.equal(snapshot.sections);
    expect(sectionsForTeacher(snapshot, 'teacher-2')).to.deep.equal([]);
  });

  it('resolves the current section without direct DOM selection mutation', function() {
    const snapshot = normalizeClassSelectionSnapshot(
      [{ _id: 'teacher-1' }],
      [{ sectionId: 'section-1', teacherUserId: 'teacher-1' }],
      () => true,
    );
    expect(selectionForCurrentSection(snapshot, 'section-1')).to.deep.equal({
      teacherId: 'teacher-1',
      sectionId: 'section-1',
    });
    expect(selectionForCurrentSection(snapshot, 'missing')).to.deep.equal({
      teacherId: '',
      sectionId: '',
    });
  });
});
