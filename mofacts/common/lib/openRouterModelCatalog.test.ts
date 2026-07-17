import { expect } from 'chai';
import {
  OPENROUTER_REASONING_LEVELS,
  expandOpenRouterCompletionBudget,
  getAllowedOpenRouterReasoningLevels,
  getDefaultOpenRouterReasoningLevel,
  normalizeOpenRouterReasoningLevel,
  parseOpenRouterModelCatalog,
  validateOpenRouterReasoningLevelForModel,
  type OpenRouterModelCatalogEntry,
} from './openRouterModelCatalog';

function model(
  reasoning: OpenRouterModelCatalogEntry['reasoning'],
): OpenRouterModelCatalogEntry {
  return { id: 'openai/example', name: 'Example', reasoning };
}

describe('openRouterModelCatalog', function() {
  it('defines the canonical persisted reasoning levels', function() {
    expect(OPENROUTER_REASONING_LEVELS).to.deep.equal([
      'none',
      'default',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
  });

  it('defaults only absent reasoning values to none and rejects supplied invalid values', function() {
    expect(normalizeOpenRouterReasoningLevel(undefined)).to.equal('none');
    expect(normalizeOpenRouterReasoningLevel(null)).to.equal('none');
    expect(normalizeOpenRouterReasoningLevel('high')).to.equal('high');
    expect(() => normalizeOpenRouterReasoningLevel('')).to.throw('must be one of');
    expect(() => normalizeOpenRouterReasoningLevel('HIGH')).to.throw('must be one of');
  });

  it('allows only none for a non-reasoning model', function() {
    const entry = model(null);
    expect(getAllowedOpenRouterReasoningLevels(entry)).to.deep.equal(['none']);
    expect(getDefaultOpenRouterReasoningLevel(entry)).to.equal('none');
  });

  it('keeps reasoning off by default for an optional reasoning model', function() {
    const entry = model({
      mandatory: false,
      supportedLevels: ['high', 'medium', 'low', 'none'],
      defaultLevel: 'medium',
    });
    expect(getAllowedOpenRouterReasoningLevels(entry)).to.deep.equal([
      'none',
      'default',
      'low',
      'medium',
      'high',
    ]);
    expect(getDefaultOpenRouterReasoningLevel(entry)).to.equal('none');
  });

  it('removes none and honors the provider default for mandatory reasoning', function() {
    const entry = model({
      mandatory: true,
      supportedLevels: ['high', 'medium', 'low'],
      defaultLevel: 'high',
    });
    expect(getAllowedOpenRouterReasoningLevels(entry)).to.deep.equal([
      'default',
      'low',
      'medium',
      'high',
    ]);
    expect(getDefaultOpenRouterReasoningLevel(entry)).to.equal('high');
    expect(() => validateOpenRouterReasoningLevelForModel('none', entry)).to.throw(
      'is not supported by model',
    );
    expect(validateOpenRouterReasoningLevelForModel('low', entry)).to.equal('low');
  });

  it('represents null and omitted supported efforts without conflating them', function() {
    const allEfforts = model({
      mandatory: true,
      supportedLevels: null,
      defaultLevel: null,
    });
    expect(getAllowedOpenRouterReasoningLevels(allEfforts)).to.deep.equal([
      'default',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);

    const noEffortSelector = model({ mandatory: true, defaultLevel: null });
    expect(getAllowedOpenRouterReasoningLevels(noEffortSelector)).to.deep.equal(['default']);
    expect(getDefaultOpenRouterReasoningLevel(noEffortSelector)).to.equal('default');
  });

  it('expands completion budgets to preserve the visible-output allowance', function() {
    expect(expandOpenRouterCompletionBudget(700, 'none')).to.equal(700);
    expect(expandOpenRouterCompletionBudget(700, 'default')).to.equal(1400);
    expect(expandOpenRouterCompletionBudget(700, 'minimal')).to.equal(778);
    expect(expandOpenRouterCompletionBudget(700, 'low')).to.equal(875);
    expect(expandOpenRouterCompletionBudget(700, 'medium')).to.equal(1400);
    expect(expandOpenRouterCompletionBudget(700, 'high')).to.equal(3500);
    expect(expandOpenRouterCompletionBudget(700, 'xhigh')).to.equal(14000);
    expect(expandOpenRouterCompletionBudget(700, 'max')).to.equal(14000);
  });

  it('rejects invalid visible-output budgets', function() {
    expect(() => expandOpenRouterCompletionBudget(0, 'none')).to.throw('positive finite number');
    expect(() => expandOpenRouterCompletionBudget(Number.POSITIVE_INFINITY, 'low')).to.throw(
      'positive finite number',
    );
  });

  it('strictly parses a sanitized catalog', function() {
    expect(parseOpenRouterModelCatalog([
      {
        id: 'openai/example',
        name: 'Example',
        reasoning: {
          mandatory: false,
          supportedLevels: ['high', 'none'],
          defaultLevel: 'high',
        },
      },
      { id: 'vendor/basic', name: 'Basic', reasoning: null },
    ])).to.deep.equal([
      {
        id: 'openai/example',
        name: 'Example',
        reasoning: {
          mandatory: false,
          supportedLevels: ['high', 'none'],
          defaultLevel: 'high',
        },
      },
      { id: 'vendor/basic', name: 'Basic', reasoning: null },
    ]);
  });

  it('rejects malformed sanitized catalogs and duplicate model ids', function() {
    expect(() => parseOpenRouterModelCatalog([])).to.throw('non-empty array');
    expect(() => parseOpenRouterModelCatalog([
      { id: 'vendor/model', name: 'Model', reasoning: null },
      { id: 'vendor/model', name: 'Duplicate', reasoning: null },
    ])).to.throw('duplicate id');
    expect(() => parseOpenRouterModelCatalog([
      {
        id: 'vendor/model',
        name: 'Model',
        reasoning: { mandatory: false, supportedLevels: ['unknown'], defaultLevel: null },
      },
    ])).to.throw('must be one of');
    expect(() => parseOpenRouterModelCatalog([
      {
        id: 'vendor/model',
        name: 'Model',
        reasoning: { mandatory: false, supportedLevels: [null], defaultLevel: null },
      },
    ])).to.throw('must be one of');
    expect(() => parseOpenRouterModelCatalog([
      {
        id: 'vendor/model',
        name: 'Model',
        reasoning: { mandatory: true, supportedLevels: ['high'], defaultLevel: 'none' },
      },
    ])).to.throw('cannot be none when reasoning is mandatory');
    expect(() => parseOpenRouterModelCatalog([
      {
        id: 'vendor/model',
        name: 'Model',
        reasoning: { mandatory: false, supportedLevels: ['low'], defaultLevel: 'high' },
      },
    ])).to.throw('must be included in supportedLevels');
  });
});
