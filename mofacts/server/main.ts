import "../common/Collections";
import "../common/globalHelpers";
import "./runtime/contentSecurityPolicy";
import "./runtime/userProfileWrites";
import "./runtime/progressAndSettingsWrites";
import "./lib/memphisSaml";
import "./lib/installMongoDriverUnhandledPolicy";
import { installStrictMongoReactivity } from './lib/strictMongoReactivity';

installStrictMongoReactivity();

import "./serverComposition";
import "./publications";
import "./http/health";
import "./http/pwa";
import "./http/socialPreview";
import "./http/backupArchives";
import "./http/ownHistoryDownload";
import "./http/ownedHistoryDownload";
import "./migrations/convert_delivery_settings";
import { completeStartupSurfaceRegistration } from './securitySurfaces/startupSurfaceInventory';

// Static security owners have registered by this point. The async application
// startup owner reports separately after its configuration and hooks finish.
completeStartupSurfaceRegistration('entrypoint-modules');
