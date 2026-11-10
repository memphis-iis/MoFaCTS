// Explicit inert-V2 source gate: retain existing coverage and include the new
// producer/acquisition contracts. Active V1 does not select this entry point.
import './source-security.test.mjs';
import './tests/externalV2.test.mjs';
import './tests/repositoryV2.test.mjs';
import './tests/repositoryCommandV2.test.mjs';
import './tests/repositoryAcquireV2.test.mjs';
import './tests/clientBundleCanariesV2.test.mjs';
import './tests/repositorySourceV2.test.mjs';
import './tests/repositoryImageV2.test.mjs';
import './tests/repositoryProducerFilesV2.test.mjs';
import './tests/authorizationOutcomes.test.mjs';
import './tests/legacyProbeInventory.test.mjs';
import './tests/reportFilesV2.test.mjs';
import './tests/reportAdminPresentationV2.test.mjs';
