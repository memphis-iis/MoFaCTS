import { meteorCallAsync, clientConsole } from "../../index";
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

    private getScheduleQuestions(schedule: any[]): number[] {
        return (schedule || []).map((item) => {
            const clusterIndex = Number(item?.clusterIndex);
            if (!Number.isInteger(clusterIndex)) {
                throw new Error('Adaptive rule produced a scheduled question without a valid clusterIndex');
            }
            return clusterIndex;
        });
    }

    private appendAdaptiveCheckpoints(videoSession: any, checkpoints: any[]) {
        if (videoSession.checkpointBehavior !== 'adaptive' || checkpoints.length === 0) {
            return;
        }
        if (!Array.isArray(videoSession.checkpoints)) {
            videoSession.checkpoints = [];
        }
        for (const checkpoint of checkpoints) {
            const checkpointTime = Number(checkpoint?.time);
            if (!Number.isFinite(checkpointTime)) {
                throw new Error('Adaptive checkpoint is missing a valid time');
            }
            const exists = videoSession.checkpoints.some((existing: any) =>
                Number(existing?.time) === checkpointTime
            );
            if (!exists) {
                videoSession.checkpoints.push({time: checkpointTime});
            }
        }
        videoSession.checkpoints.sort((a: any, b: any) => Number(a.time) - Number(b.time));
    }
    
    //translate the logic to javascript code    
    async evaluate(logicString: string){
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
        const operators: Record<string, string> = {
            "NOT": "!",
            "AND": "&&",
            "OR": "||"
        };

        //remove the IF prefix and split on keyword THEN. Before then is the condition, after then is the action
        //if parts
        const [, whenSegment = ''] = logicString.split("AT");
        let when = logicString.includes("AT") ? parseInt(whenSegment.trim()) : null;
        let isCheckpoint = logicString.includes("CHECKPOINT");
        let parts = logicString.replace("IF", "").replace("AT", "").replace("CHECKPOINT", "").split("THEN");
        let condition = (parts[0] ?? '').trim();
        let actions = (parts[1] ?? '').trim();

        //if condition or action is empty, return
        if(!condition || !actions){
            return {condition: condition, action: actions, conditionResult: false};
        }

        //tokenize the condition
        let conditionTokens = condition.split(" ");


        //translate the condition
        let conditionExpression = "";
        // Allowed math operators
        const mathOperators = "+-*/%()=";

        const history = (await meteorCallAsync('getOutcomesForAdaptiveLearning', this.userId, this.tdfId)) as any[];

        for(const token of conditionTokens){
            if(operators[token]){
                conditionExpression += operators[token];
            } else if (token.toLowerCase() === "true"){
                conditionExpression += "true";
            } else if (token.toLowerCase() === "false"){
                conditionExpression += "false";
            } else if (token.startsWith("C")){
                //the format for this is C<cluster index>S<stimulus index>
                const [, tokenBody = ''] = token.split("C");
                const [clusterPart = '', stimulusPart = ''] = tokenBody.split("S");
                let clusterIndex = parseInt(clusterPart);
                let stimulusIndex = parseInt(stimulusPart);
                //get the performance for this cluster and stimulus
                clientConsole(2, 'getting component state for cluster:', clusterIndex, 'stimulus:', stimulusIndex, history[stimulusIndex]);
                let outcome = history[clusterIndex];
                //if the outcome is 1, lastOutcome is true, otherwise false
                clientConsole(2, 'lastOutcome for ' + token + ':', outcome);
                conditionExpression += outcome;
            } else if (Number.isInteger(parseInt(token))){
                conditionExpression += token;
            } else {
                //loop through each character in the token, if it is a math operator, add it to the expression. Otherwise, throw an error
                for(const char of token){
                    if(mathOperators.includes(char)){
                        conditionExpression += char;
                    } else if (Number.isInteger(parseInt(char))){
                        conditionExpression += char;
                    } else {
                        throw new Error(`Invalid token: ${token}`);
                    }
                }
            }
        }

        clientConsole(2, 'conditionExpression:', conditionExpression);


        //build a new function that will be called to evaluate the condition
        let conditionFunction: Function | null = new Function(`return ${conditionExpression}`);

        //evaluate the condition
        let conditionResult = conditionFunction();

        //destroy the function
        conditionFunction = null;

        //if the condition is false, end the function. Otherwise, evaluate the action
        if(!conditionResult){
            return;
        }

        //the action can be either a single action as a string or an array of actions. To check, we will find if parenthesis are present
        clientConsole(2, 'action:', actions);

        const addToschedule: any[] = [];
        const questions: any[] = [];
        const checkpoints: any[] = [];
        
        ///check if there are parenthesis, if so interpret as an array of actions
        if(actions.includes("(")){
            let startIndex = actions.indexOf("(");
            let endIndex = actions.indexOf(")");
            let actionsString = actions.substring(startIndex + 1, endIndex);
            //add each action to the schedule
            for(const action of actionsString.split(",")){
                //the format is C<cluster index>S<stimulus index>, we add these to the schedule 
                if(action.startsWith("C")){
                    const [, actionBody = ''] = action.split("C");
                    const [clusterPart = '', stimulusPart = ''] = actionBody.split("S");
                    let KCI = parseInt(clusterPart);
                    let stimulusIndex = parseInt(stimulusPart);
                    //if the outcome is string "correct", it is true, otherwise false
                    addToschedule.push({
                        clusterIndex: KCI,
                        stimIndex: stimulusIndex,
                        isCheckpoint: isCheckpoint
                    });
                    questions.push(KCI);
                    if (isCheckpoint && when !== null) {
                        checkpoints.push({
                            clusterIndex: KCI,
                            stimIndex: stimulusIndex,
                            time: when
                        });
                    }
                    clientConsole(2, 'adding to adaptive schedule - count:', addToschedule.length);
                } else {
                    //throw an error if the action is not a valid action
                    throw new Error(`Invalid action: ${action}`);
                }
            }
        } else {
            //the action is a single action
            if(actions.startsWith("C")){
                const [, actionBody = ''] = actions.split("C");
                const [clusterPart = '', stimulusPart = ''] = actionBody.split("S");
                let clusterIndex = parseInt(clusterPart);
                let stimulusIndex = parseInt(stimulusPart);
                //if the outcome is string "correct", it is true, otherwise false
                addToschedule.push({
                    clusterIndex: clusterIndex,
                    stimIndex: stimulusIndex,
                    isCheckpoint: isCheckpoint
                });
                questions.push(clusterIndex);
                if (isCheckpoint && when !== null) {
                    checkpoints.push({
                        clusterIndex: clusterIndex,
                        stimIndex: stimulusIndex,
                        time: when
                    });
                }
                clientConsole(2, 'adding to adaptive schedule - count:', addToschedule.length);
            } else {
                //throw an error if the action is not a valid action
                throw new Error(`Invalid action: ${actions}`);
            }
        }
        this.schedule.push(...addToschedule);
        return {condition: condition, conditionExpression: conditionExpression, actions: actions, conditionResult: conditionResult, questions: questions, schedule: addToschedule, when: when, checkpoints: checkpoints};
    }
    async modifyUnit(adaptiveLogic: any[], curTdfUnit: any){
        if (!curTdfUnit) {
            throw new Error('Adaptive modifyUnit target unit is missing');
        }
        if (!curTdfUnit.videosession) {
            throw new Error(`Adaptive modifyUnit only supports video-session targets; unit "${curTdfUnit.unitname || ''}" has no videosession`);
        }
        if (!Array.isArray(adaptiveLogic)) {
            throw new Error(`Adaptive modifyUnit rules must be an array for unit "${curTdfUnit.unitname || ''}"`);
        }

        const videoSession = curTdfUnit.videosession;
        if (!Array.isArray(videoSession.questions)) {
            videoSession.questions = [];
        }
        if (!Array.isArray(videoSession.questiontimes)) {
            videoSession.questiontimes = [];
        }

        const allCheckpoints: any[] = [];
        for(const logic of adaptiveLogic){
            let ret = await this.evaluate(logic);
            if (!ret || !ret.conditionResult) {
                continue;
            }
            const questions = ret.questions?.length ? ret.questions : this.getScheduleQuestions(ret.schedule || []);
            const when = ret.when;
            if (questions.length > 0 && (when === null || when === undefined || !Number.isFinite(Number(when)))) {
                throw new Error(`Adaptive video rule "${logic}" produced questions without a valid AT time`);
            }
            for (const question of questions) {
                const clusterIndex = Number(question);
                if (!Number.isInteger(clusterIndex)) {
                    throw new Error(`Adaptive video rule "${logic}" produced an invalid question index`);
                }
                videoSession.questions.push(clusterIndex);
                videoSession.questiontimes.push(Number(when));
            }
            if(ret.checkpoints && ret.checkpoints.length > 0){
                allCheckpoints.push(...ret.checkpoints);
            }
        }
        this.appendAdaptiveCheckpoints(videoSession, allCheckpoints);
        return curTdfUnit;
    }
    unitBuilder(newUnit: any, adaptiveQuestionTimes: any[], adaptiveQuestions: any[], adaptiveCheckpoints: any[]){
        //if newunit is not defined, throw an error
        if(!newUnit){
            alert(`There was an error building the unit. Please contact the administrator`);
            throw new Error('Unit template not found');
        }
        if(newUnit.assessmentsession){
            newUnit.assessmentsession.clusterlist = ""
            for(const item of this.schedule){
                let cluster = item.clusterIndex;
                newUnit.assessmentsession.clusterlist += cluster + " ";
            }
            newUnit.assessmentsession.clusterlist = newUnit.assessmentsession.clusterlist.trim();
        } else if (newUnit.videosession) {
            const questionTimes = newUnit.videosession.questiontimes;
            const sortedSchedule = this.schedule.sort((a: any, b: any) => questionTimes[a.clusterIndex] - questionTimes[b.clusterIndex]);

            if(!newUnit.videosession.questions){
                newUnit.videosession.questions = [];
            }
            if(!newUnit.videosession.questiontimes){
                newUnit.videosession.questiontimes = [];
            }
            if(adaptiveQuestions){
                newUnit.videosession.questions.push(...adaptiveQuestions);
            }
            else {
                for(const item of sortedSchedule){
                    newUnit.videosession.questions.push(item.clusterIndex)
                }
            }
            newUnit.videosession.questiontimes.push(...adaptiveQuestionTimes)
            
            this.appendAdaptiveCheckpoints(newUnit.videosession, adaptiveCheckpoints || []);
        }
        //injected the new unit into the session
        return newUnit;
    }
}





