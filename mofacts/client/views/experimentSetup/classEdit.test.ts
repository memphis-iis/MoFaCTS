import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import './classEdit';

declare const Blaze: any;

describe('course section editing in Blaze', function() {
  it('saves a rename and an explicit deletion with their original section IDs', async function() {
    const template = (Template as any).classEdit;
    const helpers = template.__helpers;
    const has = helpers.has.bind(helpers), get = helpers.get.bind(helpers);
    const host = document.createElement('div');
    document.body.append(host);
    let view;
    try {
      sinon.stub(helpers, 'has').callsFake((key: unknown) => key === 'isInRole' || has(key));
      sinon.stub(helpers, 'get').callsFake((key: unknown) => key === 'isInRole' ? () => true : get(key));
      sinon.stub(Meteor, 'userId').returns('teacher');
      const call = sinon.stub(Meteor as any, 'callAsync');
      call.withArgs('getAllCourseSections').resolves(['A', 'B'].map(sectionName => ({
        courseId: 'course', courseName: 'Course', teacherUserId: 'teacher', sectionId: sectionName, sectionName,
      })));
      call.withArgs('editCourse').resolves('course');
      view = Blaze.render(template, host);
      await new Promise(resolve => setTimeout(resolve, 0));
      Tracker.flush();
      const select = host.querySelector<HTMLSelectElement>('#class-select')!;
      select.value = 'course';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      Tracker.flush();
      const rename = host.querySelector<HTMLInputElement>('#section-A')!;
      expect(rename.disabled).to.equal(false);
      rename.value = 'Monday';
      rename.dispatchEvent(new Event('input', { bubbles: true }));
      host.querySelector<HTMLInputElement>('.remove-course-section[data-section-id="B"]')!.click();
      Tracker.flush();
      host.querySelector<HTMLButtonElement>('#saveClass')!.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const saved = call.getCalls().find(row => row.args[0] === 'editCourse');
      expect(saved?.args[1].existingSections).to.deep.equal([
        { sectionId: 'A', originalName: 'A', sectionName: 'Monday', remove: false },
        { sectionId: 'B', originalName: 'B', sectionName: 'B', remove: true },
      ]);
    } finally {
      if (view) Blaze.remove(view);
      host.remove();
      sinon.restore();
    }
  });
});
