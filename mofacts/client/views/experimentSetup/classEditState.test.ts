import { expect } from 'chai';
import {
  buildCourseManagementData,
  coursePayloadFromDraft,
  defaultCourseDraft,
  normalizeSectionNames,
  sectionNamesText,
} from './classEditState';

describe('classEditState', function() {
  it('builds course rows and section links for the active teacher', function() {
    const data = buildCourseManagementData([
      {
        courseId: 'course-1',
        courseName: 'Algebra',
        teacherUserId: 'teacher-1',
        sectionId: 'section-1',
        sectionName: 'Morning',
        visibility: 'public',
      },
      {
        courseId: 'course-2',
        courseName: 'Geometry',
        teacherUserId: 'teacher-2',
        sectionId: 'section-2',
        sectionName: 'Afternoon',
      },
    ], 'teacher-1', 'America/Chicago');

    expect(data.courses.map((course) => course.courseName)).to.deep.equal(['Algebra']);
    expect(data.courses[0]?.sections).to.deep.equal(['Morning']);
    expect(data.courses[0]?.visibility).to.equal('public');
    expect(data.sectionLinks.map((section) => section.sectionId)).to.deep.equal(['section-1']);
  });

  it('normalizes section text and serializes it for editing', function() {
    expect(normalizeSectionNames(' Alpha \n\n Beta \r\n')).to.deep.equal(['Alpha', 'Beta']);
    expect(sectionNamesText(['Alpha', 'Beta'])).to.equal('Alpha\nBeta');
  });

  it('trims save payloads without changing the draft object', function() {
    const draft = {
      ...defaultCourseDraft('teacher-1', 'America/Chicago'),
      courseName: ' Algebra ',
      sections: [' Morning ', '', 'Afternoon'],
      timezone: ' America/Chicago ',
      visibility: 'public' as const,
    };

    expect(coursePayloadFromDraft(draft)).to.include({
      courseName: 'Algebra',
      timezone: 'America/Chicago',
      visibility: 'public',
    });
    expect(coursePayloadFromDraft(draft).sections).to.deep.equal(['Morning', 'Afternoon']);
    expect(draft.courseName).to.equal(' Algebra ');
  });
});
