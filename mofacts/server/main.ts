import "../common/Collections";
import "../common/globalHelpers";
import "./runtime/contentSecurityPolicy";
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
import "./http/securityAudits";
import "./http/ownHistoryDownload";
import "./migrations/convert_delivery_settings";
