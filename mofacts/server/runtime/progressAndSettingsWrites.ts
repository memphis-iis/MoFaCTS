import { GlobalExperimentStates, DynamicSettings } from '../../common/Collections';
import { registerDirectWriteDenial } from '../securitySurfaces/registerDirectWriteDenial';

// The browser saves progress through the authorized experiment-state methods.
registerDirectWriteDenial(GlobalExperimentStates, 'progress');

// Settings changes use administrator-authorized server methods.
registerDirectWriteDenial(DynamicSettings, 'settings');
