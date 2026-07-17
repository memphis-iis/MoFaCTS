import { expect } from 'chai';
import sinon from 'sinon';
import { callOpenRouterForAutoTutor, callOpenRouterForItemCueRepair, callOpenRouterForItems } from './aiContentOpenRouterClient';
import {
  OPENROUTER_CHAT_COMPLETIONS_URL,
} from './openRouterClientProfile';

describe('aiContentOpenRouterClient', function() {
  let fetchStub: sinon.SinonStub;

  beforeEach(function() {
    fetchStub = sinon.stub(globalThis, 'fetch' as any);
  });

  afterEach(function() {
    fetchStub.restore();
  });

  it('posts item-generation prompts with the provided key and selected modules', async function() {
    fetchStub.resolves(new Response(JSON.stringify({
      choices: [{ message: { content: '{"lessonName":"Generated","items":[]}' } }],
    }), { status: 200 }));

    const content = await callOpenRouterForItems('source text', ['learningSession', 'assessmentSession'], 'test-openrouter-key', 'openai/test-model');

    expect(content).to.equal('{"lessonName":"Generated","items":[]}');
    expect(fetchStub.calledOnce).to.equal(true);
    const [url, request] = fetchStub.firstCall.args as [string, RequestInit];
    expect(url).to.equal(OPENROUTER_CHAT_COMPLETIONS_URL);
    expect((request.headers as Record<string, string>).Authorization).to.equal('Bearer test-openrouter-key');
    const body = JSON.parse(String(request.body));
    expect(body.model).to.equal('openai/test-model');
    expect(body.response_format.json_schema.name).to.equal('mofacts_ai_content_creator');
    expect(body.messages[0].content).to.equal('You create compact import-ready MoFaCTS authoring JSON. Return JSON only.');
    expect(body.messages[1].content).to.contain('Selected modules: learningSession, assessmentSession');
  });

  it('posts AutoTutor prompts and reports HTTP failures with response excerpts', async function() {
    fetchStub.resolves(new Response('bad model', { status: 404 }));

    try {
      await callOpenRouterForAutoTutor('source text', 'test-openrouter-key', 'missing/model');
      throw new Error('Expected request failure');
    } catch (error) {
      expect((error as Error).message).to.equal('OpenRouter AutoTutor request failed: OpenRouter returned non-JSON response for HTTP 404: bad model');
    }
  });

  it('posts uploaded WebP images as named multimodal source parts', async function() {
    fetchStub.resolves(new Response(JSON.stringify({
      choices: [{ message: { content: '{"lessonName":"Images","items":[]}' } }],
    }), { status: 200 }));

    await callOpenRouterForItems('Identify each photo.', ['learningSession'], 'test-openrouter-key', 'openai/test-model', [{
      packageFileName: 'bird.webp',
      originalName: 'bird.jpg',
      dataUrl: 'data:image/webp;base64,AAAA',
    }]);

    const [, request] = fetchStub.firstCall.args as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body.messages[1].content).to.be.an('array');
    expect(body.messages[1].content[0].text).to.contain('"assetFileName":"bird.webp"');
    expect(body.messages[1].content[1].text).to.contain('bird.webp');
    expect(body.messages[1].content[2]).to.deep.equal({
      type: 'image_url',
      image_url: { url: 'data:image/webp;base64,AAAA' },
    });
  });

  it('posts item cue repair as a continuation of the original item chat', async function() {
    fetchStub.resolves(new Response(JSON.stringify({
      choices: [{ message: { content: '{"repairs":[{"itemIndex":0,"prompt":{"text":"replacement"}}]}' } }],
    }), { status: 200 }));

    const content = await callOpenRouterForItemCueRepair(
      'source text',
      ['learningSession'],
      '{"lessonName":"Generated","items":[]}',
      [{
        itemIndex: 0,
        promptText: 'A bright blue jay.',
        correctResponse: 'Blue Jay',
        forbiddenTerms: ['blue', 'jay'],
      }],
      'test-openrouter-key',
      'openai/test-model',
    );

    expect(content).to.contain('"repairs"');
    const [, request] = fetchStub.firstCall.args as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body.messages).to.have.length(4);
    expect(body.messages[1].content).to.contain('Selected modules: learningSession');
    expect(body.messages[2]).to.deep.equal({
      role: 'assistant',
      content: '{"lessonName":"Generated","items":[]}',
    });
    expect(body.messages[3].content).to.contain('forbiddenTerms');
    expect(body.messages[3].content).to.contain('blue');
    expect(body.temperature).to.equal(0.1);
  });

  it('rejects successful responses that omit message content', async function() {
    fetchStub.resolves(new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }));

    try {
      await callOpenRouterForItems('source text', ['learningSession'], 'test-openrouter-key', 'openai/test-model');
      throw new Error('Expected missing content failure');
    } catch (error) {
      expect((error as Error).message).to.equal('OpenRouter response did not include message content.');
    }
  });
});
