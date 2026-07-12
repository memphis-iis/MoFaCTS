import { expect } from 'chai';
import { validateAndEncryptUploadedApiKey } from './uploadedApiKeyValidation';

describe('uploaded API key validation', function() {
  it('rejects placeholders before encryption', function() {
    expect(() => validateAndEncryptUploadedApiKey({
      encryptData: (value) => `encrypted:${value}`,
      field: 'speechAPIKey',
      value: 'YOUR_GOOGLE_API_KEY',
    })).to.throw('speechAPIKey contains a placeholder or malformed provider key');
  });

  it('encrypts a structurally valid Google key', function() {
    const key = `AIza${'a'.repeat(24)}`;
    expect(validateAndEncryptUploadedApiKey({
      encryptData: (value) => `encrypted:${value}`,
      field: 'textToSpeechAPIKey',
      value: key,
    })).to.equal(`encrypted:${key}`);
  });
});
