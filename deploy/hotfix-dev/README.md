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
