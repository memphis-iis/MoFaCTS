import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import { retryParticipationSave, participationSaveFailed } from '../../lib/prolificParticipation';
import './prolificSaveError.html';
Template.prolificSaveError.helpers({ failed: participationSaveFailed, busy: () => Session.get('prolificRetryBusy') });
Template.prolificSaveError.events({ 'click button': () => retryParticipationSave() });
