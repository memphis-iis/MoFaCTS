import { expect } from 'chai';
import {
  normalizeServerStatus,
  normalizeVerbosityLevel,
  radioChecked,
} from './adminControlsState';

describe('adminControlsState', function() {
  it('accepts only the supported verbosity levels', function() {
    expect(normalizeVerbosityLevel(0)).to.equal('0');
    expect(normalizeVerbosityLevel('1')).to.equal('1');
    expect(normalizeVerbosityLevel(2)).to.equal('2');
    expect(() => normalizeVerbosityLevel(3)).to.throw('Unsupported logging verbosity level');
    expect(() => normalizeVerbosityLevel('1-extra')).to.throw('Unsupported logging verbosity level');
  });

  it('normalizes server storage status without inventing display values', function() {
    expect(normalizeServerStatus({
      diskSpacePercent: '42',
      remainingSpace: '58',
      diskSpace: '100',
      diskSpaceUsed: '42',
      error: '',
    })).to.deep.equal({
      diskSpacePercent: '42',
      remainingSpace: '58',
      diskSpace: '100',
      diskSpaceUsed: '42',
      error: null,
    });
    expect(normalizeServerStatus(null)).to.deep.equal({
      diskSpacePercent: '',
      remainingSpace: '',
      diskSpace: '',
      diskSpaceUsed: '',
      error: null,
    });
  });

  it('derives radio checked attributes from confirmed state', function() {
    expect(radioChecked('1', '1')).to.equal('checked');
    expect(radioChecked('1', '2')).to.equal('');
    expect(radioChecked(null, '1')).to.equal('');
  });

});
