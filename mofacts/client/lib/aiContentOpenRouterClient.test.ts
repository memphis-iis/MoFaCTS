import { expect } from 'chai';
import sinon from 'sinon';
import { Meteor } from 'meteor/meteor';
import { callOpenRouterForPairRepair, callOpenRouterForPairs } from './aiContentOpenRouterClient';

describe('AI Content OpenRouter pair client', function() {
  let callAsync: sinon.SinonStub;

  beforeEach(function() {
    callAsync = sinon.stub(Meteor as any, 'callAsync');
  });

  afterEach(function() {
    callAsync.restore();
  });

  it('requests one strict pair set and supplies uploaded images as vision content', async function() {
    const pairs = [{ kind: 'image' as const, stimulus: 'image: Scaphoid', response: 'Scaphoid' }];
    callAsync.resolves({ parsedContent: { pairs } });
    expect(await callOpenRouterForPairs('hand bones with images', 'openai/test-model', [{ id: 'asset-1', originalName: 'hand.png', dataUrl: 'data:image/webp;base64,AAAA' }])).to.deep.equal(pairs);
    const payload = callAsync.firstCall.args[1];
    expect(payload.maxTokens).to.equal(12000);
    expect(payload).not.to.have.property('temperature');
    expect(payload.intent.strictSchema).to.equal(true);
    expect(payload.intent.schema.type).to.equal('object');
    expect(payload.intent.schema.properties.pairs.items.additionalProperties).to.equal(false);
    expect(payload.messages[1].content[2]).to.deep.equal({ type: 'image_url', image_url: { url: 'data:image/webp;base64,AAAA' } });
  });

  it('deterministically canonicalizes the redundant image stimulus marker', async function() {
    callAsync.resolves({ parsedContent: { pairs: [{ kind: 'image', stimulus: 'a highlighted carpal bone', response: 'Scaphoid' }] } });
    expect(await callOpenRouterForPairs('hand bones with images', 'openai/test-model')).to.deep.equal([
      { kind: 'image', stimulus: 'image: Scaphoid', response: 'Scaphoid' },
    ]);
  });

  it('sends a single failure-specific repair without changing the schema', async function() {
    callAsync.resolves({ parsedContent: { pairs: [{ kind: 'image', stimulus: 'image: Scaphoid', response: 'Scaphoid' }] } });
    await callOpenRouterForPairRepair('hand bones with images', 'openai/test-model', [], [], ['Missing pairs']);
    const payload = callAsync.firstCall.args[1];
    expect(payload.telemetry.operation).to.equal('pair-repair');
    expect(payload.messages[1].content).to.contain('Missing pairs');
    expect(payload.intent.strictSchema).to.equal(true);
  });

  it('rejects a response without parsed strict content', async function() {
    callAsync.resolves({});
    try {
      await callOpenRouterForPairs('text facts', 'openai/test-model');
      throw new Error('Expected missing parsed content failure');
    } catch (error) {
      expect((error as Error).message).to.equal('The AI provider response must be an object containing pairs.');
    }
  });
});
