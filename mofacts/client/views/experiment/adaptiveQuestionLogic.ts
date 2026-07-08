import { meteorCallAsync, clientConsole } from "../../index";
import { KC_MULTIPLE } from "../../../common/Definitions";
import {
    buildAdaptiveOutcomes,
    evaluateAdaptiveRule,
    getAdaptiveScheduleQuestions,
    type AdaptiveOutcomeRow,
    type AdaptiveOutcomes,
} from "../../../../learning-components/units/shared/adaptiveRuleEvaluation";
import { applyAdaptiveAssessmentTemplateSchedule } from "./assessmentAdaptiveSchedule";
import {
    appendAdaptiveVideoCheckpoints,
    appendAdaptiveVideoQuestions,
    applyAdaptiveVideoTemplateSchedule,
    requireAdaptiveVideoSession,
} from "./videoAdaptiveQuestions";
import { translatePlatformString } from "../../lib/interfaceI18n";
import { getActiveUiLocale } from "../../lib/interfaceLocaleState";
declare const Session: any;
declare const Meteor: any;
declare const alert: (message?: string) => void;

export class AdaptiveQuestionLogic {  
    schedule: Array<any>;
    curUnit: any;
    when: any;
    tdfId: string;
    userId: string;


    constructor(){
        this.schedule = [];
        const curUnit = Session.get('currentTdfUnit');
        this.curUnit = curUnit || null;
        this.when = curUnit ? curUnit.adaptive : undefined;
        this.tdfId = Session.get('currentTdfId');
        this.userId = Meteor.userId();
        if (!curUnit) {
            clientConsole(2, 'adaptive - no currentTdfUnit yet; deferring adaptive setup');
        } else {
            clientConsole(2, 'adaptive - componentStates:', this.userId, this.tdfId);
        }
    }

    async setSchedule(schedule: Array<any>){
        this.schedule = schedule
    }

    async getAdaptiveOutcomes(): Promise<AdaptiveOutcomes> {
        const rows = (await meteorCallAsync('getAdaptiveOutcomeRows', this.userId, this.tdfId)) as AdaptiveOutcomeRow[];
        return buildAdaptiveOutcomes({
            rows,
            currentStimuliSet: Session.get('currentStimuliSet'),
            kcMultiple: KC_MULTIPLE,
        });
    }
    
    //translate the logic to javascript code    
    async evaluate(logicString: string, adaptiveOutcomes?: AdaptiveOutcomes){
        //logic string is a string that contains the logic to be evaluated using IF THEN logic, 
        //currentUnit is the current unit that the logic is being evaluated for

        // you may use logic operators AND, OR, NOT, and the following variables:
        // C<cluster index>S<stimulus index> - this is a stimulus that the student has seen before
        // true - this is a boolean value
        // false - this is a boolean value
        // numbers - these are numbers
        // math operators + - * / % ( ) = - these are math operators
        // CHECKPOINT - marks a question as a checkpoint for video sessions

        //This returns an object with the following properties:
        // condition: the original condition string
        // conditionExpression: the translated condition string
        // actions: the original action string
        // conditionResult: the result of the condition evaluation
        // schedule: an array of objects with the unit and question to schedule
        // checkpoints: an array of checkpoint information for questions marked with CHECKPOINT

        //we have to get the student performance history



        clientConsole(2, 'evaluate logicString:', logicString);
        const history = adaptiveOutcomes || await this.getAdaptiveOutcomes();
        const result = evaluateAdaptiveRule(logicString, history);
        if (result.conditionExpression) {
            clientConsole(2, 'conditionExpression:', result.conditionExpression);
        }
        if (result.conditionResult && result.actions) {
            clientConsole(2, 'action:', result.actions);
            this.schedule.push(...(result.schedule || []));
            clientConsole(2, 'adding to adaptive schedule - count:', this.schedule.length);
        }
        if (!result.conditionResult && !result.conditionExpression) {
            return result;
        }
        return result.conditionResult ? result : undefined;
    }
    async modifyUnit(adaptiveLogic: any[], curTdfUnit: any){
        const videoSession = requireAdaptiveVideoSession(curTdfUnit);
        if (!Array.isArray(adaptiveLogic)) {
            throw new Error(`Adaptive modifyUnit rules must be an array for unit "${curTdfUnit.unitname || ''}"`);
        }

        const allCheckpoints: any[] = [];
        const adaptiveOutcomes = await this.getAdaptiveOutcomes();
        for(const logic of adaptiveLogic){
            let ret = await this.evaluate(logic, adaptiveOutcomes);
            if (!ret || !ret.conditionResult) {
                continue;
            }
            const questions = ret.questions?.length ? ret.questions : getAdaptiveScheduleQuestions(ret.schedule || []);
            const when = ret.when;
            appendAdaptiveVideoQuestions(videoSession, questions, when, logic);
            if(ret.checkpoints && ret.checkpoints.length > 0){
                allCheckpoints.push(...ret.checkpoints);
            }
        }
        appendAdaptiveVideoCheckpoints(videoSession, allCheckpoints);
        return curTdfUnit;
    }
    unitBuilder(newUnit: any, adaptiveQuestionTimes: any[], adaptiveQuestions: any[], adaptiveCheckpoints: any[]){
        //if newunit is not defined, throw an error
        if(!newUnit){
            alert(translatePlatformString(getActiveUiLocale(), 'lesson.unitBuildFailed'));
            throw new Error('Unit template not found');
        }
        const assessmentScheduleApplied = applyAdaptiveAssessmentTemplateSchedule({
            unit: newUnit,
            schedule: this.schedule,
        });
        if(!assessmentScheduleApplied){
            applyAdaptiveVideoTemplateSchedule({
                unit: newUnit,
                schedule: this.schedule,
                adaptiveQuestionTimes,
                adaptiveQuestions,
                adaptiveCheckpoints,
            });
        }
        //injected the new unit into the session
        return newUnit;
    }
}





