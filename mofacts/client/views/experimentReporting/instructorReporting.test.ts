import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import './instructorReporting';

declare const Blaze: any;

describe('Instructor Reporting deadline controls', function() {
  it('retains the exact cutoff through a retry and a learner exception', async function() {
    const saved = Date.parse('2026-12-01T17:00:00-06:00');
    const custom = Date.parse('2026-12-01T18:30:00-06:00');
    const extension = Date.parse('2026-12-02T09:15:00-06:00');
    const template = (Template as any).instructorReporting;
    const helpers = template.__helpers;
    const has = helpers.has.bind(helpers), get = helpers.get.bind(helpers);
    const host = document.createElement('div');
    document.body.append(host);

    const change = (selector: string, value: string) => {
      const control = host.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const flush = async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
      Tracker.flush();
    };

    let view;
    try {
      sinon.stub(helpers, 'has').callsFake((key: unknown) => key === 'isInRole' || has(key));
      sinon.stub(helpers, 'get').callsFake((key: unknown) => key === 'isInRole' ? () => true : get(key));
      sinon.stub(Meteor, 'userId').returns('teacher');
      const call = sinon.stub(Meteor as any, 'callAsync');
      call.withArgs('getAllCoursesForInstructor').resolves([{ _id: 'course', courseName: 'Course' }]);
      call.withArgs('getTdfAssignmentsByCourseIdMap').resolves({ course: [{ assignmentId: 'assignment', TDFId: 'lesson', displayName: 'Lesson' }] });
      call.withArgs('addUserDueDateException').resolves();
      let failNext = false;
      const attempt = { userId: 'learner', username: 'Learner', count: 1, numCorrect: 1, totalTime: 2000, percentCorrect: '100.00%', totalTimeMins: '0.033' };
      call.withArgs('getClassPerformanceByTDF').callsFake(async (_method, _course, _lesson, cutoff) => {
        if (failNext) {
          failNext = false;
          throw new Error('Synthetic connection error');
        }
        return [[attempt], [attempt], { assignmentDueAt: saved, cutoffAt: cutoff === false ? saved : cutoff, timezone: 'America/Chicago' }];
      });
      const lastCutoff = () => call.getCalls().filter(row => row.args[0] === 'getClassPerformanceByTDF').at(-1)?.args[3];

      view = Blaze.render(template, host);
      await flush();
      change('#class-select', 'course');
      await flush();
      change('#tdf-select', 'lesson');
      await flush();
      expect(host.querySelectorAll('tbody .instructor-reporting-student-link')).to.have.length(1);
      expect(host.querySelector('tbody .instructor-reporting-student-link')?.closest('tr')?.cells[2]?.textContent?.trim()).to.equal('2');

      host.querySelector<HTMLInputElement>('#due-date-filter')!.click();
      await flush();
      expect(lastCutoff()).to.equal(false);
      expect(host.querySelectorAll('tbody .instructor-reporting-student-link')).to.have.length(2);
      failNext = true;
      change('#practice-deadline-date', '2026-12-01T18:30');
      await flush();
      expect(lastCutoff()).to.equal(custom);
      host.querySelector<HTMLButtonElement>('#retry-instructor-performance')!.click();
      await flush();
      expect(lastCutoff()).to.equal(custom);

      change('#exception-date', '2026-12-02T09:15');
      host.querySelector<HTMLButtonElement>('.add-exception')!.click();
      await flush();
      expect(call.calledWith('addUserDueDateException', 'learner', 'lesson', 'course', extension, 'assignment')).to.equal(true);
      expect(lastCutoff()).to.equal(custom);
      change('#practice-deadline-date', '');
      await flush();
      expect(lastCutoff()).to.equal(false);
    } finally {
      if (view) Blaze.remove(view);
      host.remove();
      sinon.restore();
    }
  });
});
