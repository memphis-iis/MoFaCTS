# Native Hotfix Dev Helpers

Scripts in this folder support the native Windows Meteor hotfix dev loop exposed through `deploy/hotfix-dev.ps1`.

Belongs here:

- Helpers required to run the local native Meteor dev server.
- Small scripts that maintain ignored local dev state needed by the hotfix loop.

Does not belong here:

- Docker image build or deployment scripts.
- Local bundle-runner scripts. Those belong under `deploy/hotfix/`.
- Generated logs, PID files, or local database content.

The hotfix dev loop is intended for fast observe/edit/reload UI and application work at `http://localhost:3200`.

On a first-time Windows machine, see `../README.md` for the Meteor tool cache and Docker Desktop checks required before `hotfix-dev.ps1 start -SettingsPath <path>` can succeed.

`ensure-commonjs-build.ps1` keeps Meteor's generated build marked as CommonJS. `ensure-local-admin.cjs` signs in through DDP after startup so the local owner/admin account exists and has the `admin` role; credentials live in ignored `../local-dev/agent-secrets.env`.
