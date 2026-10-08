import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { FilesCollection } from 'meteor/ostrio:files';

if (Meteor.isClient) describe('DDP-only file transport', () => {
  it('expires the former host-only cookie and rejects explicit HTTP transport', () => {
    document.cookie = 'x_mtok=synthetic-retired-session; Path=/; SameSite=Lax';
    const files: any = new FilesCollection({ collectionName: 'uploadTransportTest', disableSetTokenCookie: true });
    expect(document.cookie.split(';').some(part => part.trim().startsWith('x_mtok='))).to.equal(false);
    expect(() => files.insert({ file: new File(['test'], 'synthetic.txt'), transport: 'http' } as any, false))
      .to.throw(/Uploads require DDP/);
    expect(() => files.insert({ file: new File(['test'], 'synthetic.txt'), transport: 'invalid' } as any, false))
      .to.throw(/Uploads require DDP/);
  });
});
