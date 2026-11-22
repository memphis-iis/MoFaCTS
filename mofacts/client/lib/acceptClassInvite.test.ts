import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { acceptClassInvite } from './acceptClassInvite';

describe('direct class invitations', function() {
  afterEach(() => sinon.restore());

  it('joins the invited section before reading its private enrollment labels', async function() {
    const teacher = { _id: 'teacher', displayIdentifier: 'Teacher' };
    const section = { sectionId: 'section', teacherUserId: teacher._id };
    sinon.stub(Meteor, 'userId').returns('learner');
    const set = sinon.stub(Session, 'set');
    let enrolled = false;
    const call = sinon.stub(Meteor as any, 'callAsync').callsFake(async (name: unknown, ...args: unknown[]) => {
      if (name === 'addUserToTeachersClass') {
        expect(args).to.deep.equal([teacher._id, section.sectionId]);
        enrolled = true;
        return true;
      }
      expect(enrolled).to.equal(true);
      if (name === 'getAllTeachers') return [teacher];
      if (name === 'getAllCourseSections') return [section];
      expect(name).to.equal('setUserLoginData');
      expect(args.slice(2)).to.deep.equal([teacher, section]);
    });
    await acceptClassInvite(teacher._id, section.sectionId);
    expect(call.callCount).to.equal(4);
    expect(set.calledWith('curTeacher', teacher)).to.equal(true);
    expect(set.calledWith('curClass', section)).to.equal(true);
  });
});
