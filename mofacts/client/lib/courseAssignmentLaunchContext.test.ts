import { Session } from 'meteor/session';
import { expect } from 'chai';
import {
  applyCourseAssignmentLaunchContext,
  getCourseAssignmentLaunchContext,
  setCourseAssignmentLaunchContext,
} from './courseAssignmentLaunchContext';

describe('courseAssignmentLaunchContext', function() {
  beforeEach(function() {
    setCourseAssignmentLaunchContext(null);
  });

  it('stamps course assignment context onto matching history records', function() {
    const context = {
      assignmentId: 'assignment-1',
      courseId: 'course-1',
      TDFId: 'tdf-1',
      launchSource: 'courses' as const,
    };
    setCourseAssignmentLaunchContext(context);

    const record = applyCourseAssignmentLaunchContext<Record<string, unknown>>({
      TDFId: 'tdf-1',
      levelUnitType: 'model',
    });

    expect(record.courseAssignment).to.deep.equal(context);
    expect(getCourseAssignmentLaunchContext()).to.deep.equal(context);
  });

  it('fails clearly when history TDF does not match the course launch context', function() {
    setCourseAssignmentLaunchContext({
      assignmentId: 'assignment-1',
      courseId: 'course-1',
      TDFId: 'tdf-1',
      launchSource: 'courses',
    });

    expect(
      () => applyCourseAssignmentLaunchContext({
        TDFId: 'other-tdf',
        levelUnitType: 'model',
      }),
    ).to.throw(/History TDFId does not match course assignment launch context/);
  });

  it('fails clearly for malformed course launch context', function() {
    Session.set('courseAssignmentLaunchContext', {
      assignmentId: 'assignment-1',
      courseId: '',
      TDFId: 'tdf-1',
      launchSource: 'courses',
    });

    expect(
      () => getCourseAssignmentLaunchContext(),
    ).to.throw(/Invalid course assignment launch context/);
  });
});
