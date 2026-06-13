import { expect } from 'chai';
import { findCueLeaks, forbiddenAnswerTerms } from './aiContentCueValidation';
import type { AiLessonOutput } from './aiContentTypes';

describe('aiContentCueValidation', function() {
  it('flags whole answer words in learner-visible prompt text', function() {
    const output: AiLessonOutput = {
      items: [{
        prompt: { text: 'A bright blue jay with a crest and bold wings.' },
        response: { correctResponse: 'Blue Jay' },
      }],
    };

    const leaks = findCueLeaks(output);

    expect(leaks).to.have.length(1);
    expect(leaks[0]?.forbiddenTerms).to.deep.equal(['blue', 'jay']);
  });

  it('flags partial answer-word leakage without requiring the full answer phrase', function() {
    const output: AiLessonOutput = {
      items: [{
        prompt: { text: 'A bright yellow songbird found near wet thickets.' },
        response: { correctResponse: 'Yellow Warbler' },
      }],
    };

    const leaks = findCueLeaks(output);

    expect(leaks).to.have.length(1);
    expect(leaks[0]?.forbiddenTerms).to.deep.equal(['yellow']);
  });

  it('matches only whole normalized tokens so CO2 does not leak numeric answer 2', function() {
    const output: AiLessonOutput = {
      items: [{
        prompt: { text: 'How many CO2 molecules are released per turn of the cycle?' },
        response: { correctResponse: '2' },
      }],
    };

    expect(findCueLeaks(output)).to.deep.equal([]);
  });

  it('supports explicit allowed terms as an escape hatch', function() {
    expect(forbiddenAnswerTerms('Red-bellied Woodpecker', { allowedTerms: ['red'] }))
      .to.deep.equal(['bellied', 'woodpecker']);
  });

  it('does not treat one weak technical token from a longer answer as a cue leak', function() {
    const output: AiLessonOutput = {
      items: [
        {
          prompt: { text: 'Which method switches a neural network module into inference behavior?' },
          response: { correctResponse: 'model.eval()' },
        },
        {
          prompt: { text: 'Which PyTorch operation sequence clears gradients, computes a prediction and loss, backpropagates, and updates parameters?' },
          response: { correctResponse: 'zero_grad -> forward/loss -> backward -> step' },
        },
        {
          prompt: { text: 'What rule prevents reusing the same graph after a gradient pass?' },
          response: { correctResponse: 'Do not reuse the same computation graph; recompute forward each iteration, or use retain_graph=True only if needed.' },
        },
      ],
    };

    expect(findCueLeaks(output)).to.deep.equal([]);
  });

  it('does not treat one domain term from code-like or procedural answers as a cue leak', function() {
    const output: AiLessonOutput = {
      items: [
        {
          prompt: { text: 'Which method moves data to the configured device?' },
          response: { correctResponse: 'tensor.to(device) (or tensor.cuda())' },
        },
        {
          prompt: { text: 'Which copy operation changes how gradient tracking behaves?' },
          response: { correctResponse: 'clone() copies data; detach() breaks gradient tracking (clone keeps graph if used that way)' },
        },
        {
          prompt: { text: 'Which operation combines rows and columns and also handles batched inputs?' },
          response: { correctResponse: 'matrix multiplication (supports batched matmul)' },
        },
        {
          prompt: { text: 'Which constructor converts an array-like input into the framework object?' },
          response: { correctResponse: 'torch.tensor(list_or_array)' },
        },
        {
          prompt: { text: 'Which expression creates a mask by comparison against zero?' },
          response: { correctResponse: 'x > 0 (or other comparison operators like ==, <)' },
        },
        {
          prompt: { text: 'Which operation reduces a tensor along selected axes?' },
          response: { correctResponse: 'reduce a tensor by summing along given dimension(s)' },
        },
        {
          prompt: { text: 'Which one-dimensional shape represents samples only?' },
          response: { correctResponse: '(n_samples,)' },
        },
        {
          prompt: { text: 'Which target shape can be a scalar or broadcastable singleton?' },
          response: { correctResponse: 'a scalar (shape []) or (1,) that broadcasts to predictions' },
        },
      ],
    };

    expect(findCueLeaks(output)).to.deep.equal([]);
  });

  it('still flags weak technical terms when they are the whole answer', function() {
    const output: AiLessonOutput = {
      items: [{
        prompt: { text: 'What structure tracks tensor operations for automatic differentiation?' },
        response: { correctResponse: 'graph' },
      }],
    };

    const leaks = findCueLeaks(output);

    expect(leaks).to.have.length(1);
    expect(leaks[0]?.forbiddenTerms).to.deep.equal(['graph']);
  });

  it('does not treat generic words from longer nontechnical answers as cue leaks', function() {
    const output: AiLessonOutput = {
      items: [
        {
          prompt: { text: 'What term names the process where plants use sunlight to make sugar?' },
          response: { correctResponse: 'photosynthesis process' },
        },
        {
          prompt: { text: 'Which answer describes a learner comparing two ideas and naming how they differ?' },
          response: { correctResponse: 'compare different concepts' },
        },
      ],
    };

    expect(findCueLeaks(output)).to.deep.equal([]);
  });

  it('still flags an exact multi-word answer phrase even when it contains weak terms', function() {
    const output: AiLessonOutput = {
      items: [{
        prompt: { text: 'The answer is computation graph, the structure used for automatic differentiation.' },
        response: { correctResponse: 'computation graph' },
      }],
    };

    const leaks = findCueLeaks(output);

    expect(leaks).to.have.length(1);
    expect(leaks[0]?.forbiddenTerms).to.deep.equal(['computation', 'graph']);
  });

  it('does not match answer phrases inside larger prompt tokens', function() {
    const output: AiLessonOutput = {
      items: [{
        prompt: { text: 'A cart can carry supplies.' },
        response: { correctResponse: 'art' },
      }],
    };

    expect(findCueLeaks(output)).to.deep.equal([]);
  });
});
