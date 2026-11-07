# Protected host collector qualification review

Execution procedure and staging2 acceptance record for the reviewed V2 host
collector. The existing [host acquisition guide](host-observations.md) owns the
candidate and its source/fixture evidence; plan Section 14.2 owns this additional
qualification requirement. This procedure grants no production access.

## Scope and standing authorization

The approved staging2 security-testing scope covers a bounded test window using
its existing restricted audit SSH identity and exact sudo command. Temporarily install the reviewed V2 cohort
at the current command's fixed path, exercise the actual SSH restrictions and
observation parser/evaluator, then restore the previous V1 cohort even if the
candidate passes. The application, database configuration, credentials, firewall,
Tailscale grants, SSH keys and sudo permissions are not changed. The operator
confirmed this standing authorization before execution; a repeated approval is
not a new design decision. Publication, new integration runs and excluded actions
retain their own authorization boundaries.

During the window, the staging2 manual V1 audit reader must not be invoked: the
restricted command temporarily speaks V2. Production's scheduled V1 scanner and
original staging stay outside this operation. This keeps the test on the existing
access channel; no additional account, key or persistent access grant is proposed.

## Exact candidate and installation cohort

Candidate source: `6a7acc1e3d34a7f8cc7b65d6607d03c9cd5ae392`.
The packet is prepared from that clean Linux checkout, with file SHA-256 hashes,
ordinary Linux bytes and an allowlisted path/mode map. It contains public source
only; it must not contain settings, environment files, SSH material or data.

All destinations are root:root. The library below is
`/usr/local/libexec/mofacts-security-audit/`.

| Reviewed source | Destination | Mode |
| --- | --- | --- |
| `deploy/security-audit/host-observations.sh` | `/usr/local/sbin/mofacts-host-exposure-audit` | 0755 |
| `mofacts/common/securityAudit/catalogs/host-measurements.v1.json` | library `host-measurements.v1.json` | 0644 |
| `deploy/security-audit/host-mongo-connectivity.js` | library `host-mongo-connectivity.js` | 0644 |
| `deploy/security-audit/host-listener-policy.awk` | library `host-listener-policy.awk` | 0644 |
| `deploy/security-audit/host-firewall-policy.awk` | library `host-firewall-policy.awk` | 0644 |
| `deploy/security-audit/host-apache-policy.awk` | library `host-apache-policy.awk` | 0644 |
| `deploy/security-audit/host-sidecar-policy.jq` | library `host-sidecar-policy.jq` | 0644 |
| `deploy/security-audit/host-mongo-roles.js` | library `host-mongo-roles.js` | 0644 |
| `deploy/mongodb/read-default-concern-role.json` | library `read-default-concern-role.json` | 0644 |

## Preconditions and recovery ownership

1. Verify the operator's saved staging2 target and pinned SSH host key. Confirm
   the protected configuration's explicit public hostname is staging2, with
   synthetic/non-production resources. Do not infer identity from a banner.
2. Verify the exact candidate's supported Meteor gate before installation. Bind
   the transferred nine-file packet to the retained clean-source observation.
3. Record bounded hashes, ownership/modes and presence of the installed entry
   point and each cohort destination. Verify protected parent directories and
   the root-only configuration metadata without printing secret values.
4. Save existing cohort files and metadata into an operator-owned root-only
   recovery directory before writing any destination. Record absent destinations
   explicitly. Do not copy or rewrite the configuration, key or sudo policy.
5. Prepare and syntax-check recovery first. The operator owns the test window
   and restoration; interruption/SSH loss must restore the original command and
   cohort. A separate operator SSH session must remain usable for recovery.
6. If identity, ownership, baseline recovery or access prerequisites fail, stop
   before installation. Do not add dependencies, relax restrictions or select
   another host to get a passing result.

## Acceptance through the protected channel

- Verify installed bytes and metadata against the candidate packet before
  requesting an observation. Require the collector's exact descriptor digest.
- A no-argument restricted SSH request must produce bounded canonical V2 bytes
  that the shared Node byte parser and internal/composite evaluators accept.
  Retain only the sanitized envelope, hashes, statuses and bounded exit categories.
- Requests for a shell, another command, arguments, a PTY or forwarding must not
  acquire those capabilities. Verify actual SSH behavior; local environment-only
  rejection fixtures are not substitutes. Use bounded forwarding probes that
  neither send application requests nor leave a listener/session running.
- Keep observed failures and unavailable evidence visible. A valid envelope is
  transport/contract proof, not a promise that every host security check is green.
  Do not change permissions, credentials, services or policy to force green.
- Missing-tool/malformed/oversized and adverse policy branches remain covered by
  the accepted synthetic Linux fixtures. Do not break host tools, expose a port,
  disable authentication or mutate live records to reproduce those branches.

## Mandatory restoration

Restore original command/helper bytes and metadata on every terminal path.
Remove only exact newly added cohort destinations that were absent before, and
only if their bytes still match this candidate. An unexpected concurrent change
requires operator attention; it is not permission to overwrite or delete it.
Verify the original cohort hashes/permissions, existing restricted V1 response
shape and unchanged application container identities/liveness. Keep the small
root-only recovery copy and bounded evidence pending review.

Passing this window qualifies the exact staging2 command/cohort and rollback
only. It does not cut over the receiver, activate V2 reports, qualify an app
image, close all Phase 1 work or authorize a production installation.

## Controller and independent recovery

The optional root-operator controller is [host-qualification-window.sh](host-qualification-window.sh).
It is never added to the audit account's forced command or sudo policy. Prepare
a private `/var/tmp/mofacts-host-qualification.<12-alphanumeric>` job containing
exactly the nine candidate files under `public-source/`, `packet-manifest.json`,
`preflight.json` and `operator-controller.sh`. Pin all three metadata/controller
SHA-256 values from the local reviewed packet before execution. The manifest
contains `state`, `sourceCommit`, `nativeReceiptSha256` and the closed nine-file
`source`/`destination`/`mode`/`owner`/`sha256` map above. The baseline records each
destination's presence, SHA-256 and numeric ownership/mode/link count, the policy
fingerprints, three container identities/start times/health and explicit
configuration-target/root-only checks. Keep both documents private.

Run through the existing full operator channel, keeping a second operator session
available:

```sh
sudo bash /private/reviewed/host-qualification-window.sh run \
  "$job" "$packet_sha256" "$baseline_sha256" "$controller_sha256"
```

The controller validates the packet/baseline, seals the job root:root 0700, saves
verified previous public files, and checks unchanged shared helpers and policies.
It installs the two new files before atomically replacing the command. A
`ready.json` receipt binds the source, three digests and controller PID. Check
that receipt and the live PID before using the restricted audit identity. The
window restores on a root-created `finish` file, termination or its five-minute
deadline. Record `result.json`; both operation/restoration exits must be zero.

After an untrappable interruption, inspect the same job and process rather than
starting a second window. When the controller has stopped, recover using the
sealed root-owned copy and the same three trusted digests:

```sh
sudo bash "$job/operator-controller.sh" restore \
  "$job" "$packet_sha256" "$baseline_sha256" "$controller_sha256"
```

Recovery writes `recovery-result.json` with unknown original operation exit;
successful recovery does not turn an interrupted test into PASS. Both paths
restore the command first, remove only the exact added files and refuse to
overwrite unexpected concurrent edits. Independently read back the old cohort,
policy metadata, container identities/health and restricted V1 response. Retain
the small root-only recovery job and private receipts for review.

The ten root-Linux disposable-filesystem tests cover ordinary restoration,
deadline, TERM, killed-controller recovery, concurrent edits, partial installation
failure, and invalid packet/target/destination/shared-helper inputs. Run with
repository-pinned Node and the already-approved jq prerequisite:

```sh
node --test deploy/security-audit/tests/host-qualification-window.test.mjs
```

## Accepted staging2 window: 2026-11-07

The actual protected-channel probes ran 13:21:49Z-13:22:05Z. The controller exited
zero with restoration exit zero. Independent readback accepted at 13:23:53Z:

- All nine cohort destinations returned to their exact previous presence,
  bytes, numeric ownership/modes and link counts. The two added V2 files are absent.
- SSH/sudo policy hashes/modes and all three original container identities,
  image IDs, start times and healthy states are unchanged. No service restart,
  configuration/key/permission change or application deployment occurred.
- Normal and arbitrary-command requests returned bounded canonical V2 envelopes
  accepted by the shared current-version Node parser. The arbitrary marker was
  not executed. This fixed forced response is the existing accepted SSH behavior;
  it need not be replaced with a nonzero exit.
- PTY allocation and forwarding were denied. PTY exit 255 with the explicit
  allocation-denied diagnostic is accepted; the first local verifier incorrectly
  excluded it, then was corrected against the existing acceptance rule. The same
  saved responses passed; no second host window or Meteor invocation was used.
- All eleven internal controls evaluated PASS. The UDP host facts were accepted;
  the composite deliberately remains ERROR without fresh external evidence.
- The restored restricted V1 response passed all nine controls and matched its
  previous release receipt. V2 is not left installed or activated.

Exact coordinates:

| Evidence | SHA-256 |
| --- | --- |
| Previous V1 command | `583792b14ace328f99ea32b8d18fe138b2cbbcbe6c2bfe37fa31272578c22eb3` |
| Candidate V2 command | `ca1c1fb6997ebac3f550a34798bf33bf598a4dd04a80ecb4caa6d20d44e3634b` |
| Nine-file packet manifest | `ed152cfd3b194a0bf7196f5c575321c7f61328a4c08edd5fd43afc4841ec4b35` |
| Full preflight baseline | `815f3a8cae8eb0dea3642610e93d6012561d5568975a0d1729f6349415510c1e` |
| Tested controller | `ea56c08474508e82a6229ec695ee4053ac32a97f30435b9e21642623b954c345` |
| Normal canonical V2 observation | `aec778f57ec020bc2d7780a1e6c21b81c595f58a31889d3b33ccea7538190d7b` |
| Retained 29-file acceptance manifest | `590e6479e08308e6c9dc18e868afec138083735e4295f7c17cba0a489e5e8f23` |

Private receipts are retained in the existing operator evidence location under
`phase1-20261105/host-qualification-6a7acc1e`. Missing-tool/malformed/oversized and
adverse-policy cases use the already accepted 26 synthetic Linux cases; live
services were not broken to repeat them. This completes the protected-host part
of P1-14 and the reviewed install/rollback procedure P1-15. Staging ingestion,
previous-image compatibility, receiver cutover and production installation remain
separate unfinished gates.
