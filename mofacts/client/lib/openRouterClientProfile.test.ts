import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import sinon from 'sinon';
import {
  getOwnOpenRouterSettings,
  testOpenRouterClientConfig,
} from './openRouterClientProfile';

describe('openRouterClientProfile', function() {
  afterEach(function() {
    sinon.restore();
  });

  it('classifies profile test failures from OpenRouter status and body', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({
      error: { message: 'model was not found' },
    }), { status: 404 }));

    const result = await testOpenRouterClientConfig('test-key', 'missing/model');

    expect(result).to.deep.equal({ success: false, message: 'Model not found' });
    const [, request] = fetchStub.firstCall.args as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body.response_format).to.equal(undefined);
    expect(body.messages).to.deep.equal([
      { role: 'system', content: 'Return JSON only.' },
      { role: 'user', content: 'Reply with exactly this JSON object: {"ok":true}' },
    ]);
  });

  it('requires both profile test key and model before calling OpenRouter', async function() {
    const fetchStub = sinon.stub(globalThis, 'fetch');

    expect(await testOpenRouterClientConfig('', 'model')).to.deep.equal({
      success: false,
      message: 'OpenRouter API key is required',
    });
    expect(await testOpenRouterClientConfig('key', '')).to.deep.equal({
      success: false,
      message: 'OpenRouter model is required',
    });
    expect(fetchStub.called).to.equal(false);
  });

  it('reads saved OpenRouter settings from the server', async function() {
    const callAsyncStub = sinon.stub(Meteor as any, 'callAsync').resolves({
      model: ' openai/test-model ',
      reasoningLevel: 'high',
      hasOpenRouterKey: true,
    });

    const settings = await getOwnOpenRouterSettings();

    expect(callAsyncStub.calledWith('getOwnOpenRouterSettings')).to.equal(true);
    expect(settings).to.deep.equal({
      model: 'openai/test-model',
      reasoningLevel: 'high',
      hasOpenRouterKey: true,
    });
  });

  it('normalizes a missing stored reasoning level to none', async function() {
    sinon.stub(Meteor as any, 'callAsync').resolves({
      model: 'openai/test-model',
      hasOpenRouterKey: false,
    });

    const settings = await getOwnOpenRouterSettings();

    expect(settings.reasoningLevel).to.equal('none');
  });
});
