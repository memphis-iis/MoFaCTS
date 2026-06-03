import { expect } from 'chai';
import sinon from 'sinon';
import {
  deleteSavedOpenRouterApiKey,
  getSavedOpenRouterApiKey,
  hasSavedOpenRouterApiKey,
  saveOpenRouterApiKey,
  testOpenRouterClientConfig,
} from './openRouterClientProfile';

describe('openRouterClientProfile', function() {
  afterEach(function() {
    deleteSavedOpenRouterApiKey();
    sinon.restore();
  });

  it('stores OpenRouter keys only in browser local storage and trims whitespace', function() {
    saveOpenRouterApiKey('  test-key  ');

    expect(getSavedOpenRouterApiKey()).to.equal('test-key');
    expect(hasSavedOpenRouterApiKey()).to.equal(true);

    deleteSavedOpenRouterApiKey();
    expect(getSavedOpenRouterApiKey()).to.equal('');
    expect(hasSavedOpenRouterApiKey()).to.equal(false);
  });

  it('rejects keys with whitespace', function() {
    expect(() => saveOpenRouterApiKey('bad key')).to.throw('OpenRouter API key cannot contain whitespace.');
  });

  it('classifies profile test failures from OpenRouter status and body', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.resolves(new Response('model was not found', { status: 404 }));

    const result = await testOpenRouterClientConfig('test-key', 'missing/model');

    expect(result).to.deep.equal({ success: false, message: 'Model not found' });
  });

  it('requires both profile test key and model before calling OpenRouter', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');

    expect(await testOpenRouterClientConfig('', 'model')).to.deep.equal({
      success: false,
      message: 'OpenRouter API key is required',
    });
    expect(await testOpenRouterClientConfig('key', '')).to.deep.equal({
      success: false,
      message: 'Default OpenRouter model is required',
    });
    expect(fetchStub.called).to.equal(false);
  });
});
