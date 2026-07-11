import {
  buildAdaptiveOutcomes,
  evaluateAdaptiveRule,
  getAdaptiveScheduleQuestions,
  type AdaptiveOutcomeRow,
  type AdaptiveOutcomes,
  type AdaptiveStimulusClusterRef,
} from './adaptiveRuleEvaluation';
import { applyAdaptiveAssessmentTemplateSchedule } from '../assessment-session/adaptiveAssessmentSchedule';
import {
  appendAdaptiveVideoCheckpoints,
  appendAdaptiveVideoQuestions,
  applyAdaptiveVideoTemplateSchedule,
  requireAdaptiveVideoSession,
} from '../video-session/adaptiveVideoQuestions';

export interface AdaptiveUnitCoordinatorDeps {
  readonly loadOutcomeRows: () => Promise<AdaptiveOutcomeRow[]>;
  readonly getCurrentStimuliSet: () => AdaptiveStimulusClusterRef[] | null | undefined;
  readonly kcMultiple: number;
  readonly reportUnitBuildFailure: (message: string) => void;
  readonly log: (level: number, ...args: unknown[]) => void;
}

type AdaptiveRuleResult = ReturnType<typeof evaluateAdaptiveRule>;

export class AdaptiveUnitCoordinator {
  readonly curUnit: any;
  readonly when: unknown;
  private readonly deps: AdaptiveUnitCoordinatorDeps;
  private readonly schedule: any[] = [];

  constructor(curUnit: any, deps: AdaptiveUnitCoordinatorDeps) {
    this.curUnit = curUnit || null;
    this.when = curUnit?.adaptive;
    this.deps = deps;
  }

  async getAdaptiveOutcomes(): Promise<AdaptiveOutcomes> {
    return buildAdaptiveOutcomes({
      rows: await this.deps.loadOutcomeRows(),
      currentStimuliSet: this.deps.getCurrentStimuliSet(),
      kcMultiple: this.deps.kcMultiple,
    });
  }

  async evaluate(logicString: string, adaptiveOutcomes?: AdaptiveOutcomes): Promise<AdaptiveRuleResult | undefined> {
    this.deps.log(2, 'evaluate adaptive logic:', logicString);
    const result = evaluateAdaptiveRule(logicString, adaptiveOutcomes || await this.getAdaptiveOutcomes());
    if (result.conditionResult && result.actions) {
      this.schedule.push(...(result.schedule || []));
    }
    if (!result.conditionResult && !result.conditionExpression) {
      return result;
    }
    return result.conditionResult ? result : undefined;
  }

  async modifyUnit(adaptiveLogic: string[], curTdfUnit: any, adaptiveOutcomes?: AdaptiveOutcomes) {
    const videoSession = requireAdaptiveVideoSession(curTdfUnit);
    if (!Array.isArray(adaptiveLogic)) {
      throw new Error(`Adaptive modifyUnit rules must be an array for unit "${curTdfUnit.unitname || ''}"`);
    }

    const allCheckpoints: any[] = [];
    const outcomes = adaptiveOutcomes || await this.getAdaptiveOutcomes();
    for (const logic of adaptiveLogic) {
      const result = await this.evaluate(logic, outcomes);
      if (!result?.conditionResult) continue;
      const questions = result.questions?.length
        ? result.questions
        : getAdaptiveScheduleQuestions(result.schedule || []);
      appendAdaptiveVideoQuestions(videoSession, questions, result.when, logic);
      if (result.checkpoints?.length) {
        allCheckpoints.push(...result.checkpoints);
      }
    }
    appendAdaptiveVideoCheckpoints(videoSession, allCheckpoints);
    return curTdfUnit;
  }

  buildUnit(newUnit: any, adaptiveQuestionTimes: any[], adaptiveQuestions: any[], adaptiveCheckpoints: any[]) {
    if (!newUnit) {
      const message = 'Unit template not found';
      this.deps.reportUnitBuildFailure(message);
      throw new Error(message);
    }
    const assessmentScheduleApplied = applyAdaptiveAssessmentTemplateSchedule({
      unit: newUnit,
      schedule: this.schedule,
    });
    if (!assessmentScheduleApplied) {
      applyAdaptiveVideoTemplateSchedule({
        unit: newUnit,
        schedule: this.schedule,
        adaptiveQuestionTimes,
        adaptiveQuestions,
        adaptiveCheckpoints,
      });
    }
    return newUnit;
  }

  async applyUnitTransitions(tdfFile: any, currentUnitNumber: number) {
    const tutor = tdfFile?.tdfs?.tutor;
    const currentUnit = tutor?.unit?.[currentUnitNumber];
    const adaptive = currentUnit?.adaptive;
    if (!adaptive || !this.curUnit?.adaptiveLogic) {
      return { tdfFile, countCompletion: currentUnit?.countcompletion };
    }

    const adaptiveLogic = currentUnit.adaptiveLogic as Record<string, string[]>;
    const adaptiveOutcomes = await this.getAdaptiveOutcomes();
    let countCompletion = currentUnit.countcompletion;
    for (const adaptiveUnitIndex of Object.keys(adaptive)) {
      const adaptiveEntry = String(adaptive[adaptiveUnitIndex]);
      const newUnitIndex = Number(adaptiveEntry.split(',')[0]);
      const targetUnitIndex = newUnitIndex - 1;
      const isTemplate = adaptiveEntry.split(',')[1] === 't';
      const rules = adaptiveLogic[newUnitIndex] || [];
      const adaptiveQuestionTimes: unknown[] = [];
      const adaptiveQuestions: unknown[] = [];
      const adaptiveCheckpoints: unknown[] = [];

      for (const rule of rules) {
        const result = await this.evaluate(rule, adaptiveOutcomes);
        if (!result?.conditionResult) continue;
        for (const question of result.questions || []) {
          adaptiveQuestions.push(question);
          adaptiveQuestionTimes.push(result.when);
        }
        if (result.checkpoints?.length) adaptiveCheckpoints.push(...result.checkpoints);
      }

      if (isTemplate) {
        const templateIndex = Number(currentUnit.adaptiveUnitTemplate?.[Number(adaptiveUnitIndex)] ?? adaptiveUnitIndex);
        const template = tutor.setspec?.unitTemplate?.[templateIndex];
        if (!template) {
          throw new Error(`Adaptive template index ${templateIndex} not found for adaptive target ${adaptiveEntry}.`);
        }
        tutor.unit.splice(targetUnitIndex, 0, this.buildUnit(
          template,
          adaptiveQuestionTimes,
          adaptiveQuestions,
          adaptiveCheckpoints,
        ));
        countCompletion = currentUnit.countcompletion;
      } else {
        tutor.unit[targetUnitIndex] = await this.modifyUnit(
          rules,
          tutor.unit[targetUnitIndex],
          adaptiveOutcomes,
        );
      }
    }
    return { tdfFile, countCompletion };
  }
}
