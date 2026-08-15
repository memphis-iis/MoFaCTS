import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import {
  buildAdminAiContentStageRequest,
  buildAiContentStageRequest,
  callAdminLabAiContentStage,
  callAiContentStage,
  getAiContentOpenRouterCapability,
  type AiContentStageCall,
} from './aiContentOpenRouterClient';

const call: AiContentStageCall = {
  stage: 'interpret-request',
  model: 'openai/test-model',
  systemPrompt: 'Return JSON.',
  userPrompt: 'Interpret this.',
  schemaName: 'mofacts_ai_content_intent_v4',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: { ok: { type: 'boolean' } },
  },
  visibleOutputTokens: 321,
  reasoningLevel: 'high',
};

describe('AI Content OpenRouter stage client', function() {
  let callAsync: sinon.SinonStub;

  beforeEach(function() {
    callAsync = sinon.stub(Meteor as any, 'callAsync');
  });

  afterEach(function() {
    callAsync.restore();
  });

  it('builds an explicit no-fallback Admin request with model, reasoning, schema, and budget', function() {
    const request = buildAdminAiContentStageRequest(call);
    expect(request.model).to.equal(call.model);
    expect(request.max_tokens).to.equal(321);
    expect(request.reasoning).to.deep.equal({ effort: 'high' });
    expect(request.provider).to.deep.equal({ require_parameters: true, allow_fallbacks: false });
    expect((request.response_format as any).json_schema.schema).to.equal(call.schema);
    expect(buildAiContentStageRequest(call)).to.deep.equal(request);
  });

  it('preserves the Prompt Lab on its proven Admin Tests transport', async function() {
    callAsync.resolves({
      parsedContent: { ok: true },
      requestWithoutCredentials: { model: call.model },
      rawContent: '{"ok":true}',
      model: call.model,
      reasoningLevel: 'high',
    });
    const result = await callAdminLabAiContentStage(call);
    expect(callAsync.firstCall.args[0]).to.equal('callAdminTestOpenRouterRequest');
    expect(callAsync.firstCall.args[1]).to.deep.equal(buildAdminAiContentStageRequest(call));
    expect(result.parsedContent).to.deep.equal({ ok: true });
  });

  it('routes every AI Content stage through the shared Admin-configured transport', async function() {
    callAsync.resolves({
      parsedContent: { ok: true },
      requestWithoutCredentials: { model: call.model },
      rawContent: '{"ok":true}',
      model: call.model,
      reasoningLevel: 'high',
    });
    const result = await callAiContentStage(call);
    expect(callAsync.firstCall.args[0]).to.equal('callAiContentOpenRouterRequest');
    expect(callAsync.firstCall.args[1].provider.allow_fallbacks).to.equal(false);
    expect(result.parsedContent).to.deep.equal({ ok: true });
    expect(result.reasoningLevel).to.equal('high');
  });

  it('reads the one Admin-configured AI Content capability', async function() {
    callAsync.resolves({ configured: true, source: 'admin', model: ' openai/test-model ', reasoningLevel: 'high' });
    expect(await getAiContentOpenRouterCapability()).to.deep.equal({
      configured: true,
      source: 'admin',
      model: 'openai/test-model',
      reasoningLevel: 'high',
    });
    expect(callAsync.firstCall.args[0]).to.equal('getAiContentOpenRouterCapability');
  });
});
