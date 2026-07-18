import { expect } from 'chai';
import {
  CLIENT_VERBOSITY_SETTING,
  SERVER_VERBOSITY_SETTING,
  parseLoggingVerbosityLevel,
  resolveLoggingSettingValue,
  shouldEmitLogMessage,
} from './loggingSettings';

describe('logging settings contract', function() {
  it('accepts only exact supported verbosity values', function() {
    expect(parseLoggingVerbosityLevel(0)).to.equal(0);
    expect(parseLoggingVerbosityLevel('1')).to.equal(1);
    expect(parseLoggingVerbosityLevel(2)).to.equal(2);
    expect(() => parseLoggingVerbosityLevel(Number.NaN)).to.throw('Unsupported logging verbosity level');
    expect(() => parseLoggingVerbosityLevel('1-extra')).to.throw('Unsupported logging verbosity level');
    expect(() => parseLoggingVerbosityLevel(3)).to.throw('Unsupported logging verbosity level');
  });

  it('uses explicit defaults only when no setting exists', function() {
    expect(resolveLoggingSettingValue(SERVER_VERBOSITY_SETTING, [])).to.equal(1);
    expect(resolveLoggingSettingValue(CLIENT_VERBOSITY_SETTING, [])).to.equal(0);
  });

  it('deduplicates agreeing values and rejects conflicting values', function() {
    expect(resolveLoggingSettingValue(CLIENT_VERBOSITY_SETTING, [
      { value: 2 },
      { value: '2' },
    ])).to.equal(2);
    expect(() => resolveLoggingSettingValue(CLIENT_VERBOSITY_SETTING, [
      { value: 1 },
      { value: 2 },
    ])).to.throw('Conflicting clientVerbosityLevel setting documents');
  });

  it('implements off, routine, and detailed server logging thresholds', function() {
    expect(shouldEmitLogMessage(0, 0)).to.equal(false);
    expect(shouldEmitLogMessage(1, 1)).to.equal(true);
    expect(shouldEmitLogMessage(1, 2)).to.equal(false);
    expect(shouldEmitLogMessage(2, 1)).to.equal(true);
    expect(shouldEmitLogMessage(2, 2)).to.equal(true);
  });
});
