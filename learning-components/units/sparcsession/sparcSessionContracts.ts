import type { CanonicalHistoryRecord } from '../../runtime/historyEnvelope';
import type { ModelPracticeUpdateRequest } from '../../runtime/modelPracticeUpdates';
import type { ModelPracticeMetric } from '../../runtime/modelPracticeStateQueries';
import type {
  ModelPracticeHistoryIdentity,
} from '../../runtime/historyStimulusIdentity';

export type SparcDocumentAddress = {
  readonly documentId: string;
  readonly nodeId: string;
};

export type SparcModelMetric = ModelPracticeMetric;

export type SparcAddressReference = {
  readonly target: SparcDocumentAddress;
  readonly relation?:
    | 'contains'
    | 'controls'
    | 'depends-on'
    | 'feedback-for'
    | 'model-target'
    | 'navigates-to';
  readonly stateKey?: string;
  readonly modelMetric?: SparcModelMetric;
};

export type SparcNodeKind =
  | 'document'
  | 'section'
  | 'panel'
  | 'module'
  | 'widget'
  | 'input'
  | 'output'
  | 'feedback'
  | 'hint'
  | 'expression';

export type SparcScrollAxis = 'none' | 'vertical';

export type SparcWideContentPolicy =
  | 'constrain'
  | 'reflow'
  | 'shrink'
  | 'stack';

export type SparcLayoutMode =
  | 'document'
  | 'stack'
  | 'columns'
  | 'sidebar'
  | 'tabs';

export type SparcVisualPreset =
  | 'assignment'
  | 'chapter'
  | 'section'
  | 'practice-panel'
  | 'feedback-panel'
  | 'callout'
  | 'control-panel';

export type SparcVisualDensity =
  | 'compact'
  | 'comfortable'
  | 'spacious';

export type SparcLayoutPolicy = {
  readonly scrollAxis?: SparcScrollAxis;
  readonly layoutMode?: SparcLayoutMode;
  readonly visualPreset?: SparcVisualPreset;
  readonly density?: SparcVisualDensity;
  readonly width?: number | string;
  readonly minWidth?: number | string;
  readonly maxWidth?: number | string;
  readonly wideContent?: SparcWideContentPolicy;
  readonly overflowX?: 'clip' | 'hidden' | 'visible';
};

export type SparcNodeReactivity = {
  readonly visibleWhen?: SparcCondition;
  readonly enabledWhen?: SparcCondition;
};

export type SparcAuthoredNode = {
  readonly id: string;
  readonly kind: SparcNodeKind;
  readonly children?: readonly SparcAuthoredNode[];
  readonly refs?: readonly SparcAddressReference[];
  readonly stimulusIds?: readonly string[];
  readonly modelTarget?: SparcModelTargetIdentity;
  readonly layout?: SparcLayoutPolicy;
  readonly reactive?: SparcNodeReactivity;
};

export type SparcStimulusRegistryEntry = ModelPracticeHistoryIdentity & {
  readonly stimulusId: string;
  readonly label?: string;
};

export type SparcAuthoredDocument = {
  readonly id: string;
  readonly schemaVersion: number;
  readonly layout?: SparcLayoutPolicy;
  readonly stimulusRegistry?: readonly SparcStimulusRegistryEntry[];
  readonly initialState?: readonly SparcStateWrite[];
  readonly workingMemoryFacts?: readonly SparcWorkingMemoryFact[];
  readonly productionRules?: readonly SparcProductionRule[];
  readonly reactiveRules?: readonly SparcReactiveRule[];
  readonly root: SparcAuthoredNode;
};

export type SparcOutcome = 'correct' | 'incorrect' | 'partial' | 'study' | 'skipped' | 'unknown';

export type SparcPracticeObservation = {
  readonly observationId: string;
  readonly sourceAddress: SparcDocumentAddress;
  readonly modelTarget?: SparcModelTargetIdentity;
  readonly time: number;
  readonly problemStartTime: number;
  readonly practiceDurationMs?: number;
  readonly outcome: SparcOutcome;
  readonly responseValue: unknown;
  readonly input?: unknown;
  readonly displayedStimulus?: unknown;
  readonly context?: Record<string, unknown>;
};

export type SparcModelPracticeObservation = SparcPracticeObservation & {
  readonly modelTarget: SparcModelTargetIdentity;
};

export type SparcModelUpdateRequest = ModelPracticeUpdateRequest<SparcModelTargetIdentity> & {
  readonly outcome: SparcOutcome;
  readonly sourceAddress: SparcDocumentAddress;
};

export type SparcModelTargetIdentity = ModelPracticeHistoryIdentity & {
  readonly sparcDocumentId: string;
  readonly sparcNodeId: string;
};

export type SparcModelQuery = {
  readonly target: SparcModelTargetIdentity;
  readonly metric: SparcModelMetric;
};

export type SparcStateQuery = {
  readonly target: SparcDocumentAddress;
  readonly key: string;
};

export type SparcConditionComparison =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'truthy'
  | 'falsy';

export type SparcCondition =
  | {
      readonly type: 'state';
      readonly query: SparcStateQuery;
      readonly compare: SparcConditionComparison;
      readonly value?: unknown;
    }
  | {
      readonly type: 'model';
      readonly query: SparcModelQuery;
      readonly compare: SparcConditionComparison;
      readonly value?: unknown;
    }
  | {
      readonly type: 'all' | 'any';
      readonly conditions: readonly SparcCondition[];
    }
  | {
      readonly type: 'not';
      readonly condition: SparcCondition;
    };

export type SparcReactiveEventType =
  | 'document-loaded'
  | 'node-mounted'
  | 'focus-changed'
  | 'value-changed'
  | 'response-submitted'
  | 'outcome-recorded'
  | 'model-updated'
  | 'condition-evaluated'
  | 'trace-step-recorded';

export type SparcReactiveEvent = {
  readonly eventId: string;
  readonly type: SparcReactiveEventType;
  readonly source: SparcDocumentAddress;
  readonly time: number;
  readonly payload?: Record<string, unknown>;
  readonly practiceObservation?: SparcPracticeObservation;
};

export type SparcStateTransition = {
  readonly transitionId: string;
  readonly event: SparcReactiveEvent;
  readonly writes: readonly SparcStateWrite[];
};

export type SparcStateWrite = {
  readonly target: SparcDocumentAddress;
  readonly key: string;
  readonly value: unknown;
};

export type SparcWorkingMemoryFact = {
  readonly factId?: string;
  readonly factType: string;
  readonly slots?: Readonly<Record<string, unknown>>;
};

export type SparcRuleExpression =
  | {
      readonly type: 'literal';
      readonly value: unknown;
    }
  | {
      readonly type: 'variable';
      readonly name: string;
    }
  | {
      readonly type: 'function';
      readonly name: 'add' | 'subtract' | 'multiply' | 'divide' | 'mod' | 'gcd' | 'lcm';
      readonly args: readonly SparcRuleExpression[];
    };

export type SparcFactSlotPattern =
  | {
      readonly type: 'literal';
      readonly value: unknown;
    }
  | {
      readonly type: 'bind';
      readonly variable: string;
    }
  | {
      readonly type: 'bound';
      readonly variable: string;
    };

export type SparcFactPattern = {
  readonly factType: string;
  readonly slots?: Readonly<Record<string, SparcFactSlotPattern>>;
};

export type SparcProductionRuleCondition =
  | SparcFactPattern
  | {
      readonly type: 'not';
      readonly pattern: SparcFactPattern;
    };

export type SparcProductionRuleTest = {
  readonly op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  readonly left: SparcRuleExpression;
  readonly right: SparcRuleExpression;
};

export type SparcProductionRuleEffect =
  | {
      readonly type: 'assert-fact';
      readonly fact: SparcWorkingMemoryFactTemplate;
      readonly persist?: boolean;
    }
  | {
      readonly type: 'write-state';
      readonly write: SparcStateWriteTemplate;
    }
  | {
      readonly type: 'message';
      readonly messageType: 'hint' | 'buggy' | 'success' | 'feedback';
      readonly template: string;
      readonly target?: SparcStateWriteAddressTemplate;
    }
  | {
      readonly type: 'classify';
      readonly outcome: SparcOutcome | 'buggy';
    }
  | {
      readonly type: 'credit';
      readonly kc: string;
    }
  | {
      readonly type: 'model-practice';
      readonly outcome: SparcOutcome;
      readonly stimulusId?: string | SparcRuleExpression;
      readonly nodeId?: string | SparcRuleExpression;
      readonly responseValue?: SparcRuleExpression;
      readonly input?: SparcRuleExpression;
    }
  | SparcProgressiveNodeOperationTemplate;

export type SparcWorkingMemoryFactTemplate = {
  readonly factId?: string;
  readonly factType: string;
  readonly slots?: Readonly<Record<string, SparcRuleExpression>>;
};

export type SparcStateWriteAddressTemplate = {
  readonly documentId: string | SparcRuleExpression;
  readonly nodeId: string | SparcRuleExpression;
};

export type SparcStateWriteTemplate = {
  readonly target: SparcStateWriteAddressTemplate;
  readonly key: string;
  readonly value: SparcRuleExpression;
};

export type SparcProgressiveNodeTemplate = Readonly<Record<string, unknown>>;

export type SparcProgressiveNodeOperationTemplate =
  | {
      readonly type: 'append-node';
      readonly frontier?: string | SparcRuleExpression;
      readonly boxId: string | SparcRuleExpression;
      readonly node: SparcProgressiveNodeTemplate;
    }
  | {
      readonly type: 'append-node-if-missing';
      readonly frontier?: string | SparcRuleExpression;
      readonly boxId: string | SparcRuleExpression;
      readonly beforeNodeId?: string | SparcRuleExpression;
      readonly afterNodeId?: string | SparcRuleExpression;
      readonly node: SparcProgressiveNodeTemplate;
    }
  | {
      readonly type: 'insert-node';
      readonly boxId?: string | SparcRuleExpression;
      readonly beforeNodeId?: string | SparcRuleExpression;
      readonly afterNodeId?: string | SparcRuleExpression;
      readonly node: SparcProgressiveNodeTemplate;
    }
  | {
      readonly type: 'append-text';
      readonly nodeId: string | SparcRuleExpression;
      readonly text: string | SparcRuleExpression;
      readonly separator?: string | SparcRuleExpression;
    };

export type SparcProductionRule = {
  readonly id: string;
  readonly module?: string;
  readonly salience?: number;
  readonly when: readonly SparcProductionRuleCondition[];
  readonly tests?: readonly SparcProductionRuleTest[];
  readonly then: readonly SparcProductionRuleEffect[];
};

export type SparcProductionRuleFiring = {
  readonly ruleId: string;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly assertedFacts: readonly SparcWorkingMemoryFact[];
  readonly persistentAssertedFacts: readonly SparcWorkingMemoryFact[];
  readonly writes: readonly SparcStateWrite[];
  readonly messages: readonly {
    readonly messageType: 'hint' | 'buggy' | 'success' | 'feedback';
    readonly text: string;
    readonly target?: SparcDocumentAddress;
  }[];
  readonly modelPracticeObservations: readonly {
    readonly outcome: SparcOutcome;
    readonly stimulusId?: string;
    readonly nodeId?: string;
    readonly responseValue?: unknown;
    readonly input?: unknown;
  }[];
  readonly classifications: readonly (SparcOutcome | 'buggy')[];
  readonly credits: readonly string[];
};

export type SparcProductionRuleExecution = {
  readonly facts: readonly SparcWorkingMemoryFact[];
  readonly firings: readonly SparcProductionRuleFiring[];
  readonly cycles: number;
};

export type SparcReactiveRule = {
  readonly id: string;
  readonly when?: SparcCondition;
  readonly writes: readonly SparcStateWrite[];
};

export type SparcTraceStep = {
  readonly traceId: string;
  readonly sourceAddress: SparcDocumentAddress;
  readonly productionRuleId: string;
  readonly actionId: string;
  readonly outcome: SparcOutcome;
  readonly time: number;
  readonly details?: Record<string, unknown>;
};

export type SparcCanonicalHistoryExtension = {
  readonly documentId: string;
  readonly sourceAddress: SparcDocumentAddress;
  readonly practiceObservation?: SparcPracticeObservation;
  readonly stateTransition?: SparcStateTransition;
  readonly traceStep?: SparcTraceStep;
};

export type SparcCanonicalHistoryRecord = CanonicalHistoryRecord & Partial<ModelPracticeHistoryIdentity> & {
  readonly eventType: 'sparc';
  readonly TDFId: string;
  readonly sessionID: string;
  readonly levelUnit: number;
  readonly levelUnitType: string;
  readonly time: number;
  readonly problemStartTime: number;
  readonly selection: string;
  readonly action: string;
  readonly outcome: string;
  readonly typeOfResponse: string;
  readonly responseValue: unknown;
  readonly input: unknown;
  readonly displayedStimulus: unknown;
  readonly sparc: SparcCanonicalHistoryExtension;
};

export type SparcPracticeHistoryBridge = {
  readonly toCanonicalHistoryRecord: (
    observation: SparcPracticeObservation,
  ) => SparcCanonicalHistoryRecord;
  readonly fromCanonicalHistoryRecord: (
    record: CanonicalHistoryRecord,
  ) => SparcPracticeObservation | null;
};
