# Local Hotfix Bundle Helpers

Scripts in this folder support the local-only production-shaped bundle loop.

Belongs here:

- Meteor bundle build helpers.
- Bundle dependency installation helpers.
- Scripts that run the generated local bundle inside the hotfix container workflow.

Does not belong here:

- Native hotfix dev server scripts. Those belong under `deploy/hotfix-dev/`.
- Release build, push, or deploy automation.
- Source patches to generated bundle output.

This workflow is for local verification only. It is not release confidence and should not replace the canonical Docker Compose image build for release validation.
