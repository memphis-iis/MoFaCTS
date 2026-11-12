# Standard operator Linux security checks

GitHub billing is unavailable for this project. The standard executor for the
four repository Security jobs is the approved operator Linux worker. No GitHub
Actions session, paid plan, AWS service or always-on server is required.
The optional GitHub Security workflow is manual-only; it is not the standard
gate and should not be dispatched while the organization is locked.

Use Linux with the Node/npm versions in `mofacts/package.json`, Git and the
existing Docker engine. The same gitleaks image as the workflow,
`ghcr.io/gitleaks/gitleaks:v8.30.1`, must already be available. The runner never
pulls or installs a missing scanner. A missing tool is a failed check, not a
passing scan. Acquire missing tools only under the project's dependency rules.

From the committed repository, using the pinned Node on PATH:

```sh
node deploy/security-audit/run-security-checks.mjs \
  "$(git rev-parse HEAD)" /absolute/operator/evidence/new-security-run
```

The evidence directory must be new, outside the checkout, and have an existing
operator-owned parent. The runner makes a private full-history clone in Linux
temporary storage and checks out only the named commit. Its own source must
match that commit. It does not run uncommitted changes, install into the operator
checkout, copy private settings, or use staging/production application volumes.
The scratch clone and its temporary dependencies are removed after execution.

The four jobs run sequentially and keep independent outcomes:

- Full-history gitleaks, with redaction and a read-only source mount.
- Source dependency installation with scripts disabled, classified surface check,
  and the existing complete source-security entry point.
- Application full/runtime locked dependency audits and the existing reviewed
  runtime/build-exposure policy.
- Mongo sidecar full/runtime locked dependency audits and the same policy owner.

Audit exit 1 supplies advisory data to the policy checker. Other execution
failures, malformed reports and policy failures remain failures. Every job must
pass; a failed job does not prevent the remaining independent jobs from running.
No dependency update or security exception is applied by this runner.

`summary.json` records commit, tool versions, job/command outcomes, timestamps and
SHA-256 hashes of the retained private logs/audit reports. The shell exit is zero
only when all four jobs pass. Keep the summary with the corresponding worklist
checkpoint and inspect failed logs privately. Do not publish raw output.

This is operator evidence, not a GitHub check or a release qualification receipt.
The GitHub evidence-acquisition adapter continues to reject missing hosted proof;
do not relabel this result as a hosted push run. Image/source qualification and
staging2 deployment acceptance retain their existing owners and requirements.
No Meteor invocation occurs, and this command consumes no Meteor allowance.
Run it for changed security inputs and before the relevant release milestone;
reuse exact unchanged evidence instead of repeating it for documentation edits.
