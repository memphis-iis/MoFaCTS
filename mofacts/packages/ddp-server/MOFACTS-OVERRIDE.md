# Pinned Meteor DDP server correction

This directory starts from the official Meteor 3.5 `ddp-server@3.3.0` source at
commit `3f23e5e402cf9091a4515cb94130b6a0a9ced11e` and applies the focused correction
from Meteor pull request
[#14528](https://github.com/meteor/meteor/pull/14528) for issue
[#14527](https://github.com/meteor/meteor/issues/14527).

Production exposed the upstream failure on 2026-08-05 after a Google login: a
late write-fence send reached a removed DDP session, invoked the cleared
`_pendingRemoveFunction`, and terminated the Node process. Docker then restarted
the application under its existing `unless-stopped` policy.

The pinned correction discards removed-session queues so late sends are safe
no-ops, makes an explicit server close terminate a session already in its grace
period, prevents explicitly closed sessions from resuming, clears stale
disconnect state after a successful resume, and flushes buffered messages
synchronously to preserve DDP ordering.

The upstream regression tests are retained in `livedata_server_tests.js`.
`npm run test:ci:harness` additionally verifies package selection, provenance,
and critical source invariants without pretending to execute Meteor's DDP
integration suite.

Remove this local package only after an official stable Meteor release contains
an equivalent correction and the supported full Meteor CI suite passes without
the override. Do not patch a generated application bundle or a running
production container.
