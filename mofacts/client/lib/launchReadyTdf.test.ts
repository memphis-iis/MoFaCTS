import { expect } from 'chai';
import {
  clearCourseAssignmentLaunchContext,
  setCourseAssignmentLaunchContext,
} from './courseAssignmentLaunchContext';
import { courseAssignmentContextForLaunchReadyTdf } from './launchReadyTdf';

describe('launchReadyTdf course assignment context', function() {
  beforeEach(function() {
    clearCourseAssignmentLaunchContext();
  });

  afterEach(function() {
    clearCourseAssignmentLaunchContext();
  });

  it('uses the active launch context when the option is omitted', function() {
    const context = {
      assignmentId: 'assignment-1',
      courseId: 'course-1',
      TDFId: 'tdf-1',
      launchSource: 'courses' as const,
    };
    setCourseAssignmentLaunchContext(context);

    expect(courseAssignmentContextForLaunchReadyTdf({})).to.deep.equal(context);
  });

  it('treats explicit null as no course launch context', function() {
    setCourseAssignmentLaunchContext({
      assignmentId: 'assignment-1',
      courseId: 'course-1',
      TDFId: 'tdf-1',
      launchSource: 'courses',
    });

    expect(courseAssignmentContextForLaunchReadyTdf({ courseAssignment: null })).to.equal(null);
  });

  it('uses the explicit course launch context when provided', function() {
    setCourseAssignmentLaunchContext({
      assignmentId: 'assignment-session',
      courseId: 'course-session',
      TDFId: 'tdf-session',
      launchSource: 'courses',
    });
    const explicitContext = {
      assignmentId: 'assignment-explicit',
      courseId: 'course-explicit',
      TDFId: 'tdf-explicit',
      launchSource: 'courses' as const,
    };

    expect(courseAssignmentContextForLaunchReadyTdf({ courseAssignment: explicitContext }))
      .to.deep.equal(explicitContext);
  });
});
