import { expect } from 'chai';
import sinon from 'sinon';
import { callOpenRouterForAutoTutor, callOpenRouterForItems } from './aiContentOpenRouterClient';
import {
  deleteSavedOpenRouterApiKey,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  saveOpenRouterApiKey,
} from './openRouterClientProfile';

describe('aiContentOpenRouterClient', function() {
  let fetchStub: sinon.SinonStub;

  beforeEach(function() {
    saveOpenRouterApiKey('test-openrouter-key');
    fetchStub = sinon.stub(globalThis, 'fetch' as any);
  });

  afterEach(function() {
    fetchStub.restore();
    deleteSavedOpenRouterApiKey();
  });

  it('posts item-generation prompts with saved client-side key and selected modules', async function() {
    fetchStub.resolves(new Response(JSON.stringify({
      choices: [{ message: { content: '{"lessonName":"Generated","items":[]}' } }],
    }), { status: 200 }));

    const content = await callOpenRouterForItems('source text', ['learningSession', 'assessmentSession'], 'openai/test-model');

    expect(content).to.equal('{"lessonName":"Generated","items":[]}');
    expect(fetchStub.calledOnce).to.equal(true);
    const [url, request] = fetchStub.firstCall.args as [string, RequestInit];
    expect(url).to.equal(OPENROUTER_CHAT_COMPLETIONS_URL);
    expect((request.headers as Record<string, string>).Authorization).to.equal('Bearer test-openrouter-key');
    const body = JSON.parse(String(request.body));
    expect(body.model).to.equal('openai/test-model');
    expect(body.messages[0].content).to.equal('You create compact import-ready MoFaCTS authoring JSON. Return JSON only.');
    expect(body.messages[1].content).to.contain('Selected modules: learningSession, assessmentSession');
  });

  it('posts AutoTutor prompts and reports HTTP failures with response excerpts', async function() {
    fetchStub.resolves(new Response('bad model', { status: 404 }));

    try {
      await callOpenRouterForAutoTutor('source text', 'missing/model');
      throw new Error('Expected request failure');
    } catch (error) {
      expect((error as Error).message).to.equal('OpenRouter AutoTutor request failed with HTTP 404: bad model');
    }
  });

  it('rejects successful responses that omit message content', async function() {
    fetchStub.resolves(new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }));

    try {
      await callOpenRouterForItems('source text', ['learningSession'], 'openai/test-model');
      throw new Error('Expected missing content failure');
    } catch (error) {
      expect((error as Error).message).to.equal('OpenRouter response did not include message content.');
    }
  });
});
