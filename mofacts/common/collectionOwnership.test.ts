import { expect } from 'chai';
import { COLLECTION_OWNERSHIP, collectionMongoName } from './collectionOwnership';

describe('collection ownership registry', function() {
  it('documents the historical DynamicSettings collection name typo', function() {
    expect(collectionMongoName('DynamicSettings')).to.equal('dynaminc_settings');
    expect(COLLECTION_OWNERSHIP.DynamicSettings.notes).to.contain('misspelled historically');
  });

  it('keeps global bridge names unique and explicit', function() {
    const entries = Object.values(COLLECTION_OWNERSHIP);
    const globalNames = entries.map((entry) => entry.globalName);
    const mongoNames = entries.map((entry) => entry.mongoName);

    expect(new Set(globalNames).size).to.equal(globalNames.length);
    expect(new Set(mongoNames).size).to.equal(mongoNames.length);
    for (const entry of entries) {
      expect(entry.owner).to.be.a('string').and.not.equal('');
      expect(entry.purpose).to.be.a('string').and.not.equal('');
    }
  });
});
