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
