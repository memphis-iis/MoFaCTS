# Local Hotfix Watch Helpers

Scripts in this folder support the sole source-watching localhost application loop.

Belongs here:

- The CommonJS build guard required by Meteor/Rspack watch mode.
- The local admin bootstrap used after the watcher becomes ready.

Does not belong here:

- A second native or containerized localhost application server.
- Release build, push, or deploy automation.
- Source patches to generated bundle output.

This workflow owns the only supported localhost application server. Run it
through `deploy/hotfix-local.ps1`; that script owns the native Meteor/Rspack
watcher while Docker owns MongoDB. Do not introduce another application process
or Compose overlay for port 3200. It is local verification, not release confidence.
