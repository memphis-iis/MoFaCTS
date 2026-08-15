import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import {
  buildAdminAiContentStageRequest,
  callAdminLabAiContentStage,
  callProductionAiContentStage,
  type AiContentStageCall,
} from './aiContentOpenRouterClient';

const call: AiContentStageCall = {
  stage: 'interpret-request',
  model: 'openai/test-model',
  systemPrompt: 'Return JSON.',
  userPrompt: 'Interpret this.',
  schemaName: 'intent',
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
  });

  it('routes Lab calls through the authorized Admin transport', async function() {
    callAsync.resolves({
      parsedContent: { ok: true },
      requestWithoutCredentials: { model: call.model },
      rawContent: '{"ok":true}',
      model: call.model,
      reasoningLevel: 'high',
    });
    const result = await callAdminLabAiContentStage(call);
    expect(callAsync.firstCall.args[0]).to.equal('callAdminTestOpenRouterRequest');
    expect(callAsync.firstCall.args[1].provider.allow_fallbacks).to.equal(false);
    expect(result.parsedContent).to.deep.equal({ ok: true });
    expect(result.reasoningLevel).to.equal('high');
  });

  it('routes production calls with explicit no-fallback provider settings', async function() {
    callAsync.resolves({ parsedContent: { ok: true }, model: call.model, reasoningLevel: 'high' });
    await callProductionAiContentStage(call);
    const payload = callAsync.firstCall.args[1];
    expect(callAsync.firstCall.args[0]).to.equal('callResolvedOpenRouterJson');
    expect(payload.provider).to.deep.equal({ require_parameters: true, allow_fallbacks: false });
    expect(payload.reasoningLevel).to.equal('high');
    expect(payload.telemetry.operation).to.equal('interpret-request');
  });
});
