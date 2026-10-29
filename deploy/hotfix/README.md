# Local Hotfix Watch Helpers

`deploy/hotfix-local.ps1` manages the single Linux Docker Meteor/Rspack watcher
at http://localhost:3200. `docker-compose.local.yml` replaces the production
application service with this watcher; MongoDB and replica-set initialization
remain Compose-owned. No host Meteor installation or production image build is
required. Docker must use its Linux engine.

`watch-linux.sh` selects the pinned Meteor release and asserts Node/npm/Undici
versions before installing locked dependencies. Docker volumes own Linux npm
dependencies, Meteor tools and build caches. Host dependency and generated-cache
directories are never copied into these volumes. Private settings are mounted
read-only, and existing local data remains under `deploy/local-data`.

Meteor and Rspack own source watching and automatic reload. Polling supports
Docker Desktop bind mounts. Do not patch generated bundles, touch source in a
custom rebuild loop, or run a second localhost application.

The manager requires stable authenticated MongoDB primary readiness before
starting, then checks app health, the executable browser bundle, HMR and active
Change Streams. The existing local-admin bootstrap runs inside the container.
Startup failures remain visible; there is no automatic restart loop. Use the
same manager's start, restart, stop, status and logs actions. Logs are bounded
by Docker rotation; stop preserves database data and development caches.

This is local verification. Production builds, pushes and deployments still
require separate authorization and the canonical release workflow.
