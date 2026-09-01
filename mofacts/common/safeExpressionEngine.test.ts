import { expect } from 'chai';
import {
  compileProbabilityExpression,
  interpretProbabilityExpression,
} from '../../learning-components/safe-expression/safeExpressionEngine';
import {
  createProbabilityFunctionHelpers,
  DEFAULT_PROBABILITY_EXPRESSION,
} from '../../learning-components/models/adaptive-logistic/probabilityFunctions';
import { PROBABILITY_FUNCTION_HELPER_NAMES } from '../../learning-components/content/probabilityExpressionContract';
import { createTdfProbabilityFunction } from '../../learning-components/models/adaptive-logistic/tdfProbabilityFunction';
import { validateTdfExpressions } from '../../learning-components/content/tdfExpressionValidation';

function modelInput() {
  return {
    i: 1, clusterIndex: 0, stimIndex: 0,
    userTotalResponses: 7, userCorrectResponses: 5,
    questionSuccessCount: 2, questionFailureCount: 1, questionTotalTests: 3,
    questionStudyTrialCount: 1, questionSecsSinceLastShown: 20,
    questionSecsSinceFirstShown: 100, questionSecsPracticingOthers: 25,
    questionTimeHistory: [0, 10, 30], questionSpacingLagged: [0, 0, 10],
    stimSecsSinceLastShown: 20, stimSecsSinceFirstShown: 100, stimSecsPracticingOthers: 25,
    stimSuccessCount: 2, stimFailureCount: 1, stimTotalTests: 3,
    crowdStimSuccessCount: 4, crowdStimFailureCount: 2, crowdStimTotalTests: 6,
    stimStudyTrialCount: 1, stimTimeHistory: [0, 10, 30], stimSpacingLagged: [0, 0, 10],
    responseSuccessCount: 2, responseFailureCount: 1, responseOutcomeHistory: [1, 0, 1],
    responseSecsSinceLastShown: 20, responseStudyTrialCount: 1, responseTotalTests: 3,
    responseTimeHistory: [0, 10, 30], responseSpacingLagged: [0, 0, 10],
    stimParameters: [-1, 0.9], clusterPreviousCalculatedProbabilities: [0.5],
    clusterOutcomeHistory: [1, 0], stimPreviousCalculatedProbabilities: [0.5],
    stimOutcomeHistory: [1, 0], overallOutcomeHistory: [1, 0, 1], overallStudyHistory: [0, 1],
  };
}

describe('safe probability expression engine', function() {
  const helpers = createProbabilityFunctionHelpers(() => undefined);

  it('supports the complete helper API defined by source rather than only helpers found in current TDFs', function() {
    expect(Object.keys(helpers).sort()).to.deep.equal([...PROBABILITY_FUNCTION_HELPER_NAMES].sort());

    for (const helperName of PROBABILITY_FUNCTION_HELPER_NAMES) {
      const source = `pFunc.${helperName}; p.probability = 0.5; return p`;
      expect(() => compileProbabilityExpression(source), helperName).not.to.throw();
    }
  });

  it('executes the source-defined diagnostic helper through the controlled helper object', function() {
    const messages: unknown[][] = [];
    const diagnosticHelpers = createProbabilityFunctionHelpers((...args: unknown[]) => messages.push(args));
    const source = 'pFunc.testFunction(); p.probability = 0.5; return p';
    const result = interpretProbabilityExpression(compileProbabilityExpression(source), modelInput(), diagnosticHelpers);
    expect(result.probability).to.equal(0.5);
    expect(messages).to.deep.equal([['testing probability function']]);
  });

  it('validates a probability expression when the runtime function is loaded', function() {
    const runtimeFunction = createTdfProbabilityFunction(DEFAULT_PROBABILITY_EXPRESSION);
    expect(runtimeFunction(modelInput(), helpers).probability).to.be.closeTo(0.9679774688292543, 1e-12);
    expect(() => createTdfProbabilityFunction('p.probability = process.env.SECRET; return p'))
      .to.throw('member access .SECRET is not allowed');
  });

  it('executes authored probability formulas without dynamic JavaScript evaluation', function() {
    const originalFunction = globalThis.Function;
    try {
      (globalThis as { Function: FunctionConstructor }).Function = function blockedDynamicFunction(): never {
        throw new Error('dynamic Function construction is blocked');
      } as unknown as FunctionConstructor;
      const runtimeFunction = createTdfProbabilityFunction(DEFAULT_PROBABILITY_EXPRESSION);
      expect(runtimeFunction(modelInput(), helpers).probability).to.be.closeTo(0.9679774688292543, 1e-12);
    } finally {
      (globalThis as { Function: FunctionConstructor }).Function = originalFunction;
    }
  });

  it('matches the standard logistic result and returns only the typed model snapshot plus diagnostics', function() {
    const input = { ...modelInput(), stim: { secret: true }, resp: { secret: true } };
    const result = interpretProbabilityExpression(compileProbabilityExpression(DEFAULT_PROBABILITY_EXPRESSION), input, helpers);
    expect(result.probability).to.be.closeTo(0.9679774688292543, 1e-12);
    expect(result).to.have.property('y');
    expect(result).not.to.have.property('stim');
    expect(result).not.to.have.property('resp');
  });

  it('supports Bridge diagnostics, conditionals, strict equality, array indexing, and literal strings', function() {
    const source = `
      p.CUSTOM_MSG = "Bridge diagnostic";
      p.meanSpacing = 0;
      if (p.questionStudyTrialCount + p.questionTotalTests === 4) {
        p.meanSpacing = Math.max(1, Math.pow(p.questionSecsSinceFirstShown / 3, 0.0294));
      }
      const intercept = p.stimParameters[0];
      p.y = intercept + p.meanSpacing + Math.log(1 + p.stimSuccessCount);
      p.available = true;
      p.probability = 1 / (1 + Math.exp(-p.y));
      return p;
    `;
    const result = interpretProbabilityExpression(compileProbabilityExpression(source), modelInput(), helpers);
    expect(result.CUSTOM_MSG).to.equal('Bridge diagnostic');
    expect(result.available).to.equal(true);
    expect(result.probability).to.be.a('number');
  });

  it('supports EnFyre PPES helper compositions without a deployment-time model registry', function() {
    const source = `
      p.ppes = pFunc.ppesFromTimes(p.stimSuccessCount, p.stimTotalTests, p.stimTimeHistory, 0.6, 0.01, 0.1, 0.2);
      p.recency = pFunc.recency(p.stimSecsSinceLastShown, 0.4);
      p.y = -1 + p.ppes + p.recency;
      p.probability = 1 / (1 + Math.exp(-p.y));
      return p;
    `;
    const result = interpretProbabilityExpression(compileProbabilityExpression(source), modelInput(), helpers);
    expect(result.ppes).to.be.a('number');
    expect(result.probability).to.be.within(0, 1);
  });

  it('supports the fitted flashcard model without JavaScript callbacks', function() {
    const source = `
      p.y = -0.4448196 +
        0.7304212 * pFunc.logitdec(
          p.overallOutcomeHistory.slice(
            Math.max(p.overallOutcomeHistory.length - 60, 0),
            p.overallOutcomeHistory.length
          ),
          0.9489045
        ) +
        0.5195620 * Math.log(1 + p.stimSuccessCount) +
        2.1722273 * pFunc.recency(p.stimSecsSinceLastShown, 0.2978028);
      const recentOutcomeSum = pFunc.arrSum(
        p.overallOutcomeHistory.slice(
          Math.max(p.overallOutcomeHistory.length - 60, 0),
          p.overallOutcomeHistory.length
        )
      );
      const recentOutcomeCount = Math.min(p.overallOutcomeHistory.length, 60);
      const average = recentOutcomeCount === 0 ? 0 : recentOutcomeSum / recentOutcomeCount;
      p.probability = 1 / (1 + Math.exp(-p.y));
      if (
        p.overallStudyHistory &&
        p.overallStudyHistory.length % 4 !== 0 &&
        average > p.stimParameters[1] &&
        p.probability > p.stimParameters[1]
      ) {
        p.probability = 1 / (
          1 + Math.exp(-(Math.log(p.probability / (1 - p.probability)) + 20))
        );
      }
      return p;
    `;
    const input = modelInput();
    const result = interpretProbabilityExpression(compileProbabilityExpression(source), input, helpers);
    const recentOutcomes = input.overallOutcomeHistory.slice(-60);
    const recentAverage = helpers.arrSum(recentOutcomes) / recentOutcomes.length;
    const masteryThreshold = input.stimParameters[1];
    if (masteryThreshold === undefined) throw new Error('fitted flashcard fixture requires a mastery threshold');
    const expectedY = -0.4448196
      + 0.7304212 * helpers.logitdec(recentOutcomes, 0.9489045)
      + 0.5195620 * Math.log(1 + input.stimSuccessCount)
      + 2.1722273 * helpers.recency(input.stimSecsSinceLastShown, 0.2978028);
    let expectedProbability = 1 / (1 + Math.exp(-expectedY));
    if (
      input.overallStudyHistory.length % 4 !== 0
      && recentAverage > masteryThreshold
      && expectedProbability > masteryThreshold
    ) {
      expectedProbability = 1 / (
        1 + Math.exp(-(Math.log(expectedProbability / (1 - expectedProbability)) + 20))
      );
    }

    expect(result.y).to.be.closeTo(expectedY, 1e-12);
    expect(result.probability).to.be.closeTo(expectedProbability, 1e-12);

    const initialResult = interpretProbabilityExpression(
      compileProbabilityExpression(source),
      { ...modelInput(), overallOutcomeHistory: [], overallStudyHistory: [] },
      helpers,
    );
    expect(initialResult.probability).to.be.a('number').and.within(0, 1);
  });

  it('rejects array-valued locals during readiness validation rather than only at runtime', function() {
    expect(() => compileProbabilityExpression(`
      const recentOutcomes = p.overallOutcomeHistory.slice(0, 10);
      p.probability = pFunc.arrSum(recentOutcomes) / recentOutcomes.length;
      return p;
    `)).to.throw('locals must be finite numbers');
  });

  for (const [name, source] of Object.entries({
    global: 'p.probability = process.env.SECRET; return p',
    network: 'p.probability = fetch("https://example.test"); return p',
    constructor: 'p.probability = p.overallOutcomeHistory.constructor("return 1")(); return p',
    computedEscape: 'p.probability = p["constructor"]; return p',
    functionDeclaration: 'function f(){ return 1 } p.probability = f(); return p',
    callback: 'p.probability = p.overallOutcomeHistory.map(x => x)[0]; return p',
    loop: 'while(true){} p.probability = 1; return p',
    randomness: 'p.probability = Math.random(); return p',
    inputMutation: 'p.stimSuccessCount = 9; p.probability = 1; return p',
  })) {
    it(`rejects ${name}`, function() {
      expect(() => compileProbabilityExpression(source)).to.throw();
    });
  }

  it('rejects non-finite and out-of-range results at evaluation', function() {
    expect(() => interpretProbabilityExpression(
      compileProbabilityExpression('p.probability = 2; return p'), modelInput(), helpers,
    )).to.throw('within [0,1]');
    expect(() => interpretProbabilityExpression(
      compileProbabilityExpression('p.probability = 1 / 0; return p'), modelInput(), helpers,
    )).to.throw('non-finite');
  });

  it('validates unit and unit-template expressions without changing their bytes', function() {
    const source = DEFAULT_PROBABILITY_EXPRESSION;
    const content = { tdfs: { tutor: { unit: [{ learningsession: { calculateProbability: source } }],
      setspec: { unitTemplate: [{ adaptiveLogic: ['IF C2S0 THEN C3S0'] }] } } } };
    const result = validateTdfExpressions(content);
    expect(result).to.include({ valid: true, expressionCount: 2, probabilityExpressionCount: 1, adaptiveRuleCount: 1 });
    expect((content.tdfs.tutor.unit[0] as any).learningsession.calculateProbability).to.equal(source);
  });
});
