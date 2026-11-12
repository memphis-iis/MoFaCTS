# Read-only deployment image observation

`qualification/observeDeploymentImage.mjs` uses the existing operator SSH key
and pinned host trust. It reads fixed `mofacts` container metadata, reads that
image's platform/revision/graph reference, streams its archive through the
shared graph reader, and rechecks the same container before accepting identity.
It installs nothing, makes no application requests, executes no code inside
the app container, reads no runtime environment or learner records, and writes
no release authority or host receipt. Production execution requires explicit
authorization; staging2 standing permission does not cover production.

On Windows the restricted SSH environment must retain `ProgramData` as well as
the existing OS/runtime path variables. Windows OpenSSH otherwise exits 255
silently even for local `ssh -G`. The native regression uses configuration
expansion with `-F none` and no network connection. Application/provider secrets
remain excluded from the child environment.

## Recorded production attempt (2026-11-12)

The operator approved one read-only observation. Initial local OpenSSH startup
failed because of the missing OS variable; the corrected helper passed both
fixed production metadata reads. Archive validation did not complete and no
running-image fingerprint was accepted. The final diagnostic lasted 123.27
seconds from script preparation, consistent with the 120-second stream deadline.
The trace has no retained byte counter or archive failure category, so that
timing alone does not prove the precise archive failure. No stream bytes or
image layers were retained, no comparison against the authority was completed,
and no release record was changed. See the current audit ledger for private
content-free trace locations and verification results.

## Bounded follow-up approved 2026-11-12

Phil approved one follow-up observation with an explicit ten-minute image
stream budget. Keep the existing two-minute default for other callers and the
same fixed metadata commands, strict SSH trust, two-GiB archive bound,
32-MiB retained-metadata bound and 4,096-entry limit. Keep image layers discarded.
Do not replace graph validation with a tag, engine reference or guessed config.

The shared stream now accepts validated `streamOptions` through the deployment
observer. The default remains 120,000 ms; only the explicitly approved operator
call selects 600,000 ms. Budgets above that fail before SSH. The optional
synchronous diagnostic callback receives only category, budget/elapsed time,
byte counts, exit code and confirmation that the owned process terminated:

```js
await observeDeploymentImage({ sshHost, sshKey, knownHosts,
  streamOptions: { timeoutMs: 600000, onDiagnostic: row => { diagnostic = row; } },
});
```

The measured stream preserves backpressure and the original graph reader's
limits. Diagnostics never retain stderr, image content, credentials or settings.
Regression tests cover default/explicit budgets, exact identity, owned-process
deadline cleanup, archive rejection, process failure, stderr bounds and invalid
options before launch. Run required lint and Windows/Linux regressions before
the one production execution. If the approved attempt fails, retain
the failed result and stop; do not increase limits or repeat production reads
again automatically. Production recording/deployment remain separately excluded.
