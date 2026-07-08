import { expect } from 'chai';
import { shouldSubmitTextInputOnKeydown } from './textInputComposition';

describe('text input composition handling', function() {
  it('submits Enter only after IME composition has finished', function() {
    expect(shouldSubmitTextInputOnKeydown({ key: 'Enter' })).to.equal(true);
    expect(shouldSubmitTextInputOnKeydown({ key: 'Enter', isComposing: false })).to.equal(true);
    expect(shouldSubmitTextInputOnKeydown({ key: 'Enter', isComposing: true })).to.equal(false);
  });

  it('does not submit non-Enter keys', function() {
    expect(shouldSubmitTextInputOnKeydown({ key: 'Process', isComposing: true })).to.equal(false);
    expect(shouldSubmitTextInputOnKeydown({ key: 'a' })).to.equal(false);
  });
});
